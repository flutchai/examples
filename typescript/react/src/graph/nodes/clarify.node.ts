import { Injectable, Logger } from "@nestjs/common";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { IStoredMessageContent } from "@flutchai/flutch-sdk";
import { ModelInitializer } from "@flutchai/flutch-sdk";

import {
  ClarifyPlanAction,
  ReactGraphClarification,
  NextAction,
  ReactGraphSettings,
  ReactGraphConfigValues,
} from "../../react.types";
import { ReactGraphStateValues } from "../../react-graph.builder";
import { ENV_CONFIG } from "../../config/environment.config";

@Injectable()
export class ClarifyNode {
  private readonly logger = new Logger(ClarifyNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: ReactGraphStateValues,
    config?: LangGraphRunnableConfig<ReactGraphConfigValues>
  ): Promise<Partial<ReactGraphStateValues>> {
    const graphSettings: ReactGraphSettings =
      (config?.configurable?.graphSettings as ReactGraphSettings) || {};

    const plan = state.plan as ClarifyPlanAction | null;

    if (!plan || plan.type !== NextAction.CLARIFY) {
      const clarification: ReactGraphClarification = {
        question:
          "Could you clarify what specific information you expect to receive?",
        rationale:
          "Default clarification prompt because no explicit question was provided.",
      };

      const answer: IStoredMessageContent = {
        text: clarification.question,
        attachments: [],
        metadata: {
          clarification: true,
          rationale: clarification.rationale,
        },
      };

      return {
        clarification,
        answer,
        plan: null,
        nextAction: NextAction.STOP,
        loopStatus: "completed",
        stepNarrative: {
          doing: "Asked for clarification",
          next: "Await user input",
        },
        activityLog: [
          {
            phase: "clarify",
            summary: "Requested user clarification",
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    // Get configuration from clarifyNode
    const clarifyNodeConfig = graphSettings?.clarifyNode || {};

    const clarifyModelId =
      clarifyNodeConfig.modelId || ENV_CONFIG.llm.defaultModelId;
    const clarifyTemperature = clarifyNodeConfig.temperature ?? 0.4;
    const clarifyMaxTokens = clarifyNodeConfig.maxTokens ?? 800;

    // Use system prompt from clarifyNode config
    const clarifySystemPrompt = clarifyNodeConfig.systemPrompt || "";

    // Build prompt for clarification generation
    const prompt = this.buildClarifyPrompt(state, plan, clarifySystemPrompt);

    let questionText = plan.question;

    try {
      const clarifyModel = await this.modelInitializer.initializeChatModel({
        modelId: clarifyModelId,
        temperature: clarifyTemperature,
        maxTokens: clarifyMaxTokens,
      });

      const aiMessage = await clarifyModel.invoke(
        [new SystemMessage(prompt.system), new HumanMessage(prompt.human)],
        config
      );

      const generatedText = this.extractMessageText(aiMessage);
      if (generatedText && generatedText.trim().length > 0) {
        questionText = generatedText.trim();
      }
    } catch (error) {
      this.logger.error("Clarification generation failed:", error);
      // Fallback to original question from plan
    }

    const clarification: ReactGraphClarification = {
      question: questionText,
      rationale: plan.rationale,
    };

    const answer: IStoredMessageContent = {
      text: clarification.question,
      attachments: [],
      metadata: {
        clarification: true,
        rationale: clarification.rationale,
      },
    };

    return {
      clarification,
      answer,
      plan: null,
      nextAction: NextAction.STOP,
      loopStatus: "completed",
      stepNarrative: {
        doing: "Asked for clarification",
        next: "Await user input",
      },
      activityLog: [
        {
          phase: "clarify",
          summary: "Requested user clarification",
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private buildClarifyPrompt(
    state: ReactGraphStateValues,
    plan: ClarifyPlanAction,
    systemPrompt: string
  ): { system: string; human: string } {
    const system =
      systemPrompt ||
      "You are a clarification specialist that asks users for missing information.";

    const human = `# Context
**User Query**: "${state.query}"
**Evidence Gathered**: ${state.evidence || "(none)"}

# Clarification Need
**Rationale**: ${plan.rationale}
**Suggested Question**: ${plan.question}

# Your Task
Generate a clear, friendly clarification question based on the suggested question above.

Requirements:
- Keep it concise (1-3 sentences maximum)
- Use conversational, natural language
- Be specific about what information is needed
- Maintain a helpful, friendly tone

Output only the question text, nothing else.`;

    return { system, human };
  }

  private extractMessageText(message: unknown): string {
    if (!message) {
      return "";
    }

    if (typeof message === "string") {
      return message;
    }

    if (Array.isArray((message as any)?.content)) {
      return (message as any).content
        .map((part: any) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object" && "text" in part) {
            return String(part.text ?? "");
          }
          return "";
        })
        .join(" ");
    }

    if (typeof (message as any)?.content === "string") {
      return (message as any).content;
    }

    try {
      return JSON.stringify((message as any)?.content ?? message);
    } catch {
      return String((message as any)?.content ?? message);
    }
  }
}
