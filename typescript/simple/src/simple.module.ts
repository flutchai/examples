import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import mongoose, { Connection } from "mongoose";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { SimpleV1Builder } from "./graph";
import { ModelInitializer, McpRuntimeHttpClient } from "@flutchai/flutch-sdk";
import * as Nodes from "./graph/v1.0.0/nodes";
import {
  BaseGraphServiceController,
  BuilderRegistryService,
  UniversalGraphModule,
  GraphEngineType,
} from "@flutchai/flutch-sdk";

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
    // New model initializer
    ModelInitializer,

    // MCP Runtime Client
    McpRuntimeHttpClient,

    // Version builders
    SimpleV1Builder,

    // Shared nodes (used by all versions)
    Nodes.GenerateNode,
    Nodes.ExecuteToolsNode,

    // MongoDB connection
    {
      provide: "MONGO_CONNECTION",
      useFactory: async (configService: ConfigService): Promise<Connection> => {
        const mongoUri = configService.get<string>("MONGODB_URI")!;
        const dbName =
          configService.get<string>("MONGO_DB_NAME") || "simple-graph-dev";
        logger.log(
          `Connecting to MongoDB: ${mongoUri?.substring(0, 50) + "..."}`,
        );
        try {
          await mongoose.connect(mongoUri, { dbName });
          return mongoose.connection;
        } catch (error) {
          logger.error("Failed to connect to MongoDB", error as Error);
          throw error;
        }
      },
      inject: [ConfigService],
    },

    // CHECKPOINTER - using MongoDB connection
    {
      provide: "CHECKPOINTER",
      useFactory: async (
        connection: Connection,
        configService: ConfigService,
      ) => {
        const mongoClient = connection.getClient();
        const dbName =
          configService.get<string>("MONGO_DB_NAME") || "simple-graph-dev";

        logger.log("Creating CHECKPOINTER for simple graph");
        return new MongoDBSaver({
          client: mongoClient,
          dbName,
          checkpointCollectionName: "checkpoints",
          checkpointWritesCollectionName: "checkpoint_writes",
        });
      },
      inject: ["MONGO_CONNECTION", ConfigService],
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
    private readonly builderRegistry: BuilderRegistryService,
  ) {}

  async onModuleInit() {
    // Register the graph builder
    this.builderRegistry.registerBuilder(this.simpleV1Builder);

    logger.log(
      "Registered SimpleV1Builder with graph type: " +
        this.simpleV1Builder.graphType,
    );

    logger.log("🚀 SIMPLE GRAPH SERVICE INITIALIZED");
    logger.log(
      "📋 Versioning: Automatic registration via UniversalGraphModule",
    );
    logger.log("🔄 Available version: 1.0.0 (default)");
  }
}
