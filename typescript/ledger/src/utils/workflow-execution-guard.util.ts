import { Logger } from "@nestjs/common";

/**
 * Guards against duplicate workflow executions
 * Tracks active workflows to prevent restart loops
 */
export class WorkflowExecutionGuard {
  private static readonly logger = new Logger("WorkflowExecutionGuard");
  private static activeWorkflows = new Map<
    string,
    {
      requestId: string;
      threadId: string;
      status: "running" | "waiting_callback" | "completed";
      startTime: Date;
      lastActivity: Date;
      callbackId?: string;
    }
  >();

  /**
   * Check if workflow should be allowed to start/continue
   */
  static shouldAllowExecution(
    requestId: string,
    threadId: string,
    operationType: "start" | "continue" | "callback",
  ): boolean {
    const key = `${threadId}:${requestId}`;
    const existing = this.activeWorkflows.get(key);

    if (!existing) {
      // First execution - allow
      this.registerWorkflow(requestId, threadId, "running");
      return true;
    }

    // Check for rapid restart loops (< 2 seconds)
    const timeSinceLastActivity = Date.now() - existing.lastActivity.getTime();
    if (
      timeSinceLastActivity < 2000 &&
      existing.status === "waiting_callback"
    ) {
      this.logger.warn(
        `Preventing rapid restart loop for ${key}, last activity: ${timeSinceLastActivity}ms ago`,
      );
      return false;
    }

    // Allow callback continuations
    if (operationType === "callback") {
      this.updateWorkflowStatus(requestId, threadId, "running");
      return true;
    }

    // Allow continuation if waiting for callback and enough time passed
    if (
      existing.status === "waiting_callback" &&
      timeSinceLastActivity > 5000
    ) {
      this.logger.log(
        `Allowing workflow continuation after timeout for ${key}`,
      );
      this.updateWorkflowStatus(requestId, threadId, "running");
      return true;
    }

    // Prevent duplicate starts
    if (existing.status === "running" && timeSinceLastActivity < 10000) {
      this.logger.warn(
        `Preventing duplicate execution for ${key}, status: ${existing.status}`,
      );
      return false;
    }

    // Update activity and allow
    this.updateWorkflowStatus(requestId, threadId, "running");
    return true;
  }

  /**
   * Register a new workflow execution
   */
  static registerWorkflow(
    requestId: string,
    threadId: string,
    status: "running" | "waiting_callback" | "completed",
  ): void {
    const key = `${threadId}:${requestId}`;
    const now = new Date();

    this.activeWorkflows.set(key, {
      requestId,
      threadId,
      status,
      startTime: now,
      lastActivity: now,
    });

    this.logger.log(`Registered workflow: ${key}, status: ${status}`);
  }

  /**
   * Update workflow status
   */
  static updateWorkflowStatus(
    requestId: string,
    threadId: string,
    status: "running" | "waiting_callback" | "completed",
    callbackId?: string,
  ): void {
    const key = `${threadId}:${requestId}`;
    const existing = this.activeWorkflows.get(key);

    if (existing) {
      existing.status = status;
      existing.lastActivity = new Date();
      if (callbackId) {
        existing.callbackId = callbackId;
      }

      this.logger.log(
        `Updated workflow ${key}: status=${status}, callbackId=${callbackId}`,
      );

      // Clean up completed workflows after 5 minutes
      if (status === "completed") {
        setTimeout(
          () => {
            this.activeWorkflows.delete(key);
            this.logger.log(`Cleaned up completed workflow: ${key}`);
          },
          5 * 60 * 1000,
        );
      }
    }
  }

  /**
   * Mark workflow as waiting for callback
   */
  static setWaitingForCallback(
    requestId: string,
    threadId: string,
    callbackId: string,
  ): void {
    this.updateWorkflowStatus(
      requestId,
      threadId,
      "waiting_callback",
      callbackId,
    );
  }

  /**
   * Check if workflow is currently waiting for callback
   */
  static isWaitingForCallback(requestId: string, threadId: string): boolean {
    const key = `${threadId}:${requestId}`;
    const existing = this.activeWorkflows.get(key);
    return existing?.status === "waiting_callback";
  }

  /**
   * Clean up old workflows (> 1 hour)
   */
  static cleanupOldWorkflows(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleaned = 0;

    for (const [key, workflow] of this.activeWorkflows.entries()) {
      if (workflow.lastActivity < oneHourAgo) {
        this.activeWorkflows.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old workflows`);
    }
  }

  /**
   * Get workflow statistics
   */
  static getStats(): {
    active: number;
    running: number;
    waiting: number;
    completed: number;
  } {
    let running = 0,
      waiting = 0,
      completed = 0;

    for (const workflow of this.activeWorkflows.values()) {
      switch (workflow.status) {
        case "running":
          running++;
          break;
        case "waiting_callback":
          waiting++;
          break;
        case "completed":
          completed++;
          break;
      }
    }

    return {
      active: this.activeWorkflows.size,
      running,
      waiting,
      completed,
    };
  }
}

// Clean up old workflows every 15 minutes
setInterval(
  () => {
    WorkflowExecutionGuard.cleanupOldWorkflows();
  },
  15 * 60 * 1000,
);
