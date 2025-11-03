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
import { LedgerGraphModule } from "./ledger-graph.module";

async function startLedgerGraphService() {
  return await bootstrap(LedgerGraphModule, {
    port: parseInt(process.env.PORT || "3011", 10),
  });
}

if (require.main === module) {
  startLedgerGraphService().catch(err => {
    console.error("Fatal error starting Ledger graph service:", err);
    process.exit(1);
  });
}

export { startLedgerGraphService };
