import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
  SupportWorkflowConfigValues,
} from "../graph.state";
import { SupportErrorType, SupportError } from "../../common/types";
import { ModelInitializer } from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ DOES NOT EXIST - commented out
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Output Clarify Escalate Node - Generates clarification questions or escalation messages
 *
 * This node handles cases where agents couldn't provide a satisfactory answer:
 * - Low confidence responses (< 0.7)
 * - Unclear queries that need clarification
 * - Critical issues requiring human escalation
 *
 * Features:
 * - Real streaming via LLM (auto-streaming due to output_ prefix)
 * - Smart clarification questions
 * - Escalation message generation
 * - Attempt tracking (max clarification attempts)
 */

interface ClarificationData {
  type: "clarification" | "escalation";
  attempts: number;
  maxAttempts: number;
  questions?: string[];
  escalationReason?: string;
}

@Injectable()
export class OutputClarifyEscalateNode {
  private readonly logger = new Logger(OutputClarifyEscalateNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {
    this.logger.debug(
      "OutputClarifyEscalate initialized - auto streaming via output_ prefix"
    );
  }

  /**
   * Execute clarification or escalation response generation
   */
  async execute(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): Promise<Partial<SupportWorkflowStateValues>> {
    // Get mode from orchestrator decision
    const mode =
      state.orchestratorDecision === "clarify" ? "clarification" : "escalation";

    this.logger.log(`Generating ${mode} response`);

    const startTime = Date.now();

    try {
      // Use orchestrator decision to determine mode
      const clarificationData: ClarificationData = {
        type: mode,
        attempts: state.clarificationAttempts || 0,
        maxAttempts: 2, // This should match ResponseOrchestrator.MAX_CLARIFICATION_ATTEMPTS
        escalationReason:
          mode === "escalation"
            ? `Low confidence after ${state.clarificationAttempts || 0} clarification attempts`
            : undefined,
      };

      let responseText: string;
      let attachments: any[] = [];

      if (clarificationData.type === "clarification") {
        // Generate clarification questions
        responseText = await this.generateClarificationResponse(
          state,
          config,
          clarificationData
        );

        // Add clarification metadata as attachment
        attachments.push({
          type: "clarification_info",
          title: "Clarification Info",
          data: {
            attempt: clarificationData.attempts,
            maxAttempts: clarificationData.maxAttempts,
            questions: clarificationData.questions || [],
          },
        });
      } else {
        // Generate escalation message
        responseText = await this.generateEscalationResponse(
          state,
          config,
          clarificationData
        );

        // Add escalation metadata as attachment
        attachments.push({
          type: "escalation_info",
          title: "Escalation Info",
          data: {
            reason: clarificationData.escalationReason,
            timestamp: new Date().toISOString(),
            originalQuery: state.input.query,
          },
        });
      }

      this.logger.log(
        `Generated ${clarificationData.type} response: ${responseText.length} characters`
      );

      // Return output with streaming response
      return {
        output: {
          text: responseText, // This will be streamed due to output_ prefix
          attachments,
          metadata: {
            nodeType: "output_clarify_escalate",
            timestamp: new Date().toISOString(),
            responseType: clarificationData.type,
            attempts: clarificationData.attempts,
            maxAttempts: clarificationData.maxAttempts,
            processingTime: Date.now() - startTime,
            streaming: true,
            requiresFollowUp: clarificationData.type === "clarification",
            requiresHuman: clarificationData.type === "escalation",
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Clarification/escalation generation failed: ${error.message}`,
        error.stack
      );

      // Fallback response
      const fallbackText =
        "Sorry, I need more information to help you. Please clarify your question or contact our specialists.";

      return {
        output: {
          text: fallbackText,
          metadata: {
            nodeType: "output_clarify_escalate",
            timestamp: new Date().toISOString(),
            error: true,
            errorMessage: error.message,
          },
        },
      };
    }
  }

  /**
   * Analyze whether to clarify or escalate
   */
  private analyzeClarificationNeeds(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>
  ): ClarificationData {
    // Get clarification settings from config
    const clarifyConfig = config.configurable?.graphSettings?.clarifyEscalate;
    const maxAttempts = clarifyConfig?.max_clarification_attempts || 1;

    // Get current attempt count from metadata
    const currentAttempts = state.metadata?.clarificationAttempts || 0;

    // Check escalation conditions
    const agentResponse = state.agentResponse;
    const escalationAnalysis = state.metadata?.escalationAnalysis;

    // Force escalation if:
    // 1. Max clarification attempts reached
    // 2. Critical issue detected
    // 3. Human escalation explicitly required
    if (currentAttempts >= maxAttempts) {
      return {
        type: "escalation",
        attempts: currentAttempts,
        maxAttempts,
        escalationReason: "Maximum clarification attempts reached",
      };
    }

    if (escalationAnalysis?.severity === "critical") {
      return {
        type: "escalation",
        attempts: currentAttempts,
        maxAttempts,
        escalationReason: "Critical issue requires immediate attention",
      };
    }

    if (escalationAnalysis?.requiresHuman) {
      return {
        type: "escalation",
        attempts: currentAttempts,
        maxAttempts,
        escalationReason: "Issue requires human specialist",
      };
    }

    // Otherwise, try clarification
    return {
      type: "clarification",
      attempts: currentAttempts + 1,
      maxAttempts,
    };
  }

  /**
   * Generate clarification questions
   */
  private async generateClarificationResponse(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>,
    clarificationData: ClarificationData
  ): Promise<string> {
    try {
      // Get model configuration from config (no hardcoded fallback)
      const clarifyConfig = config.configurable?.graphSettings?.clarifyEscalate;
      if (!clarifyConfig?.llm?.modelId) {
        throw new Error(
          "clarifyEscalate.llm.modelId is required in graph configuration"
        );
      }

      const modelId = clarifyConfig.llm.modelId;
      const temperature = clarifyConfig.llm.temperature || 0.3;
      const maxTokens = clarifyConfig.llm.maxTokens || 300;

      // Initialize model with streaming
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      const language = state.input.language || "en";

      // Use custom prompt from config or default
      const systemPrompt = clarifyConfig?.clarificationPrompt
        ? this.substitutePromptVariables(
            clarifyConfig.clarificationPrompt,
            language,
            state
          )
        : this.buildDefaultClarificationPrompt(language);

      const userPrompt = this.buildClarificationUserPrompt(
        state,
        clarificationData,
        language
      );

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      // Generate clarification response with streaming
      // ❌ trackLLMCall не существует - используем прямой вызов
      const response = await model.invoke(messages);

      return response.content as string;
    } catch (error) {
      this.logger.error(`Clarification generation failed: ${error.message}`);

      // Fallback clarification
      return "Could you please clarify your question? I need more details to help you.";
    }
  }

  /**
   * Generate escalation message
   */
  private async generateEscalationResponse(
    state: SupportWorkflowStateValues,
    config: LangGraphRunnableConfig<SupportWorkflowConfigValues>,
    clarificationData: ClarificationData
  ): Promise<string> {
    try {
      // Get model configuration from config (no hardcoded fallback)
      const clarifyConfig = config.configurable?.graphSettings?.clarifyEscalate;
      if (!clarifyConfig?.llm?.modelId) {
        throw new Error(
          "clarifyEscalate.llm.modelId is required in graph configuration"
        );
      }

      const modelId = clarifyConfig.llm.modelId;
      const temperature = clarifyConfig.llm.temperature || 0.3;
      const maxTokens = clarifyConfig.llm.maxTokens || 300;

      // Initialize model with streaming
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
        maxTokens,
      });

      const language = state.input.language || "en";

      // Use custom prompt from config or default
      const systemPrompt = clarifyConfig?.escalationPrompt
        ? this.substitutePromptVariables(
            clarifyConfig.escalationPrompt,
            language,
            state,
            clarificationData.attempts
          )
        : this.buildDefaultEscalationPrompt(language);

      const userPrompt = this.buildEscalationUserPrompt(
        state,
        clarificationData,
        language
      );

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      // Generate escalation response with streaming
      // ❌ trackLLMCall не существует - используем прямой вызов
      const response = await model.invoke(messages);

      return response.content as string;
    } catch (error) {
      this.logger.error(`Escalation generation failed: ${error.message}`);

      // Fallback escalation
      return "Your question requires specialist assistance. We're forwarding your request to our support team, and they will contact you shortly.";
    }
  }

  /**
   * Substitute variables in custom prompts
   */
  private substitutePromptVariables(
    prompt: string,
    language: string,
    state: SupportWorkflowStateValues,
    clarificationCount?: number
  ): string {
    return prompt
      .replace(/\{locale\}/g, language)
      .replace(/\{clarificationCount\}/g, (clarificationCount || 0).toString())
      .replace(/\{context\}/g, this.getContextDescription(state, language));
  }

  /**
   * Get context description for prompts
   */
  private getContextDescription(
    state: SupportWorkflowStateValues,
    language: string
  ): string {
    const escalationAnalysis = state.metadata?.escalationAnalysis;
    const agentResponse = state.agentResponse;

    if (escalationAnalysis?.type === "unclear_query") {
      return "User query is not clear enough to provide an accurate answer";
    }

    if (agentResponse && agentResponse.confidence < 0.5) {
      return "System could not find sufficiently reliable information to answer";
    }

    return "Additional information needed to provide assistance";
  }

  /**
   * Build default clarification prompt
   */
  private buildDefaultClarificationPrompt(language: string): string {
    return `You are a friendly support assistant who helps users clarify their questions.

Your task:
- Understand what the user actually wants to know
- Ask ONE specific clarifying question
- Be patient and supportive
- Suggest options for what they might have meant

DON'T:
- Ask multiple questions at once
- Be vague or generic
- Apologize excessively
- Repeat the user's question back`;
  }

  /**
   * Build default escalation prompt
   */
  private buildDefaultEscalationPrompt(language: string): string {
    return `You are a friendly support assistant. The user's question could not be resolved automatically.

Generate a polite escalation message that:
1. Acknowledges that their question needs specialized help
2. Explains that you're connecting them with a human operator
3. Asks them to wait briefly for the transfer
4. Uses a friendly, professional tone
5. Keeps the message concise (2-3 sentences max)

DON'T:
- Apologize excessively
- Make promises about response times
- Repeat the user's question back`;
  }

  /**
   * Build user prompt for clarification
   */
  private buildClarificationUserPrompt(
    state: SupportWorkflowStateValues,
    clarificationData: ClarificationData,
    language: string
  ): string {
    const query = state.input.query;
    const context = this.getContextDescription(state, language);

    return `User asked: "${query}"

Context: ${context}

Clarification attempt: ${clarificationData.attempts} of ${clarificationData.maxAttempts}

Ask one specific clarifying question that will help get the missing information.`;
  }

  /**
   * Build user prompt for escalation
   */
  private buildEscalationUserPrompt(
    state: SupportWorkflowStateValues,
    clarificationData: ClarificationData,
    language: string
  ): string {
    const query = state.input.query;
    const reason = clarificationData.escalationReason || "Unknown reason";

    return `User asked: "${query}"

Escalation reason: ${reason}
Clarification attempts: ${clarificationData.attempts}

Generate a polite escalation message to a human operator.`;
  }
}
