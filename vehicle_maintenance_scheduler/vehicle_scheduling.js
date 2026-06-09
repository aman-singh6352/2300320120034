import { Log } from '../login_middleware/log_middleware.js';

const DEPOT_URL = "http://4.2.24.186.213/evaluation-service/depots";
const VEHICLE_URL = "http://4.2.24.186.213/evaluation-service/vehicles";

function solveKnapsack(tasks, maxHours) {
    const n = tasks.length;
    const dp = [];
    
    for (let i = 0; i <= n; i++) {
        dp.push(new Array(maxHours + 1).fill(0));
    }

    for (let i = 1; i <= n; i++) {
        const currentTask = tasks[i - 1];
        const cost = currentTask.Duration;
        const reward = currentTask.Impact;

        for (let h = 0; h <= maxHours; h++) {
            if (cost <= h) {
                dp[i][h] = Math.max(dp[i - 1][h], dp[i - 1][h - cost] + reward);
            } else {
                dp[i][h] = dp[i - 1][h];
            }
        }
    }

    let remainingHours = maxHours;
    const chosenTasks = [];
    
    for (let i = n; i > 0; i--) {
        if (dp[i][remainingHours] !== dp[i - 1][remainingHours]) {
            const selectedItem = tasks[i - 1];
            chosenTasks.push(selectedItem);
            remainingHours -= selectedItem.Duration;
        }
    }

    return {
        totalScore: dp[n][maxHours],
        items: chosenTasks.reverse()
    };
}

async function startSchedulingPipeline() {
    const currentPkg = "middleware"; 

    await Log("backend", "info", currentPkg, "Starting the vehicle optimization script.");

    try {
        const requestSettings = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        await Log("backend", "info", currentPkg, "Fetching required depot and vehicle endpoints.");
        
        const [depotReq, vehicleReq] = await Promise.all([
            fetch(DEPOT_URL, requestSettings),
            fetch(VEHICLE_URL, requestSettings)
        ]);

        if (!depotReq.ok || !vehicleReq.ok) {
            throw new Error(`API error. Depot status: ${depotReq.status}, Vehicle status: ${vehicleReq.status}`);
        }

        const depotData = await depotReq.json();
        const vehicleData = await vehicleReq.json();

        const cleanDepotList = depotData.depots;
        const cleanTaskList = vehicleData.vehicles;

        await Log("backend", "info", currentPkg, `Data loaded. Depots: ${cleanDepotList.length}, Tasks: ${cleanTaskList.length}`);

        const resultsMap = {};

        for (let d = 0; d < cleanDepotList.length; d++) {
            const targetDepot = cleanDepotList[d];
            const maxCapacity = targetDepot.MechanicHours;

            await Log("backend", "info", currentPkg, `Running optimization logic for depot ID: ${targetDepot.ID}`);

            const optimizationResult = solveKnapsack(cleanTaskList, maxCapacity);

            resultsMap[targetDepot.ID] = {
                depotId: targetDepot.ID,
                hourLimit: maxCapacity,
                totalImpactScore: optimizationResult.totalScore,
                totalJobsAssigned: optimizationResult.items.length,
                assignedJobs: optimizationResult.items
            };

            await Log("backend", "info", currentPkg, `Completed allocation process for Depot ID: ${targetDepot.ID}. Total Score: ${optimizationResult.totalScore}`);
        }

        await Log("backend", "info", currentPkg, "Optimization scheduling routine completed successfully.");

    } catch (err) {
        await Log("backend", "error", currentPkg, `Critical process failure: ${err.message}`);
        console.error("Scheduler process crashed unexpectedly:", err);
    }
}

startSchedulingPipeline();