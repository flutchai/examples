import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import mongoose, { Connection } from "mongoose";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
  BaseGraphServiceController,
  BuilderRegistryService,
  GraphEngineType,
  UniversalGraphModule,
} from "@flutchai/flutch-sdk";
import { ModelInitializer } from "@flutchai/flutch-sdk";

import { ReactGraphTokens } from "./react.tokens";
import { ReactGraphV1Builder } from "./versions";
import * as Nodes from "./graph/nodes";
import { McpRuntimeHttpClient } from "@flutchai/flutch-sdk";
import { ToolCatalogClient } from "./services";
// Note: PlannerPromptService and PlanMaterializationService are no longer needed
// in the new ReAct pattern - prompts are handled by the new prompt system

const logger = new Logger("ReactGraphModule");

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),
    UniversalGraphModule.forRoot({
      engineType: GraphEngineType.LANGGRAPH,
      versioning: [
        {
          baseGraphType: "flutch.react",
          versions: [
            {
              version: "1.0.0",
              builderClass: ReactGraphV1Builder,
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
    ModelInitializer,
    McpRuntimeHttpClient,
    ToolCatalogClient,
    // Note: PlannerPromptService and PlanMaterializationService removed
    // - new ReAct pattern uses simplified prompt system
    ReactGraphV1Builder,
    {
      provide: ReactGraphTokens.PLAN_AND_SELECT_NODE,
      useClass: Nodes.PlanAndSelectToolNode,
    },
    {
      provide: ReactGraphTokens.EXECUTE_TOOL_NODE,
      useClass: Nodes.ExecuteToolNode,
    },
    {
      provide: ReactGraphTokens.REFLECT_AND_DECIDE_NODE,
      useClass: Nodes.ReflectAndDecideNode,
    },
    {
      provide: ReactGraphTokens.GENERATE_ANSWER_NODE,
      useClass: Nodes.GenerateAnswerNode,
    },
    {
      provide: ReactGraphTokens.CLARIFY_NODE,
      useClass: Nodes.ClarifyNode,
    },
    {
      provide: "MONGO_CONNECTION",
      useFactory: async (configService: ConfigService): Promise<Connection> => {
        // MongoDB URI is required - fail fast if not provided
        const mongoUri = configService.getOrThrow<string>("MONGODB_URI");
        const dbName = configService.get<string>(
          "MONGO_DB_NAME",
          "react_graph"
        );

        logger.log(
          `Connecting to MongoDB for ReAct graph: ${mongoUri.replace(/\/\/([^:]*):([^@]*)@/, "//***:***@")}`
        );

        try {
          const connection = mongoose.createConnection(mongoUri, { dbName });
          // Wait until initial connection is established
          // @ts-ignore - asPromise exists at runtime on Mongoose Connection
          await connection.asPromise?.();
          logger.log(
            "✅ MongoDB connection established successfully for ReAct graph"
          );
          return connection as Connection;
        } catch (error) {
          logger.error(
            "Failed to connect to MongoDB for ReAct graph",
            error as Error
          );
          throw error;
        }
      },
      inject: [ConfigService],
    },
    {
      provide: "CHECKPOINTER",
      useFactory: async (connection: Connection): Promise<MongoDBSaver> => {
        const mongoClient = connection.getClient();
        logger.log("Creating MongoDB CHECKPOINTER for ReAct graph");
        return new MongoDBSaver({
          client: mongoClient,
          dbName: connection.db?.databaseName || "react_graph",
          checkpointCollectionName: "react_graph_checkpoints",
          checkpointWritesCollectionName: "react_graph_checkpoint_writes",
        });
      },
      inject: ["MONGO_CONNECTION"],
    },
  ],
  exports: [ConfigModule],
})
export class ReactGraphModule implements OnModuleInit {
  constructor(
    private readonly builder: ReactGraphV1Builder,
    private readonly builderRegistry: BuilderRegistryService
  ) {}

  async onModuleInit(): Promise<void> {
    this.builderRegistry.registerBuilder(this.builder);
    logger.log(
      `Registered ReactGraphV1Builder with graph type: ${this.builder.graphType}`
    );
    logger.log("🚀 REACT GRAPH SERVICE INITIALIZED");
  }
}
