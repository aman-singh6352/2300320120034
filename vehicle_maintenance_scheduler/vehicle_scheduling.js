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
