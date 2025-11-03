import { Injectable, Logger } from "@nestjs/common";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
} from "../graph.state";

/**
 * ResponseOrchestrator Node - Pure routing based on agent confidence
 *
 * This is a PURE ROUTER that only decides where to route based on confidence:
 * - High confidence (>= 0.7) → response (output_agent_response)
 * - Low confidence + attempts remaining → clarify (output_clarify_escalate in clarification mode)
 * - Low confidence + max attempts reached → escalate (output_clarify_escalate in escalation mode)
 *
 * NO generation, NO enrichment, NO processing - just routing logic
 */

@Injectable()
export class ResponseOrchestratorNode {
  private readonly logger = new Logger(ResponseOrchestratorNode.name);

  // Configuration
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly MAX_CLARIFICATION_ATTEMPTS = 2;

  constructor() {
    this.logger.debug(
      "ResponseOrchestrator initialized as pure router (confidence-based routing only)"
    );
  }

  /**
   * Execute pure routing logic based on confidence and attempts
   */
  async execute(
    state: SupportWorkflowStateValues
  ): Promise<Partial<SupportWorkflowStateValues>> {
    const agentResponse = state.agentResponse || state.finalResponse;
    const clarificationAttempts = state.clarificationAttempts || 0;

    this.logger.log(
      `ResponseOrchestrator routing decision - confidence: ${agentResponse?.confidence}, attempts: ${clarificationAttempts}`
    );

    const startTime = Date.now();

    try {
      // Advance workflow step
      const stepUpdate = SupportWorkflowStateUtils.advanceStep(
        state,
        "response_orchestrator"
      );

      // Get confidence from agent response
      const confidence = agentResponse?.confidence || 0;

      // Routing decision logic
      let routingDecision: "response" | "clarify" | "escalate";
      let routingReason: string;

      if (confidence >= this.CONFIDENCE_THRESHOLD) {
        // High confidence - direct response
        routingDecision = "response";
        routingReason = `High confidence (${confidence}) - proceeding to response`;
      } else if (clarificationAttempts < this.MAX_CLARIFICATION_ATTEMPTS) {
        // Low confidence but attempts remaining - clarify
        routingDecision = "clarify";
        routingReason = `Low confidence (${confidence}) with ${this.MAX_CLARIFICATION_ATTEMPTS - clarificationAttempts} attempts remaining - requesting clarification`;
      } else {
        // Low confidence and max attempts reached - escalate
        routingDecision = "escalate";
        routingReason = `Low confidence (${confidence}) and max attempts (${this.MAX_CLARIFICATION_ATTEMPTS}) reached - escalating`;
      }

      this.logger.log(
        `Routing decision: ${routingDecision} - ${routingReason}`
      );

      // Update metadata with routing decision
      const metadataUpdate = SupportWorkflowStateUtils.updateMetadata(state, {
        orchestratorRouting: {
          decision: routingDecision,
          confidence: confidence,
          attempts: clarificationAttempts,
          maxAttempts: this.MAX_CLARIFICATION_ATTEMPTS,
          reason: routingReason,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
        },
      });

      // Update clarification attempts if we're clarifying
      const clarificationUpdate =
        routingDecision === "clarify"
          ? { clarificationAttempts: clarificationAttempts + 1 }
          : {};

      // Set routing flag for conditional edges
      const routingFlag = {
        orchestratorDecision: routingDecision,
      };

      return {
        ...stepUpdate,
        ...metadataUpdate,
        ...clarificationUpdate,
        ...routingFlag,
      };
    } catch (error) {
      this.logger.error(
        `ResponseOrchestrator routing failed: ${error.message}`,
        error.stack
      );

      const errorUpdate = SupportWorkflowStateUtils.addError(
        state,
        `ResponseOrchestrator routing failed: ${error.message}`
      );

      // On error, default to escalation
      return {
        ...errorUpdate,
        orchestratorDecision: "escalate",
        metadata: {
          ...state.metadata,
          orchestratorError: {
            message: error.message,
            timestamp: new Date().toISOString(),
            fallback: "Defaulting to escalation due to routing error",
          },
        },
      };
    }
  }

  /**
   * Get confidence threshold (can be made configurable later)
   */
  getConfidenceThreshold(): number {
    return this.CONFIDENCE_THRESHOLD;
  }

  /**
   * Get max clarification attempts (can be made configurable later)
   */
  getMaxClarificationAttempts(): number {
    return this.MAX_CLARIFICATION_ATTEMPTS;
  }
}
