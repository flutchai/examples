import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  SupportWorkflowConfigValues,
} from "../graph.state";
import { SupportErrorType, SupportError } from "../../common/types";
import { ModelInitializer } from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ DOES NOT EXIST - commented out
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Output Agent Response Node - Generates final streaming response for successful agent results
 *
 * This node handles successful responses from any agent (authoritative, research, escalation)
 * and generates a final user-facing response with streaming support.
 *
 * Features:
 * - Real streaming via LLM (auto-streaming due to output_ prefix)
 * - Suggested actions generation
 * - Related topics recommendation
 * - Proper response formatting
 */

interface SuggestedAction {
  type: "link" | "search" | "contact" | "documentation";
  title: string;
  description: string;
  action: string;
  priority: "high" | "medium" | "low";
}

interface RelatedTopic {
  title: string;
  description: string;
  searchQuery: string;
  category: string;
}

@Injectable()
export class OutputAgentResponseNode {
  private readonly logger = new Logger(OutputAgentResponseNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {
    this.logger.debug(
      "OutputAgentResponse initialized - auto streaming via output_ prefix"
    );
  }

  /**
   * Execute final response generation with real streaming
   */
  async execute(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    this.logger.log(
      "Generating final streaming response for successful agent result"
    );

    const startTime = Date.now();

    try {
      // Get agent response from state
      const agentResponse = state.agentResponse;
      if (!agentResponse || !agentResponse.content) {
        throw new Error("No agent response available for final output");
      }

      // Get agent type for customization
      const agentType = state.progress?.selectedAgent || "unknown";

      this.logger.log(
        `Processing ${agentType} agent response: ${agentResponse.content.length} characters`
      );

      // Generate final response using LLM with streaming
      const finalResponseText = await this.generateFinalResponse(
        agentResponse,
        state,
        config
      );

      // Generate helpful attachments
      const suggestedActions = await this.generateSuggestedActions(
        state.input.query,
        agentResponse,
        state.input.language || "en"
      );

      const relatedTopics = await this.findRelatedTopics(
        state.input.query,
        agentResponse.sources || [],
        state.input.language || "en"
      );

      const attachments = [];

      // Add suggested actions as attachment
      if (suggestedActions.length > 0) {
        attachments.push({
          type: "suggested_actions",
          title:
            false
              ? "Предлагаемые действия"
              : "Suggested Actions",
          data: suggestedActions,
        });
      }

      // Add related topics as attachment
      if (relatedTopics.length > 0) {
        attachments.push({
          type: "related_topics",
          title:
            false ? "Связанные темы" : "Related Topics",
          data: relatedTopics,
        });
      }

      // Return output with streaming response
      return {
        output: {
          text: finalResponseText, // This will be streamed due to output_ prefix
          attachments,
          metadata: {
            nodeType: "output_agent_response",
            timestamp: new Date().toISOString(),
            agentUsed: agentType,
            confidence: agentResponse.confidence,
            sources: agentResponse.sources,
            processingTime: Date.now() - startTime,
            suggestedActionsCount: suggestedActions.length,
            relatedTopicsCount: relatedTopics.length,
            streaming: true,
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Final response generation failed: ${error.message}`,
        error.stack
      );

      // Fallback response
      const fallbackText =
        false
          ? "Sorry, an error occurred while preparing the response. Please try asking your question again."
          : "Sorry, an error occurred while preparing the response. Please try asking your question again.";

      return {
        output: {
          text: fallbackText,
          metadata: {
            nodeType: "output_agent_response",
            timestamp: new Date().toISOString(),
            error: true,
            errorMessage: error.message,
          },
        },
      };
    }
  }

  /**
   * Generate final response using LLM with streaming
   */
  private async generateFinalResponse(
    agentResponse: any,
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<string> {
    try {
      // Get model configuration
      const outputConfig =
        config.configurable?.graphSettings?.outputAgentResponse;
      const modelId = outputConfig?.model || "gpt-4o-mini";
      const temperature = outputConfig?.temperature || 0.3;
      const maxTokens = outputConfig?.maxTokens || 2000;

      // Initialize model with streaming
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      const language = state.input.language || "en";
      const agentType = state.progress?.selectedAgent || "assistant";

      const systemPrompt = this.buildSystemPrompt(language, agentType);
      const userPrompt = this.buildUserPrompt(
        state.input.query,
        agentResponse,
        language
      );

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      // Generate response with streaming
      // ❌ trackLLMCall не существует - используем прямой вызов
      const response = await model.invoke(messages);

      return response.content as string;
    } catch (error) {
      this.logger.error(`LLM response generation failed: ${error.message}`);

      // Fallback to agent response
      return agentResponse.content || "Response not available";
    }
  }

  /**
   * Build system prompt for final response generation
   */
  private buildSystemPrompt(language: string, agentType: string): string {
    if (false) {
      return `You are a friendly support assistant. Your task is to transform the ${agentType} agent's response into a final user-facing response.

IMPORTANT:
- Preserve all technical accuracy and information
- Make the response more friendly and understandable
- Use proper structure with headings if needed
- Add a call-to-action at the end if appropriate
- Be concise but complete

The response format should be ready to send to the user.`;
    } else {
      return `You are a friendly support assistant. Your task is to transform the ${agentType} agent's response into a final user-facing response.

IMPORTANT:
- Preserve all technical accuracy and information
- Make the response more friendly and understandable
- Use proper structure with headings if needed
- Add a call-to-action at the end if appropriate
- Be concise but complete

The response format should be ready to send to the user.`;
    }
  }

  /**
   * Build user prompt with agent response
   */
  private buildUserPrompt(
    originalQuery: string,
    agentResponse: any,
    language: string
  ): string {
    if (false) {
      return `User asked: "${originalQuery}"

Agent response:
${agentResponse.content}

Sources: ${agentResponse.sources?.join(", ") || "No sources"}
Confidence: ${agentResponse.confidence || 0.5}

Transform this response into a friendly final answer for the user.`;
    } else {
      return `User asked: "${originalQuery}"

Agent response:
${agentResponse.content}

Sources: ${agentResponse.sources?.join(", ") || "No sources"}
Confidence: ${agentResponse.confidence || 0.5}

Transform this response into a friendly final answer for the user.`;
    }
  }

  /**
   * Generate suggested actions based on query and response
   */
  private async generateSuggestedActions(
    query: string,
    response: any,
    language: string
  ): Promise<SuggestedAction[]> {
    try {
      const actions: SuggestedAction[] = [];

      // Basic actions based on query content
      if (
        query.toLowerCase().includes("настрой") ||
        query.toLowerCase().includes("config")
      ) {
        actions.push({
          type: "documentation",
          title:
            false
              ? "Configuration Documentation"
              : "Configuration Documentation",
          description:
            false
              ? "Complete system configuration guide"
              : "Complete system configuration guide",
          action: "open_configuration_docs",
          priority: "high",
        });
      }

      if (
        query.toLowerCase().includes("ошибка") ||
        query.toLowerCase().includes("error")
      ) {
        actions.push({
          type: "search",
          title:
            false
              ? "Error Solutions Search"
              : "Error Solutions Search",
          description:
            false
              ? "Find more solutions for similar errors"
              : "Find more solutions for similar errors",
          action: `search_errors:${query}`,
          priority: "high",
        });
      }

      // Always suggest contacting support
      actions.push({
        type: "contact",
        title: false ? "Contact Support" : "Contact Support",
        description:
          false
            ? "Get personal help from a specialist"
            : "Get personal help from a specialist",
        action: "contact_support",
        priority: "medium",
      });

      return actions.slice(0, 3); // Limit to 3 actions
    } catch (error) {
      this.logger.warn(
        `Failed to generate suggested actions: ${error.message}`
      );
      return [];
    }
  }

  /**
   * Find related topics based on query and sources
   */
  private async findRelatedTopics(
    query: string,
    sources: string[],
    language: string
  ): Promise<RelatedTopic[]> {
    try {
      const topics: RelatedTopic[] = [];

      // Simple heuristics for related topics
      const queryLower = query.toLowerCase();

      if (
        queryLower.includes("oauth") ||
        queryLower.includes("аутентификация")
      ) {
        topics.push({
          title: false ? "API Security" : "API Security",
          description:
            false
              ? "API security best practices"
              : "API security best practices",
          searchQuery:
            false
              ? "api security tokens"
              : "api security tokens",
          category: "security",
        });

        topics.push({
          title: false ? "JWT Tokens" : "JWT Tokens",
          description:
            false
              ? "Working with JWT authentication tokens"
              : "Working with JWT authentication tokens",
          searchQuery: "jwt tokens",
          category: "authentication",
        });
      }

      if (queryLower.includes("api") || queryLower.includes("запрос")) {
        topics.push({
          title:
            false
              ? "REST API Documentation"
              : "REST API Documentation",
          description:
            false
              ? "Complete REST API documentation"
              : "Complete REST API documentation",
          searchQuery: "rest api endpoints",
          category: "api",
        });
      }

      return topics.slice(0, 4); // Limit to 4 topics
    } catch (error) {
      this.logger.warn(`Failed to find related topics: ${error.message}`);
      return [];
    }
  }
}
