import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  SupportWorkflowConfigValues,
} from "../graph.state";
import { ModelInitializer } from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ DOES NOT EXIST - commented out
import {
  SystemMessage,
  HumanMessage,
  BaseMessage,
} from "@langchain/core/messages";

/**
 * QueryTransformationNode - Query normalization and context-aware enhancement
 *
 * This node implements the critical first step of the TS flow:
 * - Normalizes the raw user query
 * - Expands query with conversation history context
 * - Enriches query for better routing and retrieval
 *
 * According to TS lines 121, 546-547:
 * - Creates `normalized_question`
 * - Considers `user_context.history` for context-aware expansion
 */

interface QueryTransformationResult {
  normalizedQuery: string;
  expandedQuery: string;
  extractedEntities: string[];
  contextualEnhancements: string[];
  confidence: number;
}

@Injectable()
export class QueryTransformationNode {
  private readonly logger = new Logger(QueryTransformationNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {
    this.logger.debug(
      "QueryTransformation initialized - normalizing and expanding queries"
    );
  }

  /**
   * Execute query transformation with normalization and context expansion
   */
  async execute(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    this.logger.log(
      `Starting query transformation for: ${state.input.query.substring(0, 100)}...`
    );

    const startTime = Date.now();
    const tracer = state.executionTracer;

    tracer?.log({
      node: "QueryTransformation",
      type: "execution_start",
      message: "Starting query normalization and expansion",
      data: {
        originalQuery: state.input.query,
        hasHistory: !!(state.messages && state.messages.length > 0),
        historyLength: state.messages?.length || 0,
      },
    });

    try {
      // Get transformation configuration
      const transformationConfig =
        config.configurable?.graphSettings?.queryTransformation;
      if (!transformationConfig?.llm?.modelId) {
        throw new Error(
          "queryTransformation.llm.modelId is required in graph configuration"
        );
      }

      // Advance workflow step
      const stepUpdate = SupportWorkflowStateUtils.advanceStep(
        state,
        "query_transformation"
      );

      // Perform query transformation
      const transformationResult = await this.performQueryTransformation(
        state,
        config
      );

      // Update metadata with transformation info
      const metadataUpdate = SupportWorkflowStateUtils.updateMetadata(state, {
        queryTransformation: {
          originalQuery: state.input.query,
          normalizedQuery: transformationResult.normalizedQuery,
          expandedQuery: transformationResult.expandedQuery,
          extractedEntities: transformationResult.extractedEntities,
          contextualEnhancements: transformationResult.contextualEnhancements,
          confidence: transformationResult.confidence,
          processingTime: Date.now() - startTime,
        },
      });

      this.logger.log(
        `Query transformed successfully (confidence: ${transformationResult.confidence})`
      );

      tracer?.log({
        node: "QueryTransformation",
        type: "execution_completed",
        message: "Query transformation completed successfully",
        data: {
          normalizedLength: transformationResult.normalizedQuery.length,
          expandedLength: transformationResult.expandedQuery.length,
          entitiesCount: transformationResult.extractedEntities.length,
          enhancementsCount: transformationResult.contextualEnhancements.length,
          confidence: transformationResult.confidence,
          processingTimeMs: Date.now() - startTime,
        },
      });

      return {
        ...stepUpdate,
        ...metadataUpdate,
        // Add normalized_question as per TS requirement
        normalizedQuestion: transformationResult.normalizedQuery,
        // Enhanced query for better routing and retrieval
        enhancedQuery: transformationResult.expandedQuery,
        // Input with normalized query for downstream nodes
        input: {
          ...state.input,
          normalizedQuery: transformationResult.normalizedQuery,
          enhancedQuery: transformationResult.expandedQuery,
        },
      };
    } catch (error) {
      this.logger.error(
        `Query transformation failed: ${error.message}`,
        error.stack
      );

      tracer?.error({
        node: "QueryTransformation",
        type: "execution_error",
        message: "Query transformation failed, using original query",
        error: error,
        data: { processingTimeMs: Date.now() - startTime },
      });

      const errorUpdate = SupportWorkflowStateUtils.addError(
        state,
        `Query transformation failed: ${error.message}`
      );

      // Fallback: use original query as normalized
      return {
        ...errorUpdate,
        normalizedQuestion: state.input.query,
        enhancedQuery: state.input.query,
        input: {
          ...state.input,
          normalizedQuery: state.input.query,
          enhancedQuery: state.input.query,
        },
      };
    }
  }

  /**
   * Perform query transformation with context awareness
   */
  private async performQueryTransformation(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<QueryTransformationResult> {
    const { query, context, language } = state.input;
    const conversationHistory = state.messages || [];

    // Build context-aware prompt
    const systemPrompt = this.getSystemPromptFromConfig(config, language);
    const userPrompt = this.buildTransformationPrompt(
      query,
      conversationHistory,
      context,
      language
    );

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    this.logger.debug("Sending query transformation request to LLM");

    try {
      // Get model configuration
      const transformationConfig =
        config.configurable?.graphSettings?.queryTransformation;

      const modelId = transformationConfig.llm.modelId;
      const temperature = transformationConfig.llm.temperature || 0.3;
      const maxTokens = transformationConfig.llm.maxTokens || 800;

      // Initialize model
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      // ❌ trackLLMCall does not exist - using direct call
      const response = await model.invoke(messages);

      // Parse the structured response
      const result = this.parseTransformationResponse(
        response.content as string,
        query
      );

      this.logger.debug(
        `Query transformation completed with confidence: ${result.confidence}`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Query transformation LLM call failed: ${error.message}`
      );
      throw new Error(`Failed to transform query: ${error.message}`);
    }
  }

  /**
   * Get system prompt from configuration
   */
  private getSystemPromptFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>,
    language: string = "en"
  ): string {
    const transformationConfig =
      config.configurable?.graphSettings?.queryTransformation;

    if (transformationConfig?.systemPrompt) {
      return transformationConfig.systemPrompt;
    }

    // Default prompt
    return `You are an expert at normalizing and expanding user queries for a technical support system.

Your task:
1. NORMALIZE the query - fix typos, simplify slang, make the query clear
2. EXPAND the query with conversation context - add implied information
3. EXTRACT key entities - technical terms, products, functions
4. ADD contextual enhancements based on conversation history

Return result in JSON format:
{
  "normalizedQuery": "clear normalized query",
  "expandedQuery": "expanded query with context",
  "extractedEntities": ["entity1", "entity2"],
  "contextualEnhancements": ["enhancement1", "enhancement2"],
  "confidence": 0.85
}

Important:
- normalizedQuery should be clear and unambiguous
- expandedQuery should include context from conversation history
- confidence from 0.0 to 1.0 shows transformation quality`;
  }

  /**
   * Build transformation prompt with conversation context
   */
  private buildTransformationPrompt(
    query: string,
    conversationHistory: BaseMessage[],
    context?: string | any,
    language: string = "en"
  ): string {
    let prompt = `Original user query: "${query}"`;

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-6); // Last 6 messages for context

      prompt += `\n\nConversation history (recent messages):\n`;

      recentHistory.forEach((msg, index) => {
        const role =
          msg._getType() === "human"
            ? isRussian
              ? "User"
              : "User"
            : isRussian
              ? "Assistant"
              : "Assistant";
        prompt += `${role}: ${msg.content}\n`;
      });
    }

    // Add additional context if provided
    if (context) {
      prompt += isRussian
        ? `\nAdditional context: ${context}`
        : `\nAdditional context: ${context}`;
    }

    prompt += isRussian
      ? `\n\nAnalyze the query and return the transformation result in JSON format.`
      : `\n\nAnalyze the query and return the transformation result in JSON format.`;

    return prompt;
  }

  /**
   * Parse LLM response into structured result
   */
  private parseTransformationResponse(
    response: string,
    originalQuery: string
  ): QueryTransformationResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        normalizedQuery: parsed.normalizedQuery || originalQuery,
        expandedQuery: parsed.expandedQuery || originalQuery,
        extractedEntities: parsed.extractedEntities || [],
        contextualEnhancements: parsed.contextualEnhancements || [],
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0.0), 1.0),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to parse transformation response: ${error.message}, using fallback`
      );

      // Fallback: simple normalization
      return {
        normalizedQuery: originalQuery.trim().toLowerCase(),
        expandedQuery: originalQuery,
        extractedEntities: [],
        contextualEnhancements: [],
        confidence: 0.3,
      };
    }
  }
}
