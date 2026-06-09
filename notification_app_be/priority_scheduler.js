import { Log } from '../login_middleware/log_middleware.js';

const NOTIFICATION_API_URL = "http://4.2.24.186.213/evaluation-service/notifications";
const MODULE_NAME = "controller";

function computePriorityScore(item) {
    let typeWeight = 1;
    const cleanType = String(item.Type).trim().toLowerCase();

    if (cleanType === 'placement') {
        typeWeight = 3;
    } else if (cleanType === 'result') {
        typeWeight = 2;
    }

    const recencyTime = new Date(item.Timestamp).getTime();

    return (typeWeight * 10000000000000) + recencyTime;
}

async function processPriorityInbox() {
    await Log("backend", "info", MODULE_NAME, "Initializing Priority Inbox calculation cycles.");

    try {
        const fetchSettings = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        await Log("backend", "info", MODULE_NAME, "Fetching streaming payloads from protected API.");
        const response = await fetch(NOTIFICATION_API_URL, fetchSettings);

        if (!response.ok) {
            throw new Error(`Failed to secure network stream. Server status: ${response.status}`);
        }

        const rawData = await response.json();
        const notificationItems = rawData.notifications;

        await Log("backend", "info", MODULE_NAME, `Stream parsed successfully. Unsorted pool count: ${notificationItems.length}`);

        const evaluatedCollection = [];
        for (let i = 0; i < notificationItems.length; i++) {
            const item = notificationItems[i];
            const score = computePriorityScore(item);
            
            evaluatedCollection.push({
                originalItem: item,
                computedScore: score
            });
        }

        evaluatedCollection.sort((a, b) => b.computedScore - a.computedScore);

        const topTenNotifications = evaluatedCollection.slice(0, 10).map(node => node.originalItem);

        await Log("backend", "info", MODULE_NAME, "Priority Inbox analysis cycle completed successfully.");

    } catch (error) {
        await Log("backend", "error", MODULE_NAME, `Priority processor broken at cycle runtime: ${error.message}`);
        console.error("Scheduler process crashed unexpectedly:", error);
    }
}

processPriorityInbox();