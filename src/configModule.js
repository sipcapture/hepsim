/**
 * Load configuration from a JSON file.
 * @returns {Promise<{virtualInfrastructure: object}>}
 */
async function loadConfig() {
    console.log("Loading configuration...");
    try {
        let fileDescriptor = await Bun.file('./config.json');
        if (await fileDescriptor.exists()) {
            let configContent = await fileDescriptor.text();
            console.log("Using configuration:", JSON.parse(configContent));
            return JSON.parse(configContent);
        } else if (await Bun.file('./config.json.example').exists()) {
            let exampleFileDescriptor = await Bun.file('./config.json.example');
            let exampleContent = await exampleFileDescriptor.text();
            console.log("Using example configuration:", JSON.parse(exampleContent));
            let config = JSON.parse(exampleContent);
            if (!config.find(s => s.name === "normal")) {
                throw new Error("Configuration must include a 'normal' session type.");
            }
            return config;
        } else {
            throw new Error("Configuration file not found.");
        }
    } catch (error) {
        console.error("Error loading configuration:", error);
        throw new Error("Configuration could not be loaded.");
    }
}


export default loadConfig;