import { Module, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import mongoose, { Connection } from "mongoose";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";

const logger = new Logger("DatabaseModule");

@Module({
  imports: [ConfigModule],
  providers: [
    // MongoDB Connection Provider
    {
      provide: "DATABASE_CONNECTION",
      useFactory: async (configService: ConfigService): Promise<Connection> => {
        // MongoDB URI is required - fail fast if not provided
        const mongoUri = configService.getOrThrow<string>("MONGO_URI");

        logger.log(
          `Connecting to MongoDB: ${mongoUri.replace(/\/\/([^:]*):([^@]*)@/, "//***:***@")}`
        );

        const connection = mongoose.createConnection(mongoUri);
        // Wait until initial connection is established
        // @ts-ignore - asPromise exists at runtime on Mongoose Connection
        await connection.asPromise?.();
        logger.log("✅ MongoDB connection established successfully");
        return connection as Connection;
      },
      inject: [ConfigService],
    },

    // MongoDB Checkpointer Provider
    {
      provide: "CHECKPOINTER",
      useFactory: async (connection: Connection): Promise<MongoDBSaver> => {
        const mongoClient = connection.getClient();
        logger.log("Creating MongoDB CHECKPOINTER for agentic support graph");
        return new MongoDBSaver({
          client: mongoClient,
          dbName: connection.db?.databaseName || "amelie-dev",
          checkpointCollectionName: "agentic_support_checkpoints",
          checkpointWritesCollectionName: "agentic_support_checkpoint_writes",
        });
      },
      inject: ["DATABASE_CONNECTION"],
    },
  ],
  exports: ["DATABASE_CONNECTION", "CHECKPOINTER"],
})
export class DatabaseModule {}

/**
 * Database Module for Agentic Support Graph
 *
 * Provides:
 * - Required MongoDB connection
 * - MongoDB-based LangGraph checkpointer for workflow state persistence
 * - Proper error handling and logging
 *
 * Environment Variables:
 * - MONGO_URI: MongoDB connection string (required)
 * - Application will fail to start if MONGO_URI is not provided
 */
