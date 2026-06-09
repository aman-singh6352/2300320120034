async function Log(stack, level, package_name, message) {
    const TEST_SERVER_URL = "http://4.224.186.213/evaluation-service/logs";

    const requestBody = {
        stack: stack,
        level: level,
        package: package_name,
        message: message
    };

    try {
        const response = await fetch(TEST_SERVER_URL, {
            method: 'POST',
            headers:{
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            console.error(`Failed to send log to server. Status: ${response.status}`);
            return null;
        }

        const responseData = await response.json();
        return responseData;

    } catch (error) {
        console.error("Error transmitting log payload to Test Server:", error);
        return null;
    }
}

export { Log };