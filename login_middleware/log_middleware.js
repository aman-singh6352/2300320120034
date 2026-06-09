const ALLOWED_STACKS = new Set(["backend", "frontend"]);
const ALLOWED_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

const BACKEND_PACKAGES = new Set(["cache", "controller", "cron_job", "db", "domain", "handler", "repository", "route", "service"]);
const FRONTEND_PACKAGES = new Set(["api", "component", "hook", "page", "state", "style"]);
const SHARED_PACKAGES = new Set(["auth", "config", "middleware", "utils"]);

async function Log(stack, level, packageName, message) {
    const LOG_API_URL = "http://4.2.24.186.213/evaluation-service/logs"; 

    const cleanStack = String(stack).toLowerCase();
    const cleanLevel = String(level).toLowerCase();
    const cleanPackage = String(packageName).toLowerCase();

    if (!ALLOWED_STACKS.has(cleanStack)) {
        console.error(`Validation Error: Invalid stack value "${cleanStack}"`);
        return null;
    }
    if (!ALLOWED_LEVELS.has(cleanLevel)) {
        console.error(`Validation Error: Invalid level value "${cleanLevel}"`);
        return null;
    }

    let isValidPackage = SHARED_PACKAGES.has(cleanPackage);
    if (!isValidPackage && cleanStack === "backend") isValidPackage = BACKEND_PACKAGES.has(cleanPackage);
    if (!isValidPackage && cleanStack === "frontend") isValidPackage = FRONTEND_PACKAGES.has(cleanPackage);

    if (!isValidPackage) {
        console.error(`Validation Error: "${cleanPackage}" is not permitted for stack "${cleanStack}"`);
        return null;
    }

    const payload = {
        stack: cleanStack,
        level: cleanLevel,
        package: cleanPackage,
        message: message
    };

    try {
        const response = await fetch(LOG_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Log endpoint rejected request. Status: ${response.status}`);
            return null;
        }

        // Returns { logID: "...", message: "log created successfully" }
        return await response.json();

    } catch (err) {
        console.error("Log tracking service failed completely:", err);
        return null;
    }
}

export { Log };