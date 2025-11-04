import { bootstrap } from "@flutchai/flutch-sdk";
import { SimpleModule } from "./simple.module";

bootstrap(SimpleModule).catch(err => {
  console.error("Fatal error starting Simple graph service:", err);
  process.exit(1);
});
