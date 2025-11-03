import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { DatabaseModule } from "../common/database.module";
import { SupportGraphV1Builder } from "./versions";
import { ConversationRouterNode } from "./nodes/conversation-router.node";
import { AuthoritativeAgentNode } from "./nodes/authoritative-agent.node";
import { ExploratoryAgentNode } from "./nodes/exploratory-agent.node";
import { EscalationAgentNode } from "./nodes/escalation-agent.node";
import { ResponseOrchestratorNode } from "./nodes/response-orchestrator.node";
import { OutputStreamProcessorNode } from "./nodes/output_stream-processor.node";
import {
  BaseGraphServiceController,
  BuilderRegistryService,
  UniversalGraphModule,
  GraphEngineType,
} from "@flutchai/flutch-sdk";
import {
  LLMInitializer,
  ModelInitializer,
  RetrieverService,
} from "@flutchai/flutch-sdk";

/**
 * Graph Module for Agentic Support Graph 2025
 *
 * Provides multi-agent support system with:
 * - Intelligent query routing
 * - Specialized agents for different query types
 * - CoRAG (Chain-of-Retrieval Augmented Generation)
 * - Self-reflection and quality assessment
 * - Human escalation capabilities
 */
@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),

    DatabaseModule,

    UniversalGraphModule.forRoot({
      engineType: GraphEngineType.LANGGRAPH,
      versioning: [
        {
          baseGraphType: "flutch.support",
          versions: [
            {
              version: "1.0.0",
              builderClass: SupportGraphV1Builder,
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
    // Model initializer token provider
    {
      provide: "MODEL_INITIALIZER",
      useClass: ModelInitializer,
    },

    // Retriever service for knowledge base access with proper configuration
    {
      provide: RetrieverService,
      useFactory: () => {
        const apiUrl = process.env.API_URL || "http://amelie-service";
        const internalToken = process.env.INTERNAL_API_TOKEN;

        if (!internalToken) {
          throw new Error(
            "INTERNAL_API_TOKEN environment variable is required for RetrieverService. " +
              "This token is needed for communication with the main backend service."
          );
        }

        return new RetrieverService({
          apiUrl,
          internalToken,
          timeout: 30000,
          retries: 3,
        });
      },
    },

    // Retriever service token provider
    {
      provide: "RETRIEVER_SERVICE",
      useExisting: RetrieverService,
    },

    // Graph builder
    SupportGraphV1Builder,

    // Agent nodes
    ConversationRouterNode,
    AuthoritativeAgentNode,
    ExploratoryAgentNode,
    EscalationAgentNode,
    ResponseOrchestratorNode,
    OutputStreamProcessorNode,
  ],
  exports: [
    SupportGraphV1Builder,
    ConversationRouterNode,
    AuthoritativeAgentNode,
    ExploratoryAgentNode,
    EscalationAgentNode,
    ResponseOrchestratorNode,
    OutputStreamProcessorNode,
  ],
})
export class SupportGraphModule {}
