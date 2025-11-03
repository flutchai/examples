import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BuilderRegistryService } from "@flutchai/flutch-sdk";

// Import the simplified modules
import { DatabaseModule } from "./common/database.module";
import { ServiceModule } from "./service/service.module";
import { GraphModule } from "./graph/graph.module";
import { LedgerUIController } from "./ui/ledger.ui-endpoints";
import { LedgerV1Builder } from "./graph/versions";

const logger = new Logger("LedgerGraphModule");

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),

    // Database infrastructure
    DatabaseModule,

    // Business logic module
    ServiceModule,

    // Graph orchestration module
    GraphModule,
  ],
  controllers: [LedgerUIController],
  providers: [],
  exports: [ConfigModule, DatabaseModule, ServiceModule, GraphModule],
})
export class LedgerGraphModule implements OnModuleInit {
  constructor(
    private readonly builder: LedgerV1Builder,
    private readonly builderRegistry: BuilderRegistryService
  ) {}

  async onModuleInit() {
    this.builderRegistry.registerBuilder(this.builder);
    logger.log(
      `Registered LedgerV1Builder with graph type: ${this.builder.graphType}`
    );
    logger.log("=".repeat(60));
    logger.log("🚀 LEDGER GRAPH SERVICE INITIALIZED");
    logger.log("=".repeat(60));
    logger.log("📊 Architecture: Simplified Modular Structure");
    logger.log("💼 Service API: /ledger/*");
    logger.log("🔄 Graph API: /process-ledger, /test");
    logger.log("📈 Monitoring: /health, /metrics");
    logger.log("=".repeat(60));
  }
}

/**
 * Root Ledger Graph Module
 *
 * Combines business logic and workflow orchestration modules.
 *
 * Architecture:
 * ┌─────────────────────────────────────────┐
 * │           LedgerGraphModule             │
 * │  ┌─────────────┐  ┌─────────────────┐   │
 * │  │ LedgerModule│  │ WorkflowModule  │   │
 * │  │(Business)   │  │(Orchestration)  │   │
 * │  │             │  │                 │   │
 * │  │ - Accounts  │  │ - Graph Builder │   │
 * │  │ - Journals  │  │ - Workflow Nodes│   │
 * │  │ - Trans.    │  │ - State Mgmt    │   │
 * │  └─────────────┘  └─────────────────┘   │
 * └─────────────────────────────────────────┘
 *
 * Benefits:
 * ✅ Clear separation of concerns
 * ✅ Business logic independent of workflow
 * ✅ Both APIs available simultaneously
 * ✅ Testable components
 * ✅ Scalable architecture
 */
