import { bootstrap } from "@flutchai/flutch-sdk";
import { LedgerGraphModule } from "./ledger-graph.module";

bootstrap(LedgerGraphModule).catch(err => {
  console.error("Fatal error starting Ledger graph service:", err);
  process.exit(1);
});
