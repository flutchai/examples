import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { AbstractGraphBuilder } from "@flutchai/flutch-sdk";
import { IGraphRequestPayload } from "@flutchai/flutch-sdk";
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgenticSupportRuntimeConfig } from "../../graph.config";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
  SupportWorkflowStateAnnotation,
  SupportWorkflowStateUtils,
  SupportWorkflowStateValues,
} from "../../graph.state";
import { AgentType } from "../../graph.state";
import { QueryTransformationNode } from "../../nodes/query-transformation.node";
import { ConversationRouterNode } from "../../nodes/conversation-router.node";
import { AuthoritativeAgentNode } from "../../nodes/authoritative-agent.node";
import { ExploratoryAgentNode } from "../../nodes/exploratory-agent.node";
import { EscalationAgentNode } from "../../nodes/escalation-agent.node";
import { OutputAgentResponseNode } from "../../nodes/output_agent-response.node";
import { OutputClarifyEscalateNode } from "../../nodes/output_clarify-escalate.node";
import { ResponseOrchestratorNode } from "../../nodes/response-orchestrator.node";
import { ModelInitializer, RetrieverService } from "@flutchai/flutch-sdk";
// import { GraphExecutionMonitor } from "../../utils/graph-execution-monitor";
import * as path from "path";

/**
 * Builder for Agentic Support Graph version 1.0.0
 * Multi-agent support system with intelligent routing and CoRAG
 *
 * Workflow flow (Optimized for Performance):
 * 1. ConversationRouter - analyzes query and routes to appropriate agent
 * 2. Agent execution - AuthoritativeAgent, ExploratoryAgent, or EscalationAgent
 * 3. Conditional output:
 *    - If confident (>0.7): output_agent_response (streaming success response)
 *    - If uncertain (<0.7): output_clarify_escalate (clarification/escalation)
 * 4. End - workflow completion
 *
 */
@Injectable()
export class SupportGraphV1Builder
  extends AbstractGraphBuilder<"1.0.0">
  implements OnModuleInit
{
  readonly version = "1.0.0" as const;

  // Node instances
  private queryTransformation: QueryTransformationNode;
  private conversationRouter: ConversationRouterNode;
  private authoritativeAgent: AuthoritativeAgentNode;
  private exploratoryAgent: ExploratoryAgentNode;
  private escalationAgent: EscalationAgentNode;
  private responseOrchestrator: ResponseOrchestratorNode;
  private outputAgentResponse: OutputAgentResponseNode;
  private outputClarifyEscalate: OutputClarifyEscalateNode;

  // Runtime configuration (unused - configs come from graphSettings at runtime)
  private runtimeConfig: Record<string, any> = {};

  constructor(
    @Inject("MODEL_INITIALIZER")
    private modelInitializer: ModelInitializer,
    @Inject("RETRIEVER_SERVICE")
    private retrieverService: RetrieverService,
    @Inject("CHECKPOINTER")
    private readonly checkpointer: MongoDBSaver
    // private executionMonitor: GraphExecutionMonitor = new GraphExecutionMonitor()
  ) {
    super();

    // Initialize nodes with ModelInitializer and services (models initialized on-demand)
    this.queryTransformation = new QueryTransformationNode(
      this.modelInitializer
    );
    this.conversationRouter = new ConversationRouterNode(this.modelInitializer);
    this.authoritativeAgent = new AuthoritativeAgentNode(this.modelInitializer);
    this.exploratoryAgent = new ExploratoryAgentNode(
      this.modelInitializer,
      this.retrieverService
    );
    this.escalationAgent = new EscalationAgentNode(this.modelInitializer);
    this.responseOrchestrator = new ResponseOrchestratorNode();
    this.outputAgentResponse = new OutputAgentResponseNode(
      this.modelInitializer
    );
    this.outputClarifyEscalate = new OutputClarifyEscalateNode(
      this.modelInitializer
    );

    // Manifest is now automatically loaded from root on first access
    this.logger.log(
      "SupportGraphV1Builder initialized with new manifest system"
    );
  }

  /**
   * Initialize manifest after module is loaded
   * Proper async initialization in lifecycle hook
   */
  async onModuleInit(): Promise<void> {
    try {
      this.logger.log("Initializing SupportGraphV1Builder...");

      // Load version config for graph metadata only
      const versionConfig = await this.getVersionConfig();
      if (versionConfig) {
        this.logger.log(`Loaded version config for ${versionConfig.graphType}`);
      } else {
        this.logger.warn("No version config loaded");
      }

      this.logger.log("SupportGraphV1Builder initialization completed");
    } catch (error) {
      this.logger.error(
        `Failed to initialize SupportGraphV1Builder: ${error instanceof Error ? error.message : String(error)}`
      );
      this.logger.warn("Using built-in fallback configurations");
      // Don't re-throw - allow service to start with fallback config
    }
  }

  /**
   * Wrap node execution with config injection (monitoring disabled temporarily)
   */
  private wrapNodeExecution(
    nodeName: string,
    nodeExecutor: (state: any, config: any) => Promise<any>
  ): (state: any, config: any) => Promise<any> {
    return async (state: any, config: any) => {
      const executionId = config?.metadata?.executionId || `exec-${Date.now()}`;

      try {
        // Inject runtime config and execution metadata
        const enhancedConfig = {
          ...config,
          metadata: { ...config.metadata, executionId },
          configurable: {
            ...config.configurable,
            graphSettings: {
              ...config.configurable?.graphSettings,
              ...this.runtimeConfig,
            },
          },
        };

        const result = await nodeExecutor(state, enhancedConfig);
        return result;
      } catch (error) {
        throw error;
      }
    };
  }

  /**
   * Build the multi-agent support workflow according to Technical Specification
   * Similar to flutch-support, we inject runtime configuration into each node execution
   */
  async buildGraph(_payload?: any) {
    this.logger.log(
      "🔧 Building agentic support workflow v1.0.0 according to TS"
    );

    const workflow = new StateGraph(SupportWorkflowStateAnnotation)
      // Add all nodes with monitoring and config injection using wrapper
      .addNode(
        "query_transformation",
        this.wrapNodeExecution(
          "query_transformation",
          this.queryTransformation.execute.bind(this.queryTransformation)
        )
      )
      .addNode(
        "conversation_router",
        this.wrapNodeExecution(
          "conversation_router",
          this.conversationRouter.execute.bind(this.conversationRouter)
        )
      )
      .addNode(
        "authoritative_agent",
        this.wrapNodeExecution(
          "authoritative_agent",
          this.authoritativeAgent.execute.bind(this.authoritativeAgent)
        )
      )
      .addNode(
        "research_agent",
        this.wrapNodeExecution(
          "research_agent",
          this.exploratoryAgent.execute.bind(this.exploratoryAgent)
        )
      )
      .addNode(
        "escalation_agent",
        this.wrapNodeExecution(
          "escalation_agent",
          this.escalationAgent.execute.bind(this.escalationAgent)
        )
      )
      .addNode(
        "response_orchestrator",
        this.wrapNodeExecution(
          "response_orchestrator",
          this.responseOrchestrator.execute.bind(this.responseOrchestrator)
        )
      )
      .addNode(
        "output_agent_response",
        this.wrapNodeExecution(
          "output_agent_response",
          this.outputAgentResponse.execute.bind(this.outputAgentResponse)
        )
      )
      .addNode(
        "output_clarify_escalate",
        this.wrapNodeExecution(
          "output_clarify_escalate",
          this.outputClarifyEscalate.execute.bind(this.outputClarifyEscalate)
        )
      );

    // Start with query transformation (per TS requirement)
    workflow.addEdge(START, "query_transformation");

    // Query transformation flows to conversation router
    workflow.addEdge("query_transformation", "conversation_router");

    // Route from conversation_router to appropriate agent
    workflow.addConditionalEdges(
      "conversation_router",
      (state: SupportWorkflowStateValues) => {
        const decision = state.routerDecision;

        if (!decision) {
          this.logger.warn(
            "No router decision found, defaulting to escalation"
          );
          return "escalation_agent";
        }

        const selectedAgent = decision.selectedAgent;
        this.logger.debug(
          `Router selected: ${selectedAgent} (confidence: ${decision.confidence})`
        );

        // Map agent types to node names
        switch (selectedAgent) {
          case "authoritative":
            return "authoritative_agent";
          case "exploratory":
            return "research_agent";
          case "escalation":
            return "escalation_agent";
          default:
            this.logger.warn(
              `Unknown agent type: ${selectedAgent}, defaulting to escalation`
            );
            return "escalation_agent";
        }
      },
      {
        authoritative_agent: "authoritative_agent",
        research_agent: "research_agent",
        escalation_agent: "escalation_agent",
      }
    );

    // Handle agent responses with conditional output routing
    workflow.addConditionalEdges(
      "authoritative_agent",
      (state: SupportWorkflowStateValues) => {
        return this.handleAgentOutput(state, "authoritative");
      },
      {
        research_agent: "research_agent",
        escalation_agent: "escalation_agent",
        output_agent_response: "output_agent_response",
        output_clarify_escalate: "output_clarify_escalate",
      }
    );

    workflow.addConditionalEdges(
      "research_agent",
      (state: SupportWorkflowStateValues) => {
        return this.handleAgentOutput(state, "exploratory");
      },
      {
        escalation_agent: "escalation_agent",
        output_agent_response: "output_agent_response",
        output_clarify_escalate: "output_clarify_escalate",
      }
    );

    // Escalation agent always goes to conditional output
    workflow.addConditionalEdges(
      "escalation_agent",
      (state: SupportWorkflowStateValues) => {
        return this.handleAgentOutput(state, "escalation");
      },
      {
        output_agent_response: "output_agent_response",
        output_clarify_escalate: "output_clarify_escalate",
      }
    );

    // ResponseOrchestrator routes based on pure routing decision
    workflow.addConditionalEdges(
      "response_orchestrator",
      (state: SupportWorkflowStateValues) => {
        const decision = state.orchestratorDecision;

        // Route based on orchestrator's routing decision
        switch (decision) {
          case "response":
            this.logger.log(
              `ResponseOrchestrator routed to response (output_agent_response)`
            );
            return "output_agent_response";

          case "clarify":
            this.logger.log(
              `ResponseOrchestrator routed to clarification (output_clarify_escalate in clarify mode)`
            );
            return "output_clarify_escalate";

          case "escalate":
            this.logger.log(
              `ResponseOrchestrator routed to escalation (output_clarify_escalate in escalate mode)`
            );
            return "output_clarify_escalate";

          default:
            this.logger.warn(
              `ResponseOrchestrator: Unknown decision '${decision}', defaulting to escalation`
            );
            return "output_clarify_escalate";
        }
      },
      {
        output_agent_response: "output_agent_response",
        output_clarify_escalate: "output_clarify_escalate",
      }
    );

    // Output nodes end the workflow
    workflow.addEdge("output_agent_response", END);
    workflow.addEdge("output_clarify_escalate", END);

    const compiledWorkflow = workflow.compile({
      checkpointer: this.checkpointer,
      interruptBefore: [], // Allow workflow to run to completion
      interruptAfter: [], // No automatic interruption
    });

    this.logger.log("✅ Compiled optimized agentic support workflow v1.0.0");
    this.logger.log(
      "🔄 Flow: QueryTransformation → Router → Agent → ResponseOrchestrator → [output_agent_response | output_clarify_escalate] → END"
    );

    return compiledWorkflow;
  }

  // /**
  //  * Wrap the compiled workflow with execution-level monitoring
  //  */
  // private wrapWorkflowWithMonitoring(workflow: any): any {
  //   // Monitoring temporarily disabled
  //   return workflow;
  // }

  /**
   * Handle agent output routing - decide between success response or clarification/escalation
   */
  private handleAgentOutput(
    state: SupportWorkflowStateValues,
    agentType: "authoritative" | "exploratory" | "escalation"
  ): string {
    const agentResponse = state.agentResponse;

    // For escalation agent, we only have two valid outputs
    if (agentType === "escalation") {
      // Check escalation details to determine output
      const escalationDetails = state.metadata?.escalationAnalysis;

      if (
        escalationDetails?.category === "unclear_query" ||
        escalationDetails?.severity === "low"
      ) {
        this.logger.log(
          `${agentType} agent needs clarification/escalation (confidence: ${agentResponse?.confidence || 0.3}), sending to output_clarify_escalate`
        );
        return "output_clarify_escalate";
      } else {
        this.logger.log(
          `${agentType} agent completed with category: ${escalationDetails?.category}, sending to output_clarify_escalate`
        );
        return "output_clarify_escalate";
      }
    }

    // For non-escalation agents, handle normally but only return valid destinations
    if (!agentResponse) {
      this.logger.warn(
        `No response from ${agentType} agent, needs clarification`
      );
      return "output_clarify_escalate";
    }

    // Check if agent explicitly failed or has very low confidence
    if (agentResponse.confidence < 0.3) {
      this.logger.log(
        `${agentType} agent confidence too low (${agentResponse.confidence}), needs clarification`
      );
      return "output_clarify_escalate";
    }

    // For authoritative agent with medium confidence - still try to provide response
    // but log that it might need research escalation later
    if (agentType === "authoritative" && agentResponse.confidence < 0.6) {
      this.logger.log(
        `Authoritative agent has medium confidence (${agentResponse.confidence}), providing response but may need research escalation`
      );
      // Continue to normal routing logic below
    }

    // Check for errors in workflow
    if (state.progress?.hasErrors) {
      this.logger.log(`${agentType} agent has errors, needs clarification`);
      return "output_clarify_escalate";
    }

    // Main routing decision: confident response vs clarification/escalation
    if (
      agentResponse.confidence >= 0.7 &&
      agentResponse.content &&
      agentResponse.content.length > 0
    ) {
      this.logger.log(
        `${agentType} agent provided confident response (${agentResponse.confidence}), sending to output_agent_response`
      );
      return "output_agent_response";
    } else {
      this.logger.log(
        `${agentType} agent needs clarification/escalation (confidence: ${agentResponse.confidence}), sending to output_clarify_escalate`
      );
      return "output_clarify_escalate";
    }
  }

  /**
   * Handle agent completion and determine next steps (Updated according to TS)
   */
  private handleAgentCompletionV2(
    state: SupportWorkflowStateValues,
    agentType: "authoritative" | "exploratory"
  ): string {
    const agentResponse = state.agentResponse;

    if (!agentResponse) {
      this.logger.warn(`No response from ${agentType} agent, escalating`);
      return "escalation_agent";
    }

    // Check if agent explicitly failed or has very low confidence
    if (agentResponse.confidence < 0.3) {
      this.logger.log(
        `${agentType} agent confidence too low (${agentResponse.confidence}), escalating`
      );
      return "escalation_agent";
    }

    // Check if authoritative agent should escalate to research
    if (agentType === "authoritative" && agentResponse.confidence < 0.6) {
      const shouldEscalateToResearch =
        state.metadata?.authoritativeAttempt?.shouldEscalate;

      if (shouldEscalateToResearch) {
        this.logger.log(
          `Authoritative agent suggested research escalation (confidence: ${agentResponse.confidence})`
        );
        return "research_agent";
      }
    }

    // Check for errors in workflow
    if (state.progress?.hasErrors) {
      this.logger.log(`${agentType} agent has errors, escalating`);
      return "escalation_agent";
    }

    // According to TS: successful agents go to ResponseOrchestrator
    if (agentResponse.content && agentResponse.content.length > 0) {
      this.logger.log(
        `${agentType} agent completed successfully, proceeding to ResponseOrchestrator`
      );
      return "response_orchestrator";
    }

    // Fallback: escalate to ensure user gets help
    this.logger.warn(`${agentType} agent unclear state, escalating for safety`);
    return "escalation_agent";
  }

  /**
   * Handle agent completion and determine next steps (Legacy method - keep for compatibility)
   */
  private handleAgentCompletion(
    state: SupportWorkflowStateValues,
    agentType: "authoritative" | "exploratory"
  ): string {
    const agentResponse = state.agentResponse;

    if (!agentResponse) {
      this.logger.warn(`No response from ${agentType} agent, escalating`);
      return "escalation_agent";
    }

    // Check if agent explicitly failed or has very low confidence
    if (agentResponse.confidence < 0.3) {
      this.logger.log(
        `${agentType} agent confidence too low (${agentResponse.confidence}), escalating`
      );
      return "escalation_agent";
    }

    // Check if authoritative agent should escalate to research
    if (agentType === "authoritative" && agentResponse.confidence < 0.6) {
      // Check metadata to see if escalation to research is suggested
      const shouldEscalateToResearch =
        state.metadata?.authoritativeAttempt?.shouldEscalate;

      if (shouldEscalateToResearch) {
        this.logger.log(
          `Authoritative agent suggested research escalation (confidence: ${agentResponse.confidence})`
        );
        return "research_agent";
      }
    }

    // Check for errors in workflow
    if (state.progress?.hasErrors) {
      this.logger.log(`${agentType} agent has errors, escalating`);
      return "escalation_agent";
    }

    // Check if final response is available and satisfactory
    if (state.finalResponse && state.finalResponse.confidence >= 0.6) {
      this.logger.log(
        `${agentType} agent completed successfully (confidence: ${state.finalResponse.confidence})`
      );
      return "__end__";
    }

    // Default: complete workflow if we have a response
    if (agentResponse.content && agentResponse.content.length > 0) {
      this.logger.log(
        `${agentType} agent provided response, completing workflow`
      );
      return "__end__";
    }

    // Fallback: escalate to ensure user gets help
    this.logger.warn(`${agentType} agent unclear state, escalating for safety`);
    return "escalation_agent";
  }

  /**
   * Configure all components with manifest settings using proper type resolution
   */

  /**
   * Get configuration for specific subgraph from manifest
   */
  private getSubgraphConfig(_subgraphName: string, _manifest?: any): any {
    // No manifest-based defaults; subgraph configs should come from runtime graphSettings
    return {};
  }

  /**
   * Merge runtime configuration with manifest defaults
   */
  private mergeConfigurations(
    manifestConfig: any,
    runtimeConfig: any = {}
  ): any {
    // Deep merge stage-based config allowing runtime overrides per stage
    const deepMerge = (a: any, b: any): any => {
      if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
      if (typeof a !== "object" || typeof b !== "object" || !a || !b)
        return b ?? a;
      const out: any = { ...a };
      for (const key of Object.keys(b)) {
        out[key] = key in a ? deepMerge(a[key], b[key]) : b[key];
      }
      return out;
    };
    return deepMerge(manifestConfig, runtimeConfig);
  }

  /**
   * Prepare configuration for support workflow (updated to use manifest)
   */
  async prepareConfig(payload: IGraphRequestPayload & { supportData?: any }) {
    // Extract support-specific data from payload
    const supportData = payload.supportData || {};

    // Use manifest defaults resolved at module init

    // Extract user query from message
    let query = "No query provided";

    if (payload.message) {
      const messageObj = payload.message as any;
      if (messageObj.kwargs?.content) {
        query = messageObj.kwargs.content.toString();
      } else if (payload.message.content) {
        query = payload.message.content.toString();
      }
    } else if (supportData.query) {
      query = supportData.query;
    }

    if (query === "No query provided") {
      this.logger.warn("No query found in payload.message or supportData");
    }

    // Create initial workflow state
    const initialState = SupportWorkflowStateUtils.createInitialState({
      userId: supportData.userId || payload.userId,
      query: query,
      context: supportData.context,
      priority: supportData.priority || "medium",
      language: supportData.language || "ru",
      sessionId: supportData.sessionId || `session-${payload.threadId}`,
    });

    // Merge manifest runtime settings with runtime payload overrides (if any)
    const finalSettings = this.mergeConfigurations(
      this.runtimeConfig,
      payload.graphSettings
    );

    return {
      input: {
        ...initialState,
        // Add current message to messages array for conversation history
        messages: [payload.message],
      },
      configurable: {
        thread_id: payload.threadId,
        checkpoint_ns: this.graphType,
        checkpoint_id: `${payload.threadId}-${Date.now()}`,
        metadata: {
          userId: payload.userId,
          agentId: payload.agentId,
          workflowType: this.graphType,
          version: this.version,
          supportData,
          configurationSource: "manifest-with-runtime-overrides",
        },
        // Include comprehensive settings from manifest + runtime overrides
        graphSettings: finalSettings,
        // Provide easy access to subgraph configurations for research/authoritative agents
        subgraphConfigs: {
          queryDecomposer: finalSettings?.researchAgent?.queryDecomposer || {},
          coragRetrieval:
            finalSettings?.authoritativeAgent?.coragRetrieval ||
            finalSettings?.researchAgent?.coragRetrieval ||
            {},
          knowledgeReranker:
            finalSettings?.authoritativeAgent?.knowledgeReranker ||
            finalSettings?.researchAgent?.knowledgeReranker ||
            {},
          reflectionValidator:
            finalSettings?.researchAgent?.reflectionValidator || {},
        },
      },
    };
  }

  /**
   * Helper method to create a simple support request
   */
  static createSupportRequest(
    userId: string,
    query: string,
    priority?: "low" | "medium" | "high" | "critical",
    context?: string,
    language?: "ru" | "en"
  ) {
    return {
      userId,
      query,
      priority: priority || "medium",
      context,
      language: language || "ru",
      sessionId: `session-${Date.now()}`,
    };
  }

  /**
   * Helper method to create urgent support request
   */
  static createUrgentSupportRequest(
    userId: string,
    query: string,
    context?: string
  ) {
    return this.createSupportRequest(userId, query, "critical", context);
  }

  /**
   * Helper method to create documentation query
   */
  static createDocumentationQuery(
    userId: string,
    topic: string,
    specificQuestion?: string,
    language?: "ru" | "en"
  ) {
    const query = specificQuestion
      ? `${topic}: ${specificQuestion}`
      : `Tell me about ${topic}`;

    return this.createSupportRequest(
      userId,
      query,
      "medium",
      undefined,
      language
    );
  }

  /**
   * Helper method to create research request
   */
  static createResearchRequest(
    userId: string,
    researchQuestion: string,
    context?: string,
    language?: "ru" | "en"
  ) {
    return this.createSupportRequest(
      userId,
      researchQuestion,
      "medium",
      context,
      language
    );
  }

  /**
   * Get service instance from DI container for callbacks
   */
  getService<T>(serviceClass: new (...args: any[]) => T): T {
    // Return specific services if needed by callbacks
    // For now, we don't have specific services to return
    throw new Error(
      `Service ${serviceClass.name} is not available through getService method`
    );
  }

  /**
   * Get current workflow metrics
   */
  async getWorkflowMetrics(threadId: string): Promise<any> {
    try {
      // This would retrieve metrics from checkpointer or monitoring system
      return {
        threadId,
        totalRequests: 0, // Would count from checkpointer
        averageProcessingTime: 0,
        agentUsageDistribution: {
          authoritative: 0,
          research: 0,
          escalation: 0,
        },
        satisfactionScore: 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get workflow metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Check workflow health
   */
  async checkWorkflowHealth(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    issues: string[];
    metrics: any;
  }> {
    const issues: string[] = [];

    try {
      // Check if all components are available
      if (!this.conversationRouter)
        issues.push("ConversationRouter not available");
      if (!this.authoritativeAgent)
        issues.push("AuthoritativeAgent not available");
      if (!this.exploratoryAgent) issues.push("ExploratoryAgent not available");
      if (!this.escalationAgent) issues.push("EscalationAgent not available");
      if (!this.responseOrchestrator)
        issues.push("ResponseOrchestrator not available");
      // if (!this.checkpointer) issues.push("Checkpointer not available");

      const status =
        issues.length === 0
          ? "healthy"
          : issues.length <= 2
            ? "degraded"
            : "unhealthy";

      return {
        status,
        issues,
        metrics: {
          componentsHealthy: 4 - issues.length,
          totalComponents: 4,
          checkTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return {
        status: "unhealthy",
        issues: [`Health check failed: ${error.message}`],
        metrics: {},
      };
    }
  }
}
