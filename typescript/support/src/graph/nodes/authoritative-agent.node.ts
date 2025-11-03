import { Injectable, Logger } from "@nestjs/common";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  AgentResponse,
  CoRAGResults,
  SupportWorkflowConfigValues,
} from "../graph.state";
import {
  VectorSearchConfig,
  RerankingModel,
  DocumentSource,
  ConfidenceLevel,
  SupportErrorType,
  SupportError,
} from "../../common/types";
import { CoRAGRetrievalSubgraph } from "../subgraphs/corag-retrieval.subgraph";
import { KnowledgeRerankerSubgraph } from "../subgraphs/knowledge-reranker.subgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ НЕ СУЩЕСТВУЕТ - закомментировано
import { AttachmentType } from "@flutchai/flutch-sdk";

/**
 * AuthoritativeAgent Node - Fast search for precise answers
 *
 * Works like an experienced librarian:
 * 1. First checks FAQ for ready answers
 * 2. Then searches official documentation
 * 3. Uses reranker for better result quality
 * 4. Forms clear and precise answer
 * 5. If uncertain - passes to ResearchAgent
 */

@Injectable()
export class AuthoritativeAgentNode {
  private readonly logger = new Logger(AuthoritativeAgentNode.name);
  private llm: BaseChatModel;
  private readonly coragRetrieval: CoRAGRetrievalSubgraph;
  private readonly knowledgeReranker: KnowledgeRerankerSubgraph;

  // Dynamic configurations (loaded from manifest)
  private vectorConfig: VectorSearchConfig;
  private subgraphConfigs: {
    coragRetrieval: any;
    knowledgeReranker: any;
  };

  constructor(private readonly modelInitializer: ModelInitializer) {
    // Initialize subgraphs
    this.coragRetrieval = new CoRAGRetrievalSubgraph();
    this.knowledgeReranker = new KnowledgeRerankerSubgraph();
  }

  // Remove the old initialize method - will be replaced by config-based initialization

  /**
   * Initialize with manifest-based configurations (fallback to defaults)
   */
  private initializeDefaultConfigurations(): void {
    this.vectorConfig = {
      topK: 10,
      threshold: 0.75, // High threshold for authoritative answers
      hybridSearch: true,
      filters: {
        sources: [
          DocumentSource.DOCUMENTATION,
          DocumentSource.FAQ_DATABASE,
          DocumentSource.API_REFERENCE,
        ],
      },
    };

    this.subgraphConfigs = {
      coragRetrieval: CoRAGRetrievalSubgraph.getDefaultConfig(),
      knowledgeReranker: KnowledgeRerankerSubgraph.getDefaultConfig(),
    };

    this.logger.debug(
      "AuthoritativeAgent initialized with manifest configurations"
    );
  }

  /**
   * Update configuration from manifest (called by builder)
   */
  async updateConfiguration(config: {
    coragRetrieval?: any;
    knowledgeReranker?: any;
    general?: any;
  }): Promise<void> {
    try {
      this.logger.log(
        "Updating AuthoritativeAgent configuration from manifest..."
      );

      // Update general config
      if (config.general) {
        if (config.general.temperature !== undefined) {
          // Temperature is set during model initialization, not as a property
          this.logger.debug(
            `Temperature ${config.general.temperature} will be applied during next model initialization`
          );
        }

        // Update vector config
        this.vectorConfig = {
          ...this.vectorConfig,
          topK: config.coragRetrieval?.topK || this.vectorConfig.topK,
          threshold: 0.75, // Keep high threshold for authoritative answers
          enableCoRAG: config.general.enableCoRAG !== false,
          enableReranking: config.general.enableReranking !== false,
        };
      }

      // Update subgraph configurations
      this.subgraphConfigs = {
        coragRetrieval: {
          ...this.subgraphConfigs.coragRetrieval,
          ...config.coragRetrieval,
        },
        knowledgeReranker: {
          ...this.subgraphConfigs.knowledgeReranker,
          ...config.knowledgeReranker,
        },
      };

      this.logger.log(
        "AuthoritativeAgent configuration updated successfully from manifest"
      );
      this.logger.debug("Updated configurations:", {
        llmTemperature: 0.7, // Default temperature, actual value set during initialization
        vectorTopK: this.vectorConfig.topK,
        enableCoRAG: this.vectorConfig.enableCoRAG,
        enableReranking: this.vectorConfig.enableReranking,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update AuthoritativeAgent configuration: ${error.message}`
      );
      this.logger.warn(
        "AuthoritativeAgent will continue using fallback configurations"
      );
    }
  }

  /**
   * Initialize LLM from config parameters
   */
  private async initializeFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<void> {
    const authoritativeConfig =
      config.configurable?.graphSettings?.authoritativeAgent;
    if (!authoritativeConfig) {
      throw new Error(
        "AuthoritativeAgent requires configuration in graphSettings"
      );
    }

    // Support both new JSON schema format and legacy llmConfig format
    let modelId: string,
      temperature: number | undefined,
      maxTokens: number | undefined;

    if (authoritativeConfig.llmConfig) {
      // Legacy format
      ({ modelId, temperature, maxTokens } = authoritativeConfig.llmConfig);
    } else {
      // New JSON schema format - properties directly under authoritativeConfig
      modelId = authoritativeConfig.model;
      temperature = authoritativeConfig.temperature;
      maxTokens = authoritativeConfig.maxTokens;
    }

    if (!modelId) {
      throw new Error(
        "AuthoritativeAgent requires model/modelId in configuration"
      );
    }

    this.llm = await this.modelInitializer.initializeChatModel({
      modelId,
      temperature,
      maxTokens,
    });

    // Initialize with manifest configurations from builder
    this.initializeDefaultConfigurations();

    this.logger.debug(`AuthoritativeAgent initialized with model: ${modelId}`);
  }

  /**
   * Get model ID from config for tracking
   */
  private getModelIdFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): string {
    const authoritativeConfig =
      config.configurable?.graphSettings?.authoritativeAgent;
    if (!authoritativeConfig) {
      return "unknown-model";
    }

    // Support both new JSON schema format and legacy llmConfig format
    return (
      authoritativeConfig.llmConfig?.modelId ||
      authoritativeConfig.model ||
      "unknown-model"
    );
  }

  /**
   * Execute the authoritative agent logic
   */
  async execute(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    // Initialize LLM if needed
    if (!this.llm) {
      await this.initializeFromConfig(config);
    }

    this.logger.log(
      `Authoritative agent processing query: ${state.input.query.substring(0, 100)}...`
    );

    const startTime = Date.now();

    try {
      // Advance workflow step
      const stepUpdate = SupportWorkflowStateUtils.advanceStep(
        state,
        "authoritative_agent"
      );

      // Step 1: Quick FAQ check
      const faqResult = await this.checkFAQ(state.input.query);
      if (faqResult && faqResult.confidence > ConfidenceLevel.HIGH) {
        this.logger.log("Found high-confidence FAQ answer");
        return await this.createFAQResponse(
          state,
          faqResult,
          startTime,
          stepUpdate
        );
      }

      // Step 2: CoRAG iterative retrieval (NEW according to TS)
      const coragResults = await this.performCoRAGRetrieval(state);

      // Step 3: Advanced reranking using KnowledgeReranker subgraph
      const rerankedResults = await this.performAdvancedReranking(
        state.input.query,
        coragResults,
        state
      );

      // Step 4: Generate response based on retrieved documents
      const agentResponse = await this.generateResponse(
        state.input.query,
        rerankedResults,
        state.input.language || "en",
        state,
        config
      );

      // Step 5: Check confidence and decide next action
      if (agentResponse.confidence < ConfidenceLevel.MEDIUM) {
        this.logger.log(
          `Low confidence (${agentResponse.confidence}), should escalate to research agent`
        );

        return {
          ...stepUpdate,
          agentResponse,
          metadata: {
            ...state.metadata,
            authoritativeAttempt: {
              confidence: agentResponse.confidence,
              shouldEscalate: true,
              reason: "Low confidence in authoritative answer",
              processingTime: Date.now() - startTime,
            },
          },
        };
      }

      // High confidence response - create final output
      const finalResponse = this.createFinalResponse(
        agentResponse,
        Date.now() - startTime
      );

      this.logger.log(
        `Authoritative agent completed with confidence ${agentResponse.confidence}`
      );

      // Record usage and complete
      const usageUpdate = await this.recordTokenUsage(state, startTime);

      return {
        ...stepUpdate,
        agentResponse,
        finalResponse,
        output: {
          text: finalResponse.content,
          attachments: this.createAttachments(agentResponse.sources),
          metadata: {
            agentUsed: "authoritative",
            confidence: agentResponse.confidence,
            sources: agentResponse.sources,
            processingTime: finalResponse.processingTime,
          },
        },
        usageRecorder: usageUpdate.usageRecorder,
      };
    } catch (error) {
      this.logger.error(
        `Authoritative agent failed: ${error.message}`,
        error.stack
      );

      const errorUpdate = SupportWorkflowStateUtils.addError(
        state,
        `Authoritative agent failed: ${error.message}`
      );

      return {
        ...errorUpdate,
        metadata: {
          ...state.metadata,
          authoritativeError: {
            type: SupportErrorType.GENERATION_ERROR,
            message: error.message,
            timestamp: new Date().toISOString(),
            recovery: "Should escalate to research agent",
          } as SupportError,
        },
      };
    }
  }

  /**
   * Quick FAQ database check
   */
  private async checkFAQ(
    query: string
  ): Promise<{ content: string; confidence: number; source: string } | null> {
    try {
      // This would connect to FAQ database/vector store
      // For now, simulate FAQ check
      this.logger.debug("Checking FAQ database");

      // Simulate FAQ lookup based on common patterns
      const commonFAQPatterns = [
        {
          pattern: /how.*configure.*oauth/i,
          answer: "OAuth is configured through...",
          confidence: 0.9,
        },
        {
          pattern: /what.*is.*api/i,
          answer: "API (Application Programming Interface) is...",
          confidence: 0.95,
        },
        {
          pattern: /how.*create.*user/i,
          answer: "To create a user use the createUser() method...",
          confidence: 0.9,
        },
      ];

      for (const faq of commonFAQPatterns) {
        if (faq.pattern.test(query)) {
          return {
            content: faq.answer,
            confidence: faq.confidence,
            source: "FAQ Database",
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`FAQ check failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Perform CoRAG iterative retrieval (according to Technical Specification)
   */
  private async performCoRAGRetrieval(
    state: SupportWorkflowStateValues
  ): Promise<any[]> {
    try {
      this.logger.log("Starting CoRAG iterative retrieval");

      // Get CoRAG configuration (should be from graph config in real implementation)
      const coragConfig = this.subgraphConfigs.coragRetrieval;

      // Extract user context for personalized search
      const userContext = state.metadata?.userContext || {};

      // Execute CoRAG retrieval process
      const coragResult = await this.coragRetrieval.execute(
        state.input.query,
        userContext,
        coragConfig
      );

      // Update state with CoRAG context
      state.coragContext = coragResult.coragContext;

      this.logger.log(
        `CoRAG completed: ${coragResult.totalIterations} iterations, ${coragResult.finalDocuments.length} documents`
      );

      return coragResult.finalDocuments;
    } catch (error) {
      this.logger.error(`CoRAG retrieval failed: ${error.message}`);
      // Fallback to simple vector search
      return await this.performVectorSearchFallback(state.input.query);
    }
  }

  /**
   * Perform advanced reranking using KnowledgeReranker subgraph
   */
  private async performAdvancedReranking(
    query: string,
    documents: any[],
    state: SupportWorkflowStateValues
  ): Promise<any> {
    try {
      this.logger.log("Starting advanced reranking");

      // Get user profile from state
      const userProfile = state.metadata?.userContext?.profile || {
        expertiseLevel: "intermediate" as const,
        technicalBackground: [],
        preferredLanguage: state.input.language || "en",
      };

      // Get conversation history
      const conversationHistory = state.messages || [];

      // Get reranking configuration
      const rerankingConfig = this.subgraphConfigs.knowledgeReranker;

      // Execute advanced reranking
      const rerankedResults = await this.knowledgeReranker.execute(
        query,
        documents,
        userProfile,
        conversationHistory,
        rerankingConfig
      );

      // Update state with reranked results
      state.rerankedResults = rerankedResults;

      this.logger.log(
        `Advanced reranking completed: ${rerankedResults.length} results reranked`
      );

      // Convert RerankedResult[] back to CoRAGResults format for compatibility
      return {
        iteration: 1,
        query: query,
        retrievedDocs: rerankedResults.map(result => ({
          content: result.document.content,
          source: result.document.source,
          score: result.originalScore,
          metadata: result.document.metadata,
        })),
        rerankedDocs: rerankedResults.map(result => ({
          content: result.document.content,
          source: result.document.source,
          score: result.originalScore,
          rerankScore: result.finalScore,
          metadata: {
            ...result.document.metadata,
            rankingRationale: result.rankingRationale,
          },
        })),
        totalDocs: rerankedResults.length,
        isComplete: true,
      };
    } catch (error) {
      this.logger.error(`Advanced reranking failed: ${error.message}`);
      // Fallback to simple reranking
      return await this.rerankResultsFallback(query, documents);
    }
  }

  /**
   * Fallback vector search method (original implementation)
   */
  private async performVectorSearchFallback(query: string): Promise<any[]> {
    try {
      this.logger.debug("Performing fallback vector search in documentation");

      // This would connect to actual vector database
      // For now, simulate document retrieval
      const mockDocs = [
        {
          content:
            "OAuth 2.0 configuration is done via config/oauth.json file. You need to specify client_id, client_secret and redirect_uri.",
          source: "OAuth Configuration Guide",
          score: 0.89,
          metadata: { section: "Authentication", category: "API Setup" },
        },
        {
          content:
            "To connect OAuth provider use configureOAuth(provider, credentials) method. Google, GitHub, Microsoft are supported.",
          source: "API Reference - OAuth Methods",
          score: 0.85,
          metadata: { section: "OAuth Methods", category: "API Reference" },
        },
        {
          content:
            "OAuth setup example: const oauth = new OAuthProvider({clientId: 'your-id', clientSecret: 'your-secret', redirectUri: 'https://your-app.com/callback'})",
          source: "Code Examples - OAuth Setup",
          score: 0.82,
          metadata: { section: "Code Examples", category: "Implementation" },
        },
      ];

      return [
        {
          iteration: 1,
          query: query,
          retrievedDocs: mockDocs,
          totalDocs: mockDocs.length,
          isComplete: true,
        },
      ];
    } catch (error) {
      this.logger.error(`Fallback vector search failed: ${error.message}`);
      throw new Error(`Fallback vector search failed: ${error.message}`);
    }
  }

  /**
   * Fallback reranking method (original implementation)
   */
  private async rerankResultsFallback(
    query: string,
    results: any[]
  ): Promise<any> {
    try {
      this.logger.debug("Reranking search results");

      // This would use actual reranking service (Cohere, cross-encoder, etc.)
      // For now, simulate reranking by adjusting scores
      const rerankedDocs = (
        results.length > 0 && results[0].retrievedDocs
          ? results[0].retrievedDocs
          : []
      )
        .map(doc => ({
          ...doc,
          rerankScore: doc.score * (0.9 + Math.random() * 0.2), // Simulate reranking
        }))
        .sort(
          (a, b) => (b.rerankScore || b.score) - (a.rerankScore || a.score)
        );

      return {
        ...results,
        rerankedDocs: rerankedDocs,
      };
    } catch (error) {
      this.logger.warn(
        `Reranking failed, using original results: ${error.message}`
      );
      return results;
    }
  }

  /**
   * Generate response based on retrieved documents
   */
  private async generateResponse(
    query: string,
    searchResults: CoRAGResults,
    language: string,
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<AgentResponse> {
    try {
      const systemPrompt = this.getSystemPromptFromConfig(config);
      const userPrompt = this.buildUserPrompt(query, searchResults);

      const messages: BaseMessage[] = [
        new AIMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      this.logger.debug("Generating authoritative response");

      const modelId = this.getModelIdFromConfig(config);

      // ❌ trackLLMCall не существует - используем прямой вызов
      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      // Extract confidence and reasoning from response
      const confidenceMatch = content.match(/CONFIDENCE:\s*([0-9.]+)/);
      const reasoningMatch = content.match(/REASONING:\s*(.+?)(?=ANSWER:|$)/s);

      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7;
      const reasoning = reasoningMatch
        ? reasoningMatch[1].trim()
        : "Generated from documentation";

      // Extract main answer
      const answerMatch = content.match(/ANSWER:\s*(.+)/s);
      const answer = answerMatch ? answerMatch[1].trim() : content;

      return {
        content: answer,
        confidence: confidence,
        sources:
          searchResults.rerankedDocs?.map(doc => doc.source) ||
          searchResults.retrievedDocs.map(doc => doc.source),
        reasoning: reasoning,
        metadata: {
          searchResults: searchResults,
          generationTime: new Date().toISOString(),
          model: "gpt-4o",
        },
      };
    } catch (error) {
      this.logger.error(`Response generation failed: ${error.message}`);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }

  /**
   * Get system prompt from configuration (English only)
   */
  private getSystemPromptFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): string {
    const authoritativeConfig =
      config.configurable?.graphSettings?.authoritativeAgent;

    // Use prompt from config if available, otherwise use default fallback
    if (authoritativeConfig?.systemPrompt) {
      return authoritativeConfig.systemPrompt;
    }

    // Default fallback prompt (English only)
    return `You are an authoritative technical support agent. Your task is to provide accurate, documentation-based answers.

WORKING PRINCIPLES:
- Use ONLY information from provided documents
- Be precise and specific
- If uncertain - be honest about it
- Include source references
- Provide practical examples when possible

RESPONSE FORMAT:
CONFIDENCE: [number from 0.0 to 1.0]
REASONING: [why this confidence level]
ANSWER: [main answer to user]

IMPORTANT:
- If confidence below 0.5 - honestly say additional research is needed
- Never make up information not in the documents`;
  }

  /**
   * Build user prompt with search results
   */
  private buildUserPrompt(query: string, searchResults: CoRAGResults): string {
    const docs = searchResults.rerankedDocs || searchResults.retrievedDocs;

    let prompt = `User query: "${query}"\n\nRelevant documentation:\n\n`;

    docs.forEach((doc, index) => {
      prompt += `Document ${index + 1} (${doc.source}):\n${doc.content}\n\n`;
    });

    prompt += `Based on the above documentation, provide a comprehensive answer to the user's query.`;

    return prompt;
  }

  /**
   * Create FAQ-based response
   */
  private async createFAQResponse(
    state: SupportWorkflowStateValues,
    faqResult: { content: string; confidence: number; source: string },
    startTime: number,
    stepUpdate: Partial<SupportWorkflowStateValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const agentResponse: AgentResponse = {
      content: faqResult.content,
      confidence: faqResult.confidence,
      sources: [faqResult.source],
      reasoning: "Found direct match in FAQ database",
      metadata: {
        responseType: "faq_match",
        processingTime: Date.now() - startTime,
      },
    };

    const finalResponse = this.createFinalResponse(
      agentResponse,
      Date.now() - startTime
    );

    return {
      ...stepUpdate,
      agentResponse,
      finalResponse,
      output: {
        text: finalResponse.content,
        attachments: [],
        metadata: {
          agentUsed: "authoritative",
          confidence: agentResponse.confidence,
          sources: agentResponse.sources,
          processingTime: finalResponse.processingTime,
          responseType: "faq",
        },
      },
    };
  }

  /**
   * Create final response object
   */
  private createFinalResponse(
    agentResponse: AgentResponse,
    processingTime: number
  ) {
    return {
      content: agentResponse.content,
      sources: agentResponse.sources,
      confidence: agentResponse.confidence,
      agentUsed: "authoritative" as const,
      processingTime,
      metadata: {
        reasoning: agentResponse.reasoning,
        ...agentResponse.metadata,
      },
    };
  }

  /**
   * Create citation attachments from sources
   */
  private createAttachments(sources: string[]): any[] {
    return sources.map(source => ({
      type: AttachmentType.CITATION,
      value: {
        source: {
          url: "",
          title: source,
          type: "article",
        },
      },
      metadata: { sourceType: "documentation" },
    }));
  }

  /**
   * Record token usage for monitoring
   */
  private async recordTokenUsage(
    state: SupportWorkflowStateValues,
    startTime: number
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const processingTime = Date.now() - startTime;

    // Estimate token usage
    const estimatedInputTokens = Math.floor(state.input.query.length / 3) + 500; // +500 for context
    const estimatedOutputTokens = 300; // Typical authoritative response

    state.usageRecorder.recordModelExecution({
      nodeId: "authoritative_agent",
      timestamp: Date.now(),
      modelId: "gpt-4o",
      promptTokens: estimatedInputTokens,
      completionTokens: estimatedOutputTokens,
      latencyMs: processingTime,
    });

    return {
      usageRecorder: state.usageRecorder,
    };
  }
}
