import { Logger } from "@nestjs/common";
import { WorkflowStateValues } from "../graph/graph.state";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Utility for monitoring and debugging workflow state transitions
 */
export class WorkflowMonitor {
  private static readonly logger = new Logger("WorkflowMonitor");

  /**
   * Logs detailed workflow state at node entry
   */
  static logNodeEntry(
    nodeName: string,
    state: WorkflowStateValues,
    config: LangGraphRunnableConfig<any>
  ): void {
    const stateInfo = {
      node: nodeName,
      threadId: config.configurable?.thread_id,
      requestId: config.configurable?.metadata?.requestId,

      // Input state
      input: {
        userId: state.input.userId,
        amount: state.input.amount,
        description:
          state.input.description?.substring(0, 100) +
          (state.input.description?.length > 100 ? "..." : ""),
        transactionType: state.input.transactionType,
      },

      // Workflow progress
      progress: {
        currentStep: state.progress?.currentStep,
        completedSteps: state.progress?.completedSteps,
        hasErrors: state.progress?.hasErrors,
        errorCount: state.progress?.errorMessages?.length || 0,
      },

      // Processing state
      processing: {
        hasParsedIntent: !!state.parsedIntent,
        hasResolvedAccounts: !!state.resolvedAccounts,
        accountsResolved: state.accountsResolved,
      },

      // Output state
      output: {
        hasOutput: !!state.output,
        requiresUserAction: state.output?.metadata?.requiresUserAction,
        callbackType: state.output?.metadata?.callbackType,
      },
    };

    this.logger.log(
      `[${nodeName.toUpperCase()}_ENTRY] ${JSON.stringify(stateInfo, null, 2)}`
    );
  }

  /**
   * Logs workflow state at node exit
   */
  static logNodeExit(
    nodeName: string,
    state: WorkflowStateValues,
    result: Partial<WorkflowStateValues>,
    config: LangGraphRunnableConfig<any>
  ): void {
    const exitInfo = {
      node: nodeName,
      threadId: config.configurable?.thread_id,

      // What changed
      changes: {
        progressAdvanced:
          result.progress?.currentStep !== state.progress?.currentStep,
        newCurrentStep: result.progress?.currentStep,
        accountsResolved: result.accountsResolved,
        outputGenerated: !!result.output,
      },

      // Final state indicators
      finalState: {
        readyToContinue: result.accountsResolved,
        hasErrors: result.progress?.hasErrors,
        pendingUserAction: result.output?.metadata?.requiresUserAction,
      },
    };

    this.logger.log(
      `[${nodeName.toUpperCase()}_EXIT] ${JSON.stringify(exitInfo, null, 2)}`
    );
  }

  /**
   * Logs workflow condition evaluation
   */
  static logWorkflowCondition(
    fromNode: string,
    state: WorkflowStateValues,
    decision: string,
    reasoning?: string
  ): void {
    const conditionInfo = {
      fromNode,
      decision,
      reasoning,
      state: {
        accountsResolved: state.accountsResolved,
        hasResolvedAccounts: !!state.resolvedAccounts,
        currentStep: state.progress?.currentStep,
      },
    };

    this.logger.log(
      `[WORKFLOW_CONDITION] ${JSON.stringify(conditionInfo, null, 2)}`
    );
  }

  /**
   * Logs callback creation details
   */
  static logCallbackCreated(
    nodeName: string,
    callbackType: string,
    callbackId: string,
    state: WorkflowStateValues,
    config: LangGraphRunnableConfig<any>
  ): void {
    const callbackInfo = {
      node: nodeName,
      callbackType,
      callbackId,
      threadId: config.configurable?.thread_id,
      userId: state.input.userId,
      transactionContext: {
        description: state.input.description?.substring(0, 50) + "...",
        amount: state.input.amount,
      },
    };

    this.logger.log(
      `[CALLBACK_CREATED] ${JSON.stringify(callbackInfo, null, 2)}`
    );
  }

  /**
   * Logs potential workflow issues
   */
  static logWorkflowIssue(
    issue: string,
    context: any,
    severity: "WARN" | "ERROR" = "WARN"
  ): void {
    const issueInfo = {
      issue,
      severity,
      context,
      timestamp: new Date().toISOString(),
    };

    if (severity === "ERROR") {
      this.logger.error(
        `[WORKFLOW_ISSUE] ${JSON.stringify(issueInfo, null, 2)}`
      );
    } else {
      this.logger.warn(
        `[WORKFLOW_ISSUE] ${JSON.stringify(issueInfo, null, 2)}`
      );
    }
  }

  /**
   * Validates workflow state for consistency
   */
  static validateWorkflowState(
    nodeName: string,
    state: WorkflowStateValues,
    config: LangGraphRunnableConfig<any>
  ): void {
    const issues: string[] = [];

    // Check for inconsistent state combinations (legacy checks)
    if (state.accountsResolved && !state.resolvedAccounts) {
      issues.push("accountsResolved=true but resolvedAccounts is missing");
    }

    // Legacy step check - disabled for new subgraph architecture
    // if (
    //   state.progress?.currentStep === "build_transaction" &&
    //   !state.parsedIntent
    // ) {
    //   issues.push("In build_transaction step but parsedIntent is missing");
    // }

    // Log any issues found
    if (issues.length > 0) {
      this.logWorkflowIssue(
        `Workflow state inconsistencies in ${nodeName}`,
        {
          issues,
          threadId: config.configurable?.thread_id,
          currentStep: state.progress?.currentStep,
        },
        "WARN"
      );
    }
  }
}
