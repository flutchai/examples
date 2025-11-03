import { Module, Logger } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import mongoose, { Connection } from "mongoose";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { ENV_CONFIG } from "./environment.config";

const logger = new Logger("DatabaseModule");

@Module({
  imports: [ConfigModule],
  providers: [
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

        logger.log("Creating CHECKPOINTER for ledger graph");
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
  exports: ["MONGO_CONNECTION", "CHECKPOINTER"],
})
export class DatabaseModule {}

/**
 * Database Module
 *
 * Provides shared database infrastructure:
 * - MongoDB connection
 * - LangGraph checkpointer
 *
 * This module is imported by both LedgerModule and WorkflowModule
 * to provide consistent database access.
 */
