import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import mongoose, { Connection } from "mongoose";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { SimpleV1Builder, SimpleV2Builder } from "./versions";
import { SimpleTokens } from "./simple.tokens";
import { LLMInitializer, ModelInitializer } from "@flutchai/flutch-sdk";
import * as Nodes from "./nodes";
import { McpRuntimeClient } from "./clients/mcp-runtime.client";
import { ToolCatalogClient } from "./services/tool-catalog.client";
import {
  BaseGraphServiceController,
  BuilderRegistryService,
  UniversalGraphModule,
  GraphEngineType,
} from "@flutchai/flutch-sdk";
import { ENV_CONFIG } from "./config/environment.config";

const logger = new Logger("SimpleModule");

/**
 * Simple graph module with versioning support
 * Self-contained service with own controller and dependencies
 */
@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),
    // Use lightweight graph service without callbacks
    UniversalGraphModule.forRoot({
      engineType: GraphEngineType.LANGGRAPH,
      versioning: [
        {
          baseGraphType: "flutch.simple",
          versions: [
            {
              version: "1.0.0",
              builderClass: SimpleV1Builder,
            },
            {
              version: "2.0.0",
              builderClass: SimpleV2Builder,
              isDefault: true,
            },
          ],
          defaultVersionStrategy: "explicit",
        },
      ],
    }),
  ],
  controllers: [BaseGraphServiceController],
  providers: [
    // LLM initialization (backwards compatibility)
    LLMInitializer,
    // New model initializer
    ModelInitializer,

    // MCP Runtime Client
    McpRuntimeClient,

    // Tool Catalog Client
    ToolCatalogClient,

    // Version builders
    SimpleV1Builder,
    SimpleV2Builder,

    // Shared nodes (used by all versions)
    {
      provide: SimpleTokens.GENERATE_NODE,
      useClass: Nodes.GenerateNode,
    },

    // MongoDB connection
    {
      provide: "MONGO_CONNECTION",
      useFactory: async (): Promise<Connection> => {
        const mongoUri = ENV_CONFIG.database.mongoUri;
        logger.log(
          `Connecting to MongoDB: ${mongoUri?.substring(0, 50) + "..."}`
        );
        try {
          await mongoose.connect(mongoUri, {
            dbName: ENV_CONFIG.database.dbName,
          });
          return mongoose.connection;
        } catch (error) {
          logger.error("Failed to connect to MongoDB", error as Error);
          throw error;
        }
      },
    },

    // CHECKPOINTER - using MongoDB connection
    {
      provide: "CHECKPOINTER",
      useFactory: async (connection: Connection) => {
        // Get raw MongoClient from Mongoose connection
        const mongoClient = connection.getClient();

        logger.log("Creating CHECKPOINTER for simple graph");
        return new MongoDBSaver({
          client: mongoClient,
          dbName: ENV_CONFIG.database.dbName,
          checkpointCollectionName: "checkpoints",
          checkpointWritesCollectionName: "checkpoint_writes",
        });
      },
      inject: ["MONGO_CONNECTION"],
    },
  ],
  exports: [ConfigModule],
})
export class SimpleModule implements OnModuleInit {
  /**
   * Self-contained graph service with automatic versioning
   * Builders are now registered automatically via UniversalGraphModule versioning config
   */
  constructor(
    private readonly simpleV1Builder: SimpleV1Builder,
    private readonly simpleV2Builder: SimpleV2Builder,
    private readonly builderRegistry: BuilderRegistryService
  ) {}

  async onModuleInit() {
    // Register the graph builders (following support graph pattern)
    this.builderRegistry.registerBuilder(this.simpleV1Builder);
    this.builderRegistry.registerBuilder(this.simpleV2Builder);

    logger.log(
      "Registered SimpleV1Builder with graph type: " +
        this.simpleV1Builder.graphType
    );
    logger.log(
      "Registered SimpleV2Builder with graph type: " +
        this.simpleV2Builder.graphType
    );

    logger.log("🚀 SIMPLE GRAPH SERVICE INITIALIZED");
    logger.log(
      "📋 Versioning: Automatic registration via UniversalGraphModule"
    );
    logger.log("🔄 Available versions: 1.0.0, 2.0.0 (default)");
  }
}
