import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BuilderRegistryService } from "@flutchai/flutch-sdk";
import { SupportGraphModule } from "./graph/graph.module";
import { SupportGraphV1Builder } from "./graph/versions/v1.0.0/builder";

const logger = new Logger("AgenticSupportGraphModule");

/**
 * Main application module for Agentic Support Graph 2025
 *
 * Configures the multi-agent support system with:
 * - Environment configuration
 * - Graph modules and services
 * - Database connections (if needed)
 * - Monitoring and health checks
 */
@Module({
  imports: [
    // Configuration management
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.local"],
    }),

    // Main graph module
    SupportGraphModule,
  ],
  controllers: [],
  providers: [],
  exports: [ConfigModule, SupportGraphModule],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly graphBuilder: SupportGraphV1Builder,
    private readonly builderRegistry: BuilderRegistryService
  ) {}

  async onModuleInit() {
    // Register the graph builder
    this.builderRegistry.registerBuilder(this.graphBuilder);
    logger.log(
      "Registered SupportGraphV1Builder with graph type: " +
        this.graphBuilder.graphType
    );

    logger.log("=".repeat(60));
    logger.log("🚀 FLUTCH SUPPORT GRAPH SERVICE INITIALIZED");
    logger.log("=".repeat(60));
    logger.log("📊 Architecture: Multi-Agent Support System");
    logger.log("🤖 Graph API: /generate, /stream");
    logger.log("📈 Monitoring: /health, /registry");
    logger.log(`🎯 Graph Type: ${this.graphBuilder.graphType}`);
    logger.log("=".repeat(60));
  }
}
