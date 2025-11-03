import { Injectable, Logger } from "@nestjs/common";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  AgentResponse,
  CoRAGResults,
  ResearchIteration,
  DecomposedQuery,
  ValidationResult,
  SupportWorkflowConfigValues,
} from "../graph.state";
import {
  VectorSearchConfig,
  CoRAGConfig,
  CoRAGStrategy,
  RerankingModel,
  DocumentSource,
  ConfidenceLevel,
  SupportErrorType,
  SupportError,
} from "../../common/types";
import { QueryDecomposerSubgraph } from "../subgraphs/query-decomposer.subgraph";
import { CoRAGRetrievalSubgraph } from "../subgraphs/corag-retrieval.subgraph";
import { KnowledgeRerankerSubgraph } from "../subgraphs/knowledge-reranker.subgraph";
import { ModelInitializer, RetrieverService } from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ DOES NOT EXIST - commented out
import { ReflectionValidatorSubgraph } from "../subgraphs/reflection-validator.subgraph";
import { AttachmentType } from "@flutchai/flutch-sdk";

/**
 * ExploratoryAgent Node - Deep iterative search and analysis
 *
 * Architecture with four key subgraphs:
 * 1. QueryDecomposer - decomposition of complex queries into sub-queries
 * 2. CoRAG-Retrieval - iterative search with Chain-of-Retrieval
 * 3. KnowledgeReranker - intelligent reranking of results
 * 4. ReflectionValidator - response quality validation
 *
 * Focus on search and analysis quality without excessive personalization.
 */

@Injectable()
export class ExploratoryAgentNode {
  private readonly logger = new Logger(ExploratoryAgentNode.name);
  private llm: BaseChatModel;
  private reflectionLLM: BaseChatModel;
  private currentConfig: LangGraphRunnableConfig<SupportWorkflowConfigValues>;
  private currentState: SupportWorkflowStateValues;

  // Four key subgraphs for quality search and analysis
  private readonly queryDecomposer: QueryDecomposerSubgraph;
  private readonly coragRetrieval: CoRAGRetrievalSubgraph;
  private readonly knowledgeReranker: KnowledgeRerankerSubgraph;
  private readonly reflectionValidator: ReflectionValidatorSubgraph;

  // Dynamic configurations (loaded from manifest)
  private coragConfig: CoRAGConfig;
  private vectorConfig: VectorSearchConfig;
  private subgraphConfigs: {
    queryDecomposer: any;
    coragRetrieval: any;
    knowledgeReranker: any;
    reflectionValidator: any;
  };

  constructor(
    private readonly modelInitializer: ModelInitializer,
    private readonly retrieverService?: RetrieverService
  ) {
    // Initialize four key subgraphs
    this.queryDecomposer = new QueryDecomposerSubgraph();
    this.coragRetrieval = new CoRAGRetrievalSubgraph(retrieverService);
    this.knowledgeReranker = new KnowledgeRerankerSubgraph();
    this.reflectionValidator = new ReflectionValidatorSubgraph();
  }

  /**
   * Initialize LLMs from config parameters
   */
  private async initializeFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<void> {
    // Store config for later use
    this.currentConfig = config;

    const researchConfig = config.configurable?.graphSettings?.researchAgent;
    if (!researchConfig) {
      throw new Error("ResearchAgent requires configuration in graphSettings");
    }

    // Support both new JSON schema format and legacy llmConfig format
    let modelId: string,
      temperature: number | undefined,
      maxTokens: number | undefined;

    if (researchConfig.llmConfig) {
      // Legacy format
      ({ modelId, temperature, maxTokens } = researchConfig.llmConfig);
    } else {
      // New JSON schema format - properties directly under researchConfig
      modelId = researchConfig.model;
      temperature = researchConfig.temperature;
      maxTokens = researchConfig.maxTokens;
    }

    if (!modelId) {
      throw new Error("ResearchAgent requires model/modelId in configuration");
    }

    // Main LLM
    this.llm = await this.modelInitializer.initializeChatModel({
      modelId,
      temperature,
      maxTokens,
    });

    // Reflection LLM (use same config or fallback)
    const reflectionConfig = researchConfig.reflectionLlmConfig;
    let reflectionModelId = modelId;
    let reflectionTemperature = temperature;
    let reflectionMaxTokens = maxTokens;

    if (reflectionConfig) {
      reflectionModelId = reflectionConfig.modelId || modelId;
      reflectionTemperature = reflectionConfig.temperature || temperature;
      reflectionMaxTokens = reflectionConfig.maxTokens || maxTokens;
    } else if (researchConfig.reflectionTemperature) {
      // Use special reflection temperature from JSON schema if available
      reflectionTemperature = researchConfig.reflectionTemperature;
    }

    this.reflectionLLM = await this.modelInitializer.initializeChatModel({
      modelId: reflectionModelId,
      temperature: reflectionTemperature,
      maxTokens: reflectionMaxTokens,
    });

    // Initialize with manifest configurations from builder
    this.initializeDefaultConfigurations();

    this.logger.debug(
      `ResearchAgent initialized with models: ${modelId}, reflection: ${reflectionConfig.modelId || modelId}`
    );
  }

  /**
   * Get model ID from config for tracking
   */
  private getModelIdFromConfig(
    config?: LangGraphRunnableConfig<SupportWorkflowConfigValues>,
    isReflection: boolean = false
  ): string {
    const configToUse = config || this.currentConfig;
    if (!configToUse) {
      return "unknown-model";
    }

    const researchConfig =
      configToUse.configurable?.graphSettings?.researchAgent;
    if (!researchConfig) {
      return "unknown-model";
    }

    if (isReflection && researchConfig?.reflectionLlmConfig?.modelId) {
      return researchConfig.reflectionLlmConfig.modelId;
    }

    // Support both new JSON schema format and legacy llmConfig format
    return (
      researchConfig.llmConfig?.modelId ||
      researchConfig.model ||
      "unknown-model"
    );
  }

  /**
   * Initialize with manifest-based configurations (fallback to defaults)
   */
  private initializeDefaultConfigurations(): void {
    this.coragConfig = {
      maxIterations: 5,
      strategy: CoRAGStrategy.ADAPTIVE,
      convergenceThreshold: 0.85,
      enableReranking: true,
      rerankingModel: RerankingModel.COHERE_RERANK,
      contextWindowSize: 8000,
    };

    this.vectorConfig = {
      topK: 15,
      threshold: 0.6,
      hybridSearch: true,
      filters: {},
    };

    this.subgraphConfigs = {
      queryDecomposer: QueryDecomposerSubgraph.getDefaultConfig(),
      coragRetrieval: CoRAGRetrievalSubgraph.getDefaultConfig(),
      knowledgeReranker: KnowledgeRerankerSubgraph.getDefaultConfig(),
      reflectionValidator: ReflectionValidatorSubgraph.getDefaultConfig(),
    };

    this.logger.debug("Initialized with manifest configurations");
  }

  /**
   * Update configuration from manifest (called by builder)
   */
  async updateConfiguration(config: {
    queryDecomposer?: any;
    coragRetrieval?: any;
    knowledgeReranker?: any;
    reflectionValidator?: any;
    general?: any;
  }): Promise<void> {
    try {
      this.logger.log("Updating ResearchAgent configuration from manifest...");

      // Update general CoRAG config
      if (config.general) {
        this.coragConfig = {
          ...this.coragConfig,
          maxIterations:
            config.general.maxIterations || this.coragConfig.maxIterations,
          convergenceThreshold:
            config.coragRetrieval?.adequacyThreshold ||
            this.coragConfig.convergenceThreshold,
          enableReranking: config.general.enableReranking !== false,
        };

        // Update LLM temperature
        if (config.general.temperature !== undefined) {
          // Temperature is set during model initialization, not as a property
          this.logger.debug(
            `Temperature ${config.general.temperature} will be applied during next model initialization`
          );
        }
      }

      // Update subgraph configurations
      this.subgraphConfigs = {
        queryDecomposer: {
          ...this.subgraphConfigs.queryDecomposer,
          ...config.queryDecomposer,
        },
        coragRetrieval: {
          ...this.subgraphConfigs.coragRetrieval,
          ...config.coragRetrieval,
        },
        knowledgeReranker: {
          ...this.subgraphConfigs.knowledgeReranker,
          ...config.knowledgeReranker,
        },
        reflectionValidator: {
          ...this.subgraphConfigs.reflectionValidator,
          ...config.reflectionValidator,
        },
      };

      this.logger.log(
        "ResearchAgent configuration updated successfully from manifest"
      );
      this.logger.debug("Updated configurations:", {
        coragMaxIterations: this.coragConfig.maxIterations,
        enableReranking: this.coragConfig.enableReranking,
        llmTemperature: 0.7, // Default temperature, actual value set during initialization
        subgraphsConfigured: Object.keys(this.subgraphConfigs).length,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update ResearchAgent configuration: ${error.message}`
      );
      this.logger.warn(
        "ResearchAgent will continue using fallback configurations"
      );
    }
  }

  /**
   * Execute the exploratory agent logic with full subgraph integration (Spec)
   */
  async execute(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    // Store current state and initialize LLMs if needed
    this.currentState = state;
    if (!this.llm || !this.reflectionLLM) {
      await this.initializeFromConfig(config);
    }

    this.logger.log(
      `Research agent starting advanced analysis with full subgraph integration for: ${state.input.query.substring(0, 100)}...`
    );

    const startTime = Date.now();

    try {
      // Advance workflow step
      const stepUpdate = SupportWorkflowStateUtils.advanceStep(
        state,
        "exploratory_agent"
      );

      // Step 1: Query Decomposition with QueryDecomposer subgraph
      this.logger.debug("Step 1: Query decomposition");
      const decompositionResult = await this.queryDecomposer.execute(
        state.input.query,
        state.messages || [],
        {
          expertiseLevel: "intermediate",
          technicalBackground: [],
          preferredLanguage: "ru",
        }, // Simplified user profile
        this.subgraphConfigs.queryDecomposer
      );

      // Step 2: CoRAG Retrieval for each subquery
      this.logger.debug(
        `Step 2: CoRAG retrieval for ${decompositionResult.decomposedQueries.length} sub-queries`
      );
      const allCoRAGResults: any[] = [];
      const retrievedSources: any[] = [];

      for (const subQuery of decompositionResult.decomposedQueries) {
        const coragResult = await this.coragRetrieval.execute(
          subQuery.subQuery,
          this.createUserContext(state),
          this.subgraphConfigs.coragRetrieval
        );
        allCoRAGResults.push({
          subQuery: subQuery.subQuery,
          intent: subQuery.intent,
          priority: subQuery.priority,
          ...coragResult,
        });
        retrievedSources.push(...coragResult.finalDocuments);
      }

      // Step 3: Knowledge Reranking of all found documents
      this.logger.debug(
        `Step 3: Knowledge reranking of ${retrievedSources.length} documents`
      );
      const rerankedResults = await this.knowledgeReranker.execute(
        state.input.query,
        retrievedSources,
        {
          expertiseLevel: "intermediate",
          technicalBackground: [],
          preferredLanguage: "ru",
        }, // Simplified user profile
        state.messages || [],
        this.subgraphConfigs.knowledgeReranker
      );

      // Step 4: Synthesize findings using reranked results
      this.logger.debug("Step 4: Advanced synthesis with reranked knowledge");
      const synthesis = await this.synthesizeAdvancedFindings(
        state.input.query,
        decompositionResult,
        allCoRAGResults,
        rerankedResults,
        state.input.language || "en"
      );

      // Step 5: Reflection Validation of answer quality
      this.logger.debug("Step 5: Response quality validation");
      const validationResult = await this.reflectionValidator.execute(
        state.input.query,
        synthesis.finalAnswer,
        rerankedResults,
        state.messages || [],
        {
          expertiseLevel: "intermediate",
          technicalBackground: [],
          preferredLanguage: "ru",
        }, // Simplified user profile
        this.subgraphConfigs.reflectionValidator
      );

      // Step 6: Create comprehensive agent response (without personalization)
      const agentResponse: AgentResponse = {
        content: synthesis.finalAnswer,
        confidence: this.calculateFinalConfidence(
          synthesis.confidence,
          validationResult.qualityScore
        ),
        sources: synthesis.sources,
        reasoning: synthesis.reasoning,
        followUpQuestions: synthesis.followUpQuestions,
        reflection: {
          qualityScore: validationResult.qualityScore,
          completeness:
            validationResult.qualityMetrics?.completeness ||
            validationResult.completenessScore,
          accuracy:
            validationResult.qualityMetrics?.accuracy ||
            validationResult.accuracyScore,
          improvements: validationResult.improvements,
        },
        metadata: {
          decomposedQueries: decompositionResult.decomposedQueries,
          searchStrategy: decompositionResult.searchStrategy,
          coragIterations: allCoRAGResults
            .map(r => r.totalIterations)
            .reduce((a, b) => a + b, 0),
          rerankedCount: rerankedResults.length,
          validationIssues: validationResult.issues.length,
          processingTime: Date.now() - startTime,
        },
      };

      // Step 7: Create final response
      const finalResponse = this.createAdvancedFinalResponse(
        agentResponse,
        Date.now() - startTime
      );

      this.logger.log(
        `Research agent completed with advanced architecture: ` +
          `${decompositionResult.decomposedQueries.length} sub-queries, ` +
          `${allCoRAGResults.map(r => r.totalIterations).reduce((a, b) => a + b, 0)} CoRAG iterations, ` +
          `${rerankedResults.length} reranked docs, ` +
          `quality score: ${validationResult.qualityScore.toFixed(2)}, ` +
          `confidence: ${agentResponse.confidence.toFixed(2)}`
      );

      // Record comprehensive usage
      const usageUpdate = await this.recordAdvancedTokenUsage(
        state,
        startTime,
        decompositionResult,
        allCoRAGResults
      );

      return {
        ...stepUpdate,
        agentResponse,
        finalResponse,
        // Update state with all subgraph results according to Spec
        decomposedQueries: decompositionResult.decomposedQueries,
        coragContext: allCoRAGResults.flatMap(r => r.coragContext),
        rerankedResults,
        validationResult,
        output: {
          text: finalResponse.content,
          attachments: this.createAdvancedAttachments(agentResponse.sources),
          metadata: {
            agentUsed: "exploratory",
            confidence: agentResponse.confidence,
            sources: agentResponse.sources,
            processingTime: finalResponse.processingTime,
            subgraphResults: {
              queryDecomposition: decompositionResult,
              coragResults: allCoRAGResults,
              reranking: { totalDocuments: rerankedResults.length },
              validation: validationResult,
            },
          },
        },
        usageRecorder: usageUpdate.usageRecorder,
      };
    } catch (error) {
      this.logger.error(
        `Research agent with subgraphs failed: ${error.message}`,
        error.stack
      );

      const errorUpdate = SupportWorkflowStateUtils.addError(
        state,
        `Research agent failed: ${error.message}`
      );

      return {
        ...errorUpdate,
        metadata: {
          ...state.metadata,
          researchError: {
            type: SupportErrorType.GENERATION_ERROR,
            message: error.message,
            timestamp: new Date().toISOString(),
            recovery: "Should escalate to escalation agent",
            subgraphIntegration: "Failed during subgraph execution",
          } as SupportError,
        },
      };
    }
  }

  /**
   * Create research plan by breaking down the query
   */
  private async createResearchPlan(
    query: string,
    language: string,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<{
    mainQuestion: string;
    subQuestions: string[];
    searchQueries: string[];
    expectedSources: string[];
    strategy: CoRAGStrategy;
  }> {
    try {
      const systemPrompt = this.getSystemPromptFromConfig(this.currentConfig);
      const userPrompt = `Original query: "${query}"\n\nCreate a research plan for this query.`;

      const messages: BaseMessage[] = [
        new AIMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      this.logger.debug("Creating research plan");

      const modelId = this.getModelIdFromConfig();

      // ❌ trackLLMCall does not exist - using direct call
      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      // Parse the research plan (in a real implementation, this would be more robust)
      const plan = {
        mainQuestion: query,
        subQuestions: this.extractSubQuestions(content),
        searchQueries: this.generateSearchQueries(query),
        expectedSources: [
          DocumentSource.DOCUMENTATION,
          DocumentSource.API_REFERENCE,
          DocumentSource.USER_MANUAL,
          DocumentSource.COMMUNITY_FORUM,
        ],
        strategy: this.selectStrategy(query),
      };

      this.logger.debug(
        `Created research plan with ${plan.subQuestions.length} sub-questions`
      );
      return plan;
    } catch (error) {
      this.logger.error(`Research planning failed: ${error.message}`);
      // Fallback plan
      return {
        mainQuestion: query,
        subQuestions: [query],
        searchQueries: [query],
        expectedSources: [DocumentSource.DOCUMENTATION],
        strategy: CoRAGStrategy.ADAPTIVE,
      };
    }
  }

  /**
   * Execute iterative CoRAG search
   */
  private async executeCoRAGIterations(
    researchPlan: any,
    state: SupportWorkflowStateValues
  ): Promise<ResearchIteration[]> {
    const iterations: ResearchIteration[] = [];
    let currentQuery = researchPlan.mainQuestion;
    let convergenceReached = false;

    for (
      let i = 0;
      i < this.coragConfig.maxIterations && !convergenceReached;
      i++
    ) {
      this.logger.debug(
        `Starting CoRAG iteration ${i + 1} with query: "${currentQuery}"`
      );

      try {
        // Perform vector search for current query
        const searchResults = await this.performVectorSearch(
          currentQuery,
          i + 1
        );

        // Rerank results
        const rerankedResults = await this.rerankResults(
          currentQuery,
          searchResults
        );

        // Synthesize current iteration findings
        const iterationSynthesis = await this.synthesizeIteration(
          currentQuery,
          rerankedResults,
          iterations,
          state.input.language || "en"
        );

        // Determine next action
        const nextAction = this.determineNextAction(
          iterationSynthesis,
          iterations
        );

        const iteration: ResearchIteration = {
          iteration: i + 1,
          query: currentQuery,
          results: rerankedResults,
          synthesis: iterationSynthesis.content,
          nextAction,
          reasoning: iterationSynthesis.reasoning,
        };

        iterations.push(iteration);

        // Check convergence
        if (
          nextAction === "complete" ||
          iterationSynthesis.confidence >= this.coragConfig.convergenceThreshold
        ) {
          convergenceReached = true;
          this.logger.debug(`CoRAG converged at iteration ${i + 1}`);
        } else if (nextAction === "escalate") {
          this.logger.warn(`CoRAG iteration ${i + 1} suggests escalation`);
          break;
        } else {
          // Generate next query based on gaps
          currentQuery = await this.generateNextQuery(
            researchPlan.mainQuestion,
            iterations,
            state.input.language || "en"
          );
        }
      } catch (error) {
        this.logger.error(`CoRAG iteration ${i + 1} failed: ${error.message}`);
        break;
      }
    }

    this.logger.log(`Completed ${iterations.length} CoRAG iterations`);
    return iterations;
  }

  /**
   * Perform vector search for research iteration
   */
  private async performVectorSearch(
    query: string,
    iteration: number
  ): Promise<CoRAGResults> {
    try {
      // This would connect to actual vector database with broader search
      // For now, simulate comprehensive document retrieval
      const mockDocs = [
        {
          content: `Detailed information on the topic "${query}". This is a basic description of the concept with technical details and implementation examples.`,
          source: `Technical Documentation - ${query} Guide`,
          score: 0.87,
          metadata: { section: "Core Concepts", iteration },
        },
        {
          content: `Architectural solutions and patterns for "${query}". Various approaches and their comparative analysis are considered.`,
          source: `Architecture Guide - ${query} Patterns`,
          score: 0.84,
          metadata: { section: "Architecture", iteration },
        },
        {
          content: `Practical examples and use cases for "${query}". Includes code and configuration.`,
          source: `Examples Repository - ${query} Cases`,
          score: 0.81,
          metadata: { section: "Examples", iteration },
        },
        {
          content: `Community discusses best practices for "${query}". Real project experience and recommendations.`,
          source: `Community Forum - ${query} Discussion`,
          score: 0.78,
          metadata: { section: "Community", iteration },
        },
      ];

      return {
        iteration: iteration,
        query: query,
        retrievedDocs: mockDocs,
        totalDocs: mockDocs.length,
        isComplete: false, // Research continues
      };
    } catch (error) {
      this.logger.error(
        `Vector search failed in iteration ${iteration}: ${error.message}`
      );
      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  /**
   * Advanced reranking for research context
   */
  private async rerankResults(
    query: string,
    results: CoRAGResults
  ): Promise<CoRAGResults> {
    try {
      this.logger.debug(`Reranking ${results.retrievedDocs.length} documents`);

      // Enhanced reranking considering research context
      const rerankedDocs = results.retrievedDocs
        .map(doc => {
          const baseScore = doc.score;
          const diversityBonus = this.calculateDiversityBonus(
            doc,
            results.retrievedDocs
          );
          const freshnessPenalty = this.calculateFreshnessPenalty(doc);

          return {
            ...doc,
            rerankScore: baseScore + diversityBonus - freshnessPenalty,
          };
        })
        .sort(
          (a, b) => (b.rerankScore || b.score) - (a.rerankScore || a.score)
        );

      return {
        ...results,
        rerankedDocs: rerankedDocs,
      };
    } catch (error) {
      this.logger.warn(`Reranking failed: ${error.message}`);
      return results;
    }
  }

  /**
   * Synthesize findings from current iteration
   */
  private async synthesizeIteration(
    query: string,
    results: CoRAGResults,
    previousIterations: ResearchIteration[],
    language: string
  ): Promise<{
    content: string;
    confidence: number;
    reasoning: string;
    gaps: string[];
  }> {
    try {
      const systemPrompt = this.buildSynthesisPrompt(language);
      const userPrompt = this.buildIterationPrompt(
        query,
        results,
        previousIterations
      );

      const messages: BaseMessage[] = [
        new AIMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const modelId = this.getModelIdFromConfig();

      // ❌ trackLLMCall does not exist - using direct call
      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      // Extract structured information
      const confidence = this.extractConfidence(content) || 0.6;
      const reasoning =
        this.extractReasoning(content) || "Synthesized from available sources";
      const gaps = this.extractGaps(content) || [];

      return {
        content: content,
        confidence,
        reasoning,
        gaps,
      };
    } catch (error) {
      this.logger.error(`Iteration synthesis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Synthesize final answer from all iterations
   */
  private async synthesizeFindings(
    originalQuery: string,
    iterations: ResearchIteration[],
    language: string
  ): Promise<{
    finalAnswer: string;
    confidence: number;
    sources: string[];
    reasoning: string;
    followUpQuestions?: string[];
    qualityMetrics: any;
  }> {
    try {
      const systemPrompt = this.buildFinalSynthesisPrompt(language);
      const userPrompt = this.buildFinalSynthesisUserPrompt(
        originalQuery,
        iterations
      );

      const messages: BaseMessage[] = [
        new AIMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const modelId = this.getModelIdFromConfig();

      // ❌ trackLLMCall does not exist - using direct call
      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      // Collect all sources
      const allSources = [
        ...new Set(
          iterations.flatMap(iter =>
            (iter.results.rerankedDocs || iter.results.retrievedDocs).map(
              doc => doc.source
            )
          )
        ),
      ];

      const followUpQuestions = this.generateFollowUpQuestions(
        originalQuery,
        iterations
      );

      return {
        finalAnswer: content,
        confidence: this.calculateOverallConfidence(iterations),
        sources: allSources,
        reasoning: `Synthesized from ${iterations.length} exploratory iterations across multiple sources`,
        followUpQuestions,
        qualityMetrics: this.calculateQualityMetrics(iterations, content),
      };
    } catch (error) {
      this.logger.error(`Final synthesis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform self-reflection on the generated answer
   */
  private async performSelfReflection(
    query: string,
    synthesis: any,
    language: string,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<{
    qualityScore: number;
    completeness: number;
    accuracy: number;
    improvements: string[];
  }> {
    try {
      const systemPrompt = this.getReflectionPromptFromConfig(
        this.currentConfig
      );
      const userPrompt = `Original question: "${query}"\n\nGenerated answer: "${synthesis.finalAnswer}"\n\nPerform critical reflection on this answer.`;

      const messages: BaseMessage[] = [
        new AIMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const modelId = this.getModelIdFromConfig(undefined, true);

      // ❌ trackLLMCall does not exist - using direct call
      const response = await this.reflectionLLM.invoke(messages);
      const content = response.content as string;

      return {
        qualityScore: this.extractQualityScore(content) || 0.7,
        completeness: this.extractCompleteness(content) || 0.7,
        accuracy: this.extractAccuracy(content) || 0.8,
        improvements: this.extractImprovements(content) || [],
      };
    } catch (error) {
      this.logger.warn(`Self-reflection failed: ${error.message}`);
      return {
        qualityScore: 0.6,
        completeness: 0.6,
        accuracy: 0.7,
        improvements: ["Unable to perform self-reflection"],
      };
    }
  }

  // Helper methods for getting prompts from config (English only)
  private getSystemPromptFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): string {
    const researchConfig = config.configurable?.graphSettings?.researchAgent;

    if (researchConfig?.systemPrompt) {
      return researchConfig.systemPrompt;
    }

    // Default fallback prompt (English only)
    return `You are a research agent specializing in comprehensive technical analysis.

Your task is to:
- Decompose complex queries into research sub-questions
- Conduct iterative information retrieval
- Synthesize findings from multiple sources
- Validate information accuracy and completeness
- Provide detailed, well-researched answers

Focus on thoroughness and accuracy over speed.`;
  }

  private getReflectionPromptFromConfig(
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): string {
    const researchConfig = config.configurable?.graphSettings?.researchAgent;

    if (researchConfig?.reflectionPrompt) {
      return researchConfig.reflectionPrompt;
    }

    // Default fallback prompt (English only)
    return `You are a quality validator for research responses.

Analyze the provided answer for:
- Factual accuracy
- Completeness
- Clarity and tone
- Security considerations
- Overall quality

Provide a quality score (0.0-1.0) and specific improvement recommendations.`;
  }

  // Legacy methods for backwards compatibility (deprecated)
  private buildPlanningPrompt(language: string): string {
    const isRussian = language === "ru";

    if (isRussian) {
      return `You are a research agent creating plans for deep analysis of complex questions.

Your task is to break down complex questions into components for iterative research.

Create a research plan including:
- Main question
- Sub-questions for detailed study
- Search queries for different aspects
- Expected information sources
- Research strategy`;
    } else {
      return `You are a research agent creating plans for deep analysis of complex questions.

Your task is to break down complex questions into components for iterative research.

Create a research plan including:
- Main question
- Sub-questions for detailed study
- Search queries for different aspects
- Expected information sources
- Research strategy`;
    }
  }

  private buildSynthesisPrompt(language: string): string {
    const isRussian = language === "ru";

    if (isRussian) {
      return `You are a researcher synthesizing information from multiple sources.

Your task:
- Analyze found documents
- Extract key insights
- Identify information gaps
- Assess confidence level in conclusions

Be critical and objective in analysis.`;
    } else {
      return `You are a researcher synthesizing information from multiple sources.

Your task:
- Analyze found documents
- Extract key insights  
- Identify information gaps
- Assess confidence level in conclusions

Be critical and objective in analysis.`;
    }
  }

  private buildReflectionPrompt(language: string): string {
    const isRussian = language === "ru";

    if (isRussian) {
      return `You are a critical analyst checking answer quality.

Evaluate the generated answer by criteria:
- Quality (0-1): how good is the answer
- Completeness (0-1): is the question fully answered
- Accuracy (0-1): how accurate is the information
- Improvements: what can be improved

Be strict and objective in evaluation.`;
    } else {
      return `You are a critical analyst checking answer quality.

Evaluate the generated answer by criteria:
- Quality (0-1): how good is the answer
- Completeness (0-1): is the question fully answered
- Accuracy (0-1): how accurate is the information
- Improvements: what can be improved

Be strict and objective in evaluation.`;
    }
  }

  // Helper methods for extracting information from LLM responses
  private extractSubQuestions(content: string): string[] {
    // Simple regex-based extraction (would be more sophisticated in production)
    const matches = content.match(/(?:subquestion)[^:]*:([^\n]+)/gi);
    return (
      matches?.map(match => match.split(":")[1]?.trim()).filter(Boolean) || []
    );
  }

  private generateSearchQueries(mainQuery: string): string[] {
    // Generate variations of the main query
    return [
      mainQuery,
      `${mainQuery} implementation`,
      `${mainQuery} best practices`,
      `${mainQuery} examples`,
      `${mainQuery} configuration`,
    ];
  }

  private selectStrategy(query: string): CoRAGStrategy {
    // Simple heuristic for strategy selection
    if (query.includes("compare") || query.includes("vs")) {
      return CoRAGStrategy.BREADTH_FIRST;
    } else if (query.includes("how") || query.includes("step")) {
      return CoRAGStrategy.DEPTH_FIRST;
    }
    return CoRAGStrategy.ADAPTIVE;
  }

  private determineNextAction(
    synthesis: any,
    iterations: ResearchIteration[]
  ): "continue" | "complete" | "escalate" {
    if (synthesis.confidence >= 0.85) return "complete";
    if (iterations.length >= this.coragConfig.maxIterations) return "complete";
    if (synthesis.gaps && synthesis.gaps.length === 0) return "complete";
    return "continue";
  }

  private async generateNextQuery(
    originalQuery: string,
    iterations: ResearchIteration[],
    language: string
  ): Promise<string> {
    // Simple query refinement (would use LLM in production)
    const lastIteration = iterations[iterations.length - 1];
    return `${originalQuery} detailed explanation`;
  }

  private calculateDiversityBonus(doc: any, allDocs: any[]): number {
    // Simple diversity bonus calculation
    return 0.1; // Would implement proper diversity measurement
  }

  private calculateFreshnessPenalty(doc: any): number {
    // Simple freshness penalty
    return 0.05;
  }

  private extractConfidence(content: string): number | null {
    const match = content.match(/confidence[^:]*:\s*([0-9.]+)/i);
    return match ? parseFloat(match[1]) : null;
  }

  private extractReasoning(content: string): string | null {
    const match = content.match(/reasoning[^:]*:\s*(.+?)(?:\n|$)/i);
    return match ? match[1].trim() : null;
  }

  private extractGaps(content: string): string[] {
    // Extract information gaps from content
    return [];
  }

  private calculateOverallConfidence(iterations: ResearchIteration[]): number {
    // Calculate weighted confidence across iterations
    const avgConfidence =
      iterations.length > 0
        ? iterations.reduce((sum, iter) => {
            // Extract confidence from iteration synthesis (simplified)
            return sum + 0.7; // Would extract actual confidence
          }, 0) / iterations.length
        : 0.5; // Default confidence when no iterations

    return Math.min(avgConfidence, 0.95); // Cap at 0.95
  }

  private generateFollowUpQuestions(
    query: string,
    iterations: ResearchIteration[]
  ): string[] {
    // Generate relevant follow-up questions
    return [
      `Could you provide more specific details about ${query}?`,
      `Are there alternative approaches to ${query}?`,
      `What are common issues with ${query}?`,
    ];
  }

  private calculateQualityMetrics(
    iterations: ResearchIteration[],
    finalAnswer: string
  ): any {
    return {
      iterationEfficiency: iterations.length / this.coragConfig.maxIterations,
      sourcesDiversity: new Set(
        iterations.flatMap(i => i.results.retrievedDocs.map(d => d.source))
      ).size,
      answerLength: finalAnswer.length,
      comprehensiveness: 0.8, // Would calculate based on coverage
    };
  }

  // Reflection extraction methods
  private extractQualityScore(content: string): number | null {
    const match = content.match(/quality[^:]*:\s*([0-9.]+)/i);
    return match ? parseFloat(match[1]) : null;
  }

  private extractCompleteness(content: string): number | null {
    const match = content.match(/completeness[^:]*:\s*([0-9.]+)/i);
    return match ? parseFloat(match[1]) : null;
  }

  private extractAccuracy(content: string): number | null {
    const match = content.match(/accuracy[^:]*:\s*([0-9.]+)/i);
    return match ? parseFloat(match[1]) : null;
  }

  private extractImprovements(content: string): string[] {
    // Extract improvement suggestions
    const matches = content.match(/improvement[^:]*:([^\n]+)/gi);
    return (
      matches?.map(match => match.split(":")[1]?.trim()).filter(Boolean) || []
    );
  }

  private buildIterationPrompt(
    query: string,
    results: CoRAGResults,
    previousIterations: ResearchIteration[]
  ): string {
    let prompt = `Current query: "${query}"\n\nRetrieved documents:\n\n`;

    const docs = results.rerankedDocs || results.retrievedDocs;
    docs.forEach((doc, index) => {
      prompt += `Document ${index + 1} (${doc.source}):\n${doc.content}\n\n`;
    });

    if (previousIterations.length > 0) {
      prompt += `\nPrevious research findings:\n`;
      previousIterations.forEach((iter, index) => {
        prompt += `Iteration ${index + 1}: ${iter.synthesis}\n`;
      });
    }

    prompt += `\nSynthesize the current findings and determine what information gaps remain.`;

    return prompt;
  }

  private buildFinalSynthesisPrompt(language: string): string {
    const isRussian = language === "ru";

    if (isRussian) {
      return `You are a researcher creating final answer based on all conducted research.

Your task:
- Combine findings from all iterations
- Create complete and structured answer
- Cite information sources
- Suggest additional questions for study

Answer should be comprehensive and professional.`;
    } else {
      return `You are a researcher creating final answer based on all conducted research.

Your task:
- Combine findings from all iterations
- Create complete and structured answer
- Cite information sources
- Suggest additional questions for study

Answer should be comprehensive and professional.`;
    }
  }

  private buildFinalSynthesisUserPrompt(
    originalQuery: string,
    iterations: ResearchIteration[]
  ): string {
    let prompt = `Original question: "${originalQuery}"\n\nResearch iterations:\n\n`;

    iterations.forEach((iter, index) => {
      prompt += `Iteration ${index + 1} (Query: "${iter.query}"):\n`;
      prompt += `Findings: ${iter.synthesis}\n`;
      prompt += `Sources: ${(
        iter.results.rerankedDocs || iter.results.retrievedDocs
      )
        .map(doc => doc.source)
        .join(", ")}\n\n`;
    });

    prompt += `Create a comprehensive final answer that synthesizes all research findings.`;

    return prompt;
  }

  private createFinalResponse(
    agentResponse: AgentResponse,
    processingTime: number
  ) {
    return {
      content: agentResponse.content,
      sources: agentResponse.sources,
      confidence: agentResponse.confidence,
      agentUsed: "exploratory" as const,
      processingTime,
      metadata: {
        reasoning: agentResponse.reasoning,
        followUpQuestions: agentResponse.followUpQuestions,
        reflection: agentResponse.reflection,
        ...agentResponse.metadata,
      },
    };
  }

  private createAttachments(
    sources: string[],
    iterations: ResearchIteration[]
  ): any[] {
    // Return only citation sources
    return sources.map(source => ({
      type: AttachmentType.CITATION,
      value: {
        source: {
          url: "",
          title: source,
          type: "article",
        },
      },
      metadata: { sourceType: "research" },
    }));
  }

  private async recordTokenUsage(
    state: SupportWorkflowStateValues,
    startTime: number,
    iterations: number
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const processingTime = Date.now() - startTime;

    // Estimate token usage for multiple iterations
    const estimatedInputTokens =
      Math.floor(state.input.query.length / 3) * iterations + 1000; // Base context
    const estimatedOutputTokens = 500 * iterations; // Multiple responses

    state.usageRecorder.recordModelExecution({
      nodeId: "research_agent",
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

  /**
   * Helper methods for the new subgraph integration
   */

  /**
   * Create user context for CoRAG retrieval
   */
  private createUserContext(state: SupportWorkflowStateValues): any {
    return {
      userId: state.input.userId,
      sessionId: state.input.sessionId,
      priority: state.input.priority,
      context: state.input.context,
      language: state.input.language,
      conversationHistory: state.messages || [],
    };
  }

  /**
   * Advanced synthesis method using all subgraph results
   */
  private async synthesizeAdvancedFindings(
    originalQuery: string,
    decompositionResult: any,
    coragResults: any[],
    rerankedResults: any[],
    language: string
  ): Promise<{
    finalAnswer: string;
    confidence: number;
    sources: string[];
    reasoning: string;
    followUpQuestions?: string[];
    qualityMetrics: any;
  }> {
    try {
      // Build comprehensive context from all subgraph results
      let synthesisPrompt = `Original Query: "${originalQuery}"\n\n`;

      // Add decomposition context
      synthesisPrompt += `Query Analysis:\n`;
      synthesisPrompt += `- Main intent: ${decompositionResult.searchStrategy}\n`;
      synthesisPrompt += `- Sub-queries processed: ${decompositionResult.decomposedQueries.length}\n\n`;

      // Add CoRAG findings
      synthesisPrompt += `Research Findings:\n`;
      for (let i = 0; i < coragResults.length; i++) {
        const result = coragResults[i];
        synthesisPrompt += `Sub-query ${i + 1}: "${result.subQuery}" (${result.intent})\n`;
        synthesisPrompt += `- Total iterations: ${result.totalIterations}\n`;
        synthesisPrompt += `- Documents found: ${result.finalDocuments.length}\n\n`;
      }

      // Add top reranked documents
      synthesisPrompt += `Top Reranked Knowledge:\n`;
      const topDocs = rerankedResults.slice(0, 5);
      for (let i = 0; i < topDocs.length; i++) {
        const doc = topDocs[i];
        synthesisPrompt += `${i + 1}. ${doc.document.source} (score: ${doc.finalScore.toFixed(3)})\n`;
        synthesisPrompt += `   ${doc.document.content.substring(0, 200)}...\n`;
        synthesisPrompt += `   Rationale: ${doc.rankingRationale}\n\n`;
      }

      synthesisPrompt += `Please synthesize a comprehensive answer that addresses the original query using all this research.`;

      // Use LLM to synthesize
      const systemPrompt =
        language === "ru"
          ? "You are an expert researcher synthesizing comprehensive answers based on deep analysis. Create structured, accurate and useful responses."
          : "You are an expert researcher synthesizing comprehensive answers based on deep analysis. Create structured, accurate and useful responses.";

      const messages: BaseMessage[] = [
        new AIMessage(systemPrompt),
        new HumanMessage(synthesisPrompt),
      ];

      const modelId = this.getModelIdFromConfig();

      // ❌ trackLLMCall does not exist - using direct call
      const response = await this.llm.invoke(messages);
      const finalAnswer = response.content as string;

      // Collect all unique sources
      const allSources = [
        ...new Set(rerankedResults.map(doc => doc.document.source)),
      ];

      // Generate follow-up questions based on decomposition
      const followUpQuestions = this.generateAdvancedFollowUpQuestions(
        originalQuery,
        decompositionResult
      );

      // Calculate confidence based on multiple factors
      const baseConfidence = Math.min(
        rerankedResults.length > 0
          ? rerankedResults[0]?.finalScore || 0.7
          : 0.6,
        0.9
      );

      const confidence = Math.max(
        baseConfidence * (0.8 + Math.min(coragResults.length, 5) * 0.04), // Bonus for multiple CoRAG iterations
        0.5
      );

      return {
        finalAnswer,
        confidence,
        sources: allSources,
        reasoning: `Synthesized from ${coragResults.length} CoRAG research iterations with ${rerankedResults.length} reranked documents`,
        followUpQuestions,
        qualityMetrics: {
          sourcesDiversity: allSources.length,
          coragIterations: coragResults.reduce(
            (sum, r) => sum + r.totalIterations,
            0
          ),
          rerankedDocuments: rerankedResults.length,
          comprehensiveness: Math.min(
            decompositionResult.decomposedQueries.length / 3,
            1.0
          ),
        },
      };
    } catch (error) {
      this.logger.error(`Advanced synthesis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate final confidence combining synthesis and validation scores
   */
  private calculateFinalConfidence(
    synthesisConfidence: number,
    validationScore: number
  ): number {
    // Weighted average with validation having more weight for reliability
    const weightedConfidence =
      synthesisConfidence * 0.4 + validationScore * 0.6;
    return Math.max(0.1, Math.min(weightedConfidence, 0.95));
  }

  /**
   * Generate advanced follow-up questions based on decomposition results
   */
  private generateAdvancedFollowUpQuestions(
    originalQuery: string,
    decompositionResult: any
  ): string[] {
    const questions: string[] = [];

    // Add questions based on sub-queries that might need expansion
    for (const subQuery of decompositionResult.decomposedQueries.slice(1, 4)) {
      // Skip first (main), take up to 3
      if (subQuery.intent === "example") {
        questions.push(
          `Can you provide more specific examples on "${subQuery.subQuery}"?`
        );
      } else if (subQuery.intent === "troubleshooting") {
        questions.push(
          `What other issues might arise with "${subQuery.subQuery}"?`
        );
      } else if (subQuery.intent === "configuration") {
        questions.push(
          `Are there alternative ways to configure "${subQuery.subQuery}"?`
        );
      }
    }

    // Add general follow-up based on search strategy
    if (decompositionResult.searchStrategy === "parallel") {
      questions.push(
        `Can you provide more details about one of the aspects of ${originalQuery}?`
      );
    } else if (decompositionResult.searchStrategy === "sequential") {
      questions.push(
        `What next steps should be taken after ${originalQuery}?`
      );
    }

    return questions.slice(0, 3); // Limit to 3 questions
  }

  /**
   * Create final response with comprehensive metadata
   */
  private createAdvancedFinalResponse(
    agentResponse: AgentResponse,
    processingTime: number
  ) {
    return {
      content: agentResponse.content,
      sources: agentResponse.sources,
      confidence: agentResponse.confidence,
      agentUsed: "exploratory" as const,
      processingTime,
      metadata: {
        reasoning: agentResponse.reasoning,
        followUpQuestions: agentResponse.followUpQuestions,
        reflection: agentResponse.reflection,
        subgraphIntegration: "full", // Indicates all 5 subgraphs were used
        ...agentResponse.metadata,
      },
    };
  }

  /**
   * Create research attachments from sources
   */
  private createAdvancedAttachments(sources: string[]): any[] {
    return sources.map(source => ({
      type: AttachmentType.CITATION,
      value: {
        source: {
          url: "",
          title: source,
          type: "article" as const,
        },
      },
      metadata: { sourceType: "research_reranked" },
    }));
  }

  /**
   * Record advanced token usage for all subgraphs
   */
  private async recordAdvancedTokenUsage(
    state: SupportWorkflowStateValues,
    startTime: number,
    decompositionResult: any,
    coragResults: any[]
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const processingTime = Date.now() - startTime;

    // Estimate comprehensive token usage for all subgraphs
    const baseTokens = Math.floor(state.input.query.length / 3);
    const totalIterations = coragResults.reduce(
      (sum, r) => sum + r.totalIterations,
      0
    );

    const estimatedInputTokens =
      baseTokens * decompositionResult.decomposedQueries.length + // Decomposition
      baseTokens * totalIterations + // CoRAG iterations
      baseTokens * 2 + // Reranking
      baseTokens * 3 + // Validation
      baseTokens * 2 + // Personalization
      2000; // Base context for synthesis

    const estimatedOutputTokens =
      200 * decompositionResult.decomposedQueries.length + // Decomposition outputs
      300 * totalIterations + // CoRAG outputs
      100 + // Reranking scores
      500 + // Validation results
      400 + // Personalization
      1000; // Final synthesis

    state.usageRecorder.recordModelExecution({
      nodeId: "research_agent_advanced",
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
