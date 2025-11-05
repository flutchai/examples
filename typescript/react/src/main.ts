import { bootstrap } from "@flutchai/flutch-sdk";
import { ReactGraphModule } from "./react.module";

bootstrap(ReactGraphModule).catch((err) => {
  console.error("Fatal error starting ReAct graph service:", err);
  process.exit(1);
});
