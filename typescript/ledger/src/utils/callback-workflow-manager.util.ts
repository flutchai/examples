import { Logger } from "@nestjs/common";
import { CallbackStore } from "@flutchai/flutch-sdk";
import { WorkflowStateValues } from "../graph/graph.state";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Manages callback creation and workflow continuation for ledger operations
 */
export class CallbackWorkflowManager {
  private static readonly logger = new Logger("CallbackWorkflowManager");

  /**
   * Creates a callback with proper workflow continuation metadata
   */
  static async createWorkflowCallback(
    callbackStore: CallbackStore,
    params: {
      graphType: string;
      handler: string;
      userId: string;
      threadId: string;
      callbackType: string;
      callbackParams: any;
      workflowMetadata?: any;
    }
  ): Promise<string> {
    const callbackId = await callbackStore.issue({
      graphType: params.graphType,
      handler: params.handler,
      userId: params.userId,
      threadId: params.threadId,
      params: params.callbackParams,
      metadata: {
        callbackType: params.callbackType,
        workflowContinuation: true,
        createdAt: new Date().toISOString(),
        ...params.workflowMetadata,
      },
    });

    this.logger.log(
      `Created workflow callback: ${callbackId} for ${params.callbackType}`
    );

    return callbackId;
  }

  /**
   * Validates that a callback properly resumes workflow
   */
  static validateCallbackResumption(
    callbackId: string,
    expectedType: string,
    threadId: string
  ): boolean {
    // This would integrate with your callback store to validate
    // For now, just log the validation attempt
    this.logger.log(
      `Validating callback resumption: ${callbackId}, type: ${expectedType}, thread: ${threadId}`
    );
    return true;
  }

  /**
   * Creates state update for workflow continuation after callback
   */
  static createWorkflowContinuationState(
    originalState: WorkflowStateValues,
    callbackResult: any,
    nextStep: string
  ): Partial<WorkflowStateValues> {
    const continuationState = {
      ...originalState,
      waitingFor: undefined, // Clear waiting state
      pendingCallback: undefined, // Clear pending callback
      accountsResolved: callbackResult.accountsResolved || false,
      resolvedAccounts:
        callbackResult.resolvedAccounts || originalState.resolvedAccounts,
      progress: {
        ...originalState.progress,
        currentStep: nextStep as any,
      },
      metadata: {
        ...originalState.metadata,
        callbackProcessed: true,
        callbackResult: callbackResult.type,
        resumedAt: new Date().toISOString(),
      },
    };

    this.logger.log(`Created continuation state for next step: ${nextStep}`);

    return continuationState;
  }

  /**
   * Handles workflow timeout scenarios
   */
  static handleWorkflowTimeout(
    threadId: string,
    waitingFor: string,
    timeoutMinutes: number = 30
  ): void {
    // This would be called by a scheduler to handle stuck workflows
    this.logger.warn(
      `Workflow timeout detected: thread ${threadId}, waiting for ${waitingFor}, timeout: ${timeoutMinutes}min`
    );

    // Could implement:
    // 1. Send reminder to user
    // 2. Auto-cancel after extended timeout
    // 3. Log analytics about abandoned workflows
  }

  /**
   * Logs workflow continuation statistics
   */
  static logWorkflowStats(stats: {
    threadId: string;
    totalDuration: number;
    callbackCount: number;
    nodeExecutions: number;
    llmCalls: number;
  }): void {
    this.logger.log(`Workflow completed: ${JSON.stringify(stats)}`);

    // Could send to metrics service:
    // - Average workflow completion time
    // - Callback success rate
    // - Most common failure points
  }
}
