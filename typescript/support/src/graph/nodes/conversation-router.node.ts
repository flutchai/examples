import { Injectable, Logger } from "@nestjs/common";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  RouterDecision,
  AgentType,
  QueryType,
  SupportWorkflowConfigValues,
} from "../graph.state";
import { LLMConfig } from "../graph.config";
import {
  QueryPriority,
  SupportedLanguage,
  SupportErrorType,
  SupportError,
} from "../../common/types";
import { ModelInitializer } from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ НЕ СУЩЕСТВУЕТ - закомментировано

/**
 * ConversationRouter Node - Intelligent query routing system
 *
 * Analyzes incoming user query and decides which specialized agent to route it to:
 * - AuthoritativeAgent for clear documentation questions
 * - ResearchAgent for complex research queries
 * - EscalationAgent for unclear or critical situations
 */

// Zod schema for router decision validation
const RouterDecisionSchema = z.object({
  selectedAgent: z.enum(["authoritative", "exploratory", "escalation"]),
  queryType: z.enum([
    "documentation_query",
    "exploratory_query",
    "unclear_query",
    "critical_query",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  extractedIntent: z.string(),
  keyTopics: z.array(z.string()),
  estimatedComplexity: z.enum(["simple", "medium", "complex"]),
  requiresEscalation: z.boolean(),
});

@Injectable()
export class ConversationRouterNode {
  private readonly logger = new Logger(ConversationRouterNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  /**
   * Execute the conversation routing logic
   */
  async execute(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const tracer = state.executionTracer;

    // Use enhanced query for logging if available
    const displayQuery =
      state.enhancedQuery || state.normalizedQuestion || state.input.query;
    this.logger.log(
      `Starting conversation routing for ${state.enhancedQuery ? "enhanced" : "original"} query: ${displayQuery.substring(0, 100)}...`
    );

    tracer?.log({
      node: "ConversationRouter",
      type: "execution_start",
      message: "Starting query routing analysis",
      data: {
        queryLength: state.input.query.length,
        language: state.input.language,
        priority: state.input.priority,
      },
    });

    const startTime = Date.now();

    try {
      // Get router configuration for tracking
      const routerConfig =
        config.configurable?.graphSettings?.conversationRouter;
      if (!routerConfig) {
        throw new Error(
          "ConversationRouter requires configuration in graphSettings"
        );
      }

      // Advance workflow step
      const stepUpdate = SupportWorkflowStateUtils.advanceStep(
        state,
        "conversation_router"
      );

      // Analyze the query and make routing decision
      const routerDecision = await this.analyzeQuery(state, config);

      // Update metadata with routing information
      const metadataUpdate = SupportWorkflowStateUtils.updateMetadata(state, {
        routingDecision: routerDecision,
        routingTime: Date.now() - startTime,
        queryAnalysis: {
          originalQuery: state.input.query,
          enhancedQuery: state.enhancedQuery,
          normalizedQuery: state.normalizedQuestion,
          usedEnhancedQuery: !!state.enhancedQuery,
          extractedIntent: routerDecision.extractedIntent,
          keyTopics: routerDecision.keyTopics,
          complexity: routerDecision.estimatedComplexity,
        },
      });

      this.logger.log(
        `Query routed to ${routerDecision.selectedAgent} agent with confidence ${routerDecision.confidence}`
      );

      // Record LLM usage
      const usageUpdate = await this.recordTokenUsage(
        state,
        startTime,
        routerConfig
      );

      return {
        ...stepUpdate,
        ...metadataUpdate,
        routerDecision,
        progress: {
          ...state.progress,
          ...stepUpdate.progress,
          selectedAgent: routerDecision.selectedAgent,
        },
        usageRecorder: usageUpdate.usageRecorder,
      };

      tracer?.log({
        node: "ConversationRouter",
        type: "execution_completed",
        message: `Successfully routed to ${routerDecision.selectedAgent}`,
        data: {
          selectedAgent: routerDecision.selectedAgent,
          confidence: routerDecision.confidence,
          queryType: routerDecision.queryType,
          processingTimeMs: Date.now() - startTime,
        },
      });
    } catch (error) {
      this.logger.error(
        `Router execution failed: ${error.message}`,
        error.stack
      );

      tracer?.error({
        node: "ConversationRouter",
        type: "execution_error",
        message: "Routing analysis failed, escalating to manual handling",
        error: error,
        data: { processingTimeMs: Date.now() - startTime },
      });

      const errorUpdate = SupportWorkflowStateUtils.addError(
        state,
        `Router failed: ${error.message}`
      );

      // Fallback to escalation agent on error
      const fallbackDecision: RouterDecision = {
        selectedAgent: "escalation" as AgentType,
        queryType: "unclear_query" as QueryType,
        confidence: 0.1,
        reasoning: `Router failed with error: ${error.message}. Escalating for manual handling.`,
        extractedIntent: state.input.query,
        keyTopics: [],
        estimatedComplexity: "complex" as "simple" | "medium" | "complex",
        requiresEscalation: true,
      };

      return {
        ...errorUpdate,
        routerDecision: fallbackDecision,
        progress: {
          ...state.progress,
          ...errorUpdate.progress,
          selectedAgent: "escalation",
        },
        metadata: {
          ...state.metadata,
          routingError: {
            type: SupportErrorType.QUERY_PARSING_ERROR,
            message: error.message,
            timestamp: new Date().toISOString(),
            recovery: "Escalated to manual handling",
          } as SupportError,
        },
      };
    }
  }

  /**
   * Analyze the user query and determine routing
   */
  private async analyzeQuery(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<RouterDecision> {
    const { query, context, priority, language } = state.input;

    // Use enhanced query from QueryTransformation if available, fallback to original
    const queryForAnalysis =
      state.enhancedQuery || state.normalizedQuestion || query;

    // Build context-aware prompt
    const systemPrompt = this.getSystemPromptFromConfig(config);
    const userPrompt = this.buildUserPrompt(
      queryForAnalysis,
      context,
      priority
    );

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    // Add conversation history if available
    if (state.messages && state.messages.length > 0) {
      // Include last few messages for context
      const recentMessages = state.messages.slice(-4);
      messages.splice(1, 0, ...recentMessages);
    }

    this.logger.debug(`Sending routing analysis request to LLM`);

    try {
      // Get model configuration
      const routerConfig =
        config.configurable?.graphSettings?.conversationRouter;
      if (!routerConfig) {
        throw new Error(
          "ConversationRouter requires configuration in graphSettings"
        );
      }

      // Support both new JSON schema format and legacy llmConfig format
      let modelId: string,
        temperature: number | undefined,
        maxTokens: number | undefined;

      if (routerConfig.llmConfig) {
        // Legacy format
        ({ modelId, temperature, maxTokens } = routerConfig.llmConfig);
      } else {
        // New JSON schema format - properties directly under routerConfig
        modelId = routerConfig.model;
        temperature = routerConfig.temperature;
        maxTokens = routerConfig.maxTokens;
      }

      if (!modelId) {
        throw new Error(
          "ConversationRouter requires model/modelId in configuration"
        );
      }

      // Initialize model on-demand (no pre-initialization, no storing in instance)
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      // Use structured output for reliable JSON parsing
      const modelWithStructuredOutput =
        model.withStructuredOutput(RouterDecisionSchema);

      // ❌ trackLLMCall не существует - используем прямой вызов
      const validatedDecision = (await modelWithStructuredOutput.invoke(
        messages
      )) as RouterDecision;

      this.logger.debug(
        `Router decision validated: ${validatedDecision.selectedAgent}`
      );

      return validatedDecision;
    } catch (error) {
      this.logger.error(`Query analysis failed: ${error.message}`);
      throw new Error(`Failed to analyze query: ${error.message}`);
    }
  }

  /**
   * Get system prompt from configuration
   */
  private getSystemPromptFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): string {
    const routerConfig = config.configurable?.graphSettings?.conversationRouter;

    // Use prompt from config if available, otherwise use default fallback
    if (routerConfig?.systemPrompt) {
      return routerConfig.systemPrompt;
    }

    // Default fallback prompt (English only)
    return `You are an intelligent query router in a technical support system.

You receive queries that have been pre-processed and enhanced with conversation context.
Your task is to analyze these enhanced queries and decide which specialist to route them to:

1. **AuthoritativeAgent** - for clear documentation queries:
   - API, function, configuration questions
   - Searching for specific information in documentation  
   - Simple technical questions with straightforward answers
   - Example: "How to configure OAuth2?", "What parameters does createUser method have?"

2. **ExploratoryAgent** - for complex analytical queries:
   - Technology or approach comparisons
   - Multi-step exploratory questions
   - Questions requiring synthesis from multiple sources
   - Example: "Compare authentication methods", "How to best organize architecture?"

3. **EscalationAgent** - for problematic cases:
   - Unclear or ambiguous queries
   - Critical issues requiring immediate attention
   - Complaints or emotionally charged messages
   - Example: "Nothing works!", "I have a system problem"

Analyze the query and provide a structured routing decision with your reasoning.`;
  }

  /**
   * Build user prompt with query context
   */
  private buildUserPrompt(
    query: string,
    context?: string | any,
    priority?: string
  ): string {
    let prompt = `Query to analyze: "${query}"`;

    if (context) {
      prompt += `\nAdditional context: ${context}`;
    }

    if (priority && priority !== "medium") {
      prompt += `\nPriority: ${priority}`;
    }

    return prompt;
  }

  /**
   * Record token usage for monitoring
   */
  private async recordTokenUsage(
    state: SupportWorkflowStateValues,
    startTime: number,
    routerConfig: any
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const processingTime = Date.now() - startTime;

    // Get model ID
    let modelId: string;
    if (routerConfig.llmConfig) {
      modelId = routerConfig.llmConfig.modelId;
    } else {
      modelId = routerConfig.model;
    }

    // Estimate token usage (this would be more accurate with actual LLM response metadata)
    const estimatedInputTokens = Math.floor(state.input.query.length / 3);
    const estimatedOutputTokens = 150; // Typical router response

    state.usageRecorder.recordModelExecution({
      nodeId: "conversation_router",
      timestamp: Date.now(),
      modelId: modelId || "unknown-model",
      promptTokens: estimatedInputTokens,
      completionTokens: estimatedOutputTokens,
      latencyMs: processingTime,
    });

    return {
      usageRecorder: state.usageRecorder,
    };
  }

  /**
   * Validate query before processing
   */
  private validateQuery(query: string): boolean {
    if (!query || query.trim().length === 0) {
      return false;
    }

    if (query.length > 10000) {
      this.logger.warn(`Query too long: ${query.length} characters`);
      return false;
    }

    return true;
  }

  /**
   * Determine if query needs immediate escalation
   */
  private needsImmediateEscalation(query: string, priority?: string): boolean {
    // Check for critical priority
    if (priority === QueryPriority.CRITICAL) {
      return true;
    }

    // Check for urgent keywords
    const urgentKeywords = [
      "not working",
      "error",
      "crashed",
      "down",
      "urgent",
      "critical",
      "help",
      "emergency",
    ];

    const lowerQuery = query.toLowerCase();
    return urgentKeywords.some(keyword => lowerQuery.includes(keyword));
  }
}
