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
import { SimpleModule } from "./simple.module";

async function startSimpleGraphService() {
  // Use bootstrap with automatic port selection
  // Default port 3010, but will find available port if busy
  return await bootstrap(SimpleModule, {
    port: parseInt(process.env.PORT || "3010", 10),
  });
}

if (require.main === module) {
  startSimpleGraphService().catch(err => {
    console.error("Fatal error starting Simple graph service:", err);
    process.exit(1);
  });
}

export { startSimpleGraphService };
