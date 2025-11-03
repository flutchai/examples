import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  SupportWorkflowConfigValues,
  AgentType,
} from "../graph.state";
import { formatError, getErrorMessage } from "@flutchai/flutch-sdk";
// import { GraphExecutionMonitor } from "../../utils/graph-execution-monitor";

/**
 * FinalizeNode - Workflow completion with metrics aggregation
 *
 * Responsibilities:
 * - Aggregate all workflow execution metrics
 * - Finalize token usage and billing
 * - Create final response with metadata
 * - Log results for monitoring
 * - Clean up temporary data
 */
@Injectable()
export class OutputFinalizeNode {
  private readonly logger = new Logger(OutputFinalizeNode.name);

  constructor() {} // private readonly executionMonitor?: GraphExecutionMonitor

  /**
   * Main execution method - finalize workflow and aggregate metrics
   */
  async execute(
    state: SupportWorkflowStateValues,
    config?: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const executionId = config?.metadata?.executionId || "unknown";

    try {
      this.logger.log(`🏁 Finalizing workflow execution: ${executionId}`);

      // Start monitoring this node execution (disabled)
      // this.executionMonitor?.startNodeExecution(executionId, 'finalize', state);

      // Aggregate all metrics from the workflow
      const aggregatedMetrics = await this.aggregateWorkflowMetrics(state);

      // Finalize token usage and billing
      const finalUsage = this.finalizeUsageMetrics(state);

      // Create final response with all metadata
      const finalResponse = this.createFinalResponse(state, aggregatedMetrics);

      // Log execution summary for monitoring
      this.logExecutionSummary(state, aggregatedMetrics, finalUsage);

      // Clean up temporary data
      const cleanedState = this.cleanupTemporaryData(state);

      const finalState = {
        ...cleanedState,
        finalResponse,
        executionMetrics: aggregatedMetrics,
        progress: {
          ...state.progress,
          currentStep: "finalized" as const,
          completedAt: new Date().toISOString(),
        },
        generation: {
          text: finalResponse.content,
          metadata: {
            modelId: "finalize",
            timestamp: new Date().toISOString(),
            nodeType: "output_finalize",
            confidence: finalResponse.confidence,
            agentUsed: finalResponse.agentUsed,
            processingTime: finalResponse.processingTime,
            sources: finalResponse.sources,
            executionMetrics: aggregatedMetrics,
          },
        },
      };

      // Complete monitoring for this node (disabled)
      // this.executionMonitor?.completeNodeExecution(
      //   executionId,
      //   'finalize',
      //   finalState,
      //   true,
      //   undefined,
      //   { aggregatedMetrics, finalUsage }
      // );

      this.logger.log(`✅ Workflow finalization completed: ${executionId}`);

      return finalState;
    } catch (error) {
      const errorInfo = formatError(error);
      this.logger.error(
        `❌ Finalization failed: ${errorInfo.message}`,
        errorInfo
      );

      // Complete monitoring with error (disabled)
      // this.executionMonitor?.completeNodeExecution(
      //   executionId,
      //   'finalize',
      //   { ...state, error: errorInfo.message },
      //   false,
      //   error instanceof Error ? error : new Error(errorInfo.message)
      // );

      // Return error state but don't throw - let workflow complete gracefully
      const errorResponse = {
        content:
          "An error occurred while finalizing the response. Please try again.",
        confidence: 0.1,
        sources: [],
        agentUsed: "escalation" as AgentType,
        processingTime: 0,
        metadata: {
          error: true,
          errorMessage: errorInfo.message,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        ...state,
        finalResponse: errorResponse,
        progress: {
          ...state.progress,
          currentStep: "error" as const,
          completedAt: new Date().toISOString(),
        },
        generation: {
          text: errorResponse.content,
          metadata: {
            modelId: "finalize",
            timestamp: new Date().toISOString(),
            nodeType: "output_finalize",
            error: true,
            errorMessage: errorInfo.message,
          },
        },
      };
    }
  }

  /**
   * Aggregate metrics from all workflow stages
   */
  private async aggregateWorkflowMetrics(
    state: SupportWorkflowStateValues
  ): Promise<{
    totalExecutionTime: number;
    nodeExecutionTimes: Record<string, number>;
    totalTokensUsed: number;
    tokenUsageByModel: Record<string, number>;
    searchMetrics?: {
      totalSearches: number;
      documentsRetrieved: number;
      averageRelevanceScore: number;
    };
    qualityMetrics: {
      confidence: number;
      sourceCount: number;
      hasValidation: boolean;
    };
  }> {
    try {
      // Basic execution metrics
      const startTime = state.progress?.startedAt
        ? new Date(state.progress.startedAt).getTime()
        : Date.now();
      const totalExecutionTime = Date.now() - startTime;

      // Token usage aggregation
      const records = state.usageRecorder?.getRecords();
      const totalTokensUsed =
        records?.modelCalls?.reduce(
          (sum, call) => sum + call.promptTokens + call.completionTokens,
          0
        ) || 0;
      const tokenUsageByModel: Record<string, number> = {};

      // Search metrics from CoRAG results - disabled temporarily
      let searchMetrics;
      // if (state.coragResults?.length) {
      //   // CoRAGResults logic here when type is fixed
      // }

      // Quality metrics
      const qualityMetrics = {
        confidence:
          state.agentResponse?.confidence ||
          state.finalResponse?.confidence ||
          0,
        sourceCount:
          state.agentResponse?.sources?.length ||
          state.finalResponse?.sources?.length ||
          0,
        hasValidation: !!state.validationResult,
      };

      // Node execution times (if available from monitor)
      const nodeExecutionTimes: Record<string, number> = {};
      // This would be populated by the execution monitor

      return {
        totalExecutionTime,
        nodeExecutionTimes,
        totalTokensUsed,
        tokenUsageByModel,
        searchMetrics,
        qualityMetrics,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to aggregate metrics: ${getErrorMessage(error)}`
      );
      return {
        totalExecutionTime: 0,
        nodeExecutionTimes: {},
        totalTokensUsed: 0,
        tokenUsageByModel: {},
        qualityMetrics: { confidence: 0, sourceCount: 0, hasValidation: false },
      };
    }
  }

  /**
   * Finalize usage metrics for billing
   */
  private finalizeUsageMetrics(state: SupportWorkflowStateValues): {
    totalCost: number;
    costByModel: Record<string, number>;
    billableUnits: number;
  } {
    try {
      if (!state.usageRecorder) {
        return { totalCost: 0, costByModel: {}, billableUnits: 0 };
      }

      const records = state.usageRecorder.getRecords();

      // Calculate total cost (simplified calculation)
      const totalCost = 0; // TODO: implement cost calculation
      const costByModel = {};
      const billableUnits =
        records?.modelCalls?.reduce(
          (sum, call) => sum + call.promptTokens + call.completionTokens,
          0
        ) || 0;

      return {
        totalCost,
        costByModel,
        billableUnits,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to finalize usage metrics: ${getErrorMessage(error)}`
      );
      return { totalCost: 0, costByModel: {}, billableUnits: 0 };
    }
  }

  /**
   * Create final response with all aggregated data
   */
  private createFinalResponse(
    state: SupportWorkflowStateValues,
    metrics: any
  ): {
    content: string;
    confidence: number;
    sources: string[];
    agentUsed: any; // AgentType
    processingTime: number;
    metadata: Record<string, any>;
  } {
    // Use existing final response if available
    if (state.finalResponse) {
      return {
        content: state.finalResponse.content,
        confidence: state.finalResponse.confidence,
        sources: state.finalResponse.sources,
        agentUsed: state.finalResponse.agentUsed,
        processingTime: state.finalResponse.processingTime,
        metadata: {
          ...state.finalResponse.metadata,
          executionMetrics: metrics,
          finalizedAt: new Date().toISOString(),
        },
      };
    }

    // Use agent response if available
    if (state.agentResponse) {
      return {
        content: state.agentResponse.content,
        confidence: state.agentResponse.confidence,
        sources: state.agentResponse.sources || [],
        agentUsed: (state.agentResponse as any).agentUsed || "unknown",
        processingTime: (state.agentResponse as any).processingTime || 0,
        metadata: {
          agentUsed: (state.agentResponse as any).agentUsed || "unknown",
          executionMetrics: metrics,
          finalizedAt: new Date().toISOString(),
        },
      };
    }

    // Fallback response
    return {
      content: "Request processing completed, but response was not generated.",
      confidence: 0.1,
      sources: [],
      agentUsed: "fallback",
      processingTime: 0,
      metadata: {
        fallback: true,
        executionMetrics: metrics,
        finalizedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Log execution summary for monitoring and debugging
   */
  private logExecutionSummary(
    state: SupportWorkflowStateValues,
    metrics: any,
    usage: any
  ): void {
    this.logger.log(`📊 Workflow execution summary:`, {
      query: state.input?.query?.substring(0, 100),
      agentType: state.routerDecision?.selectedAgent,
      executionTime: `${metrics.totalExecutionTime}ms`,
      tokensUsed: metrics.totalTokensUsed,
      cost: usage.totalCost,
      confidence: metrics.qualityMetrics.confidence,
      sources: metrics.qualityMetrics.sourceCount,
      searchesPerformed: metrics.searchMetrics?.totalSearches || 0,
      documentsRetrieved: metrics.searchMetrics?.documentsRetrieved || 0,
    });
  }

  /**
   * Clean up temporary data that's not needed in final state
   */
  private cleanupTemporaryData(
    state: SupportWorkflowStateValues
  ): SupportWorkflowStateValues {
    const cleaned = { ...state };

    // Remove large temporary arrays but keep summary metrics
    if (cleaned.decomposedQueries?.length > 5) {
      cleaned.decomposedQueries = cleaned.decomposedQueries.slice(0, 5);
    }

    if (cleaned.messages?.length > 10) {
      cleaned.messages = [
        ...cleaned.messages.slice(0, 2), // Keep first 2
        ...cleaned.messages.slice(-8), // Keep last 8
      ];
    }

    // Remove temporary processing data (if exists)
    delete (cleaned as any).currentIteration;
    delete (cleaned as any).temporaryResults;

    return cleaned;
  }
}
