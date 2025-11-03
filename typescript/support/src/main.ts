// Redis mock setup for development BEFORE any other imports
if (
  process.env.NODE_ENV === "development" &&
  !process.env.KUBERNETES_SERVICE_HOST
) {
  console.log("[REDIS_MOCK] Intercepting ioredis requires for development");
  const Module = require("module");
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function (...args: any[]) {
    if (args[0] === "ioredis") {
      console.log("[REDIS_MOCK] Redirecting ioredis to ioredis-mock");
      return originalRequire.apply(this, ["ioredis-mock"]);
    }
    return originalRequire.apply(this, args);
  };
}

import { bootstrap } from "@flutchai/flutch-sdk";
import { AppModule } from "./app.module";

async function startAgenticSupportGraphService() {
  // Use bootstrap with automatic port selection
  // Default port 3004, but will find available port if busy
  return await bootstrap(AppModule, {
    port: parseInt(process.env.PORT || "3004", 10),
  });
}

if (require.main === module) {
  startAgenticSupportGraphService().catch(err => {
    console.error("Fatal error starting Agentic Support Graph service:", err);
    process.exit(1);
  });
}

export { startAgenticSupportGraphService };
