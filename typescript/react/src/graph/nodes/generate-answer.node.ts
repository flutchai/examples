import { Injectable, Logger } from "@nestjs/common";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import { IStoredMessageContent } from "@flutchai/flutch-sdk";

import {
  ReactGraphSettings,
  ReactGraphConfigValues,
  PlanAction,
  GenerateAnswerConfig,
  NextAction,
} from "../../react.types";
import { ReactGraphStateValues } from "../../react-graph.builder";
import { ENV_CONFIG } from "../../config/environment.config";
import { buildAttachmentsFromState } from "../../utils/attachments.utils";

@Injectable()
export class GenerateAnswerNode {
  private readonly logger = new Logger(GenerateAnswerNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {}

  async execute(
    state: ReactGraphStateValues,
    config?: LangGraphRunnableConfig<ReactGraphConfigValues>,
  ): Promise<Partial<ReactGraphStateValues>> {
    const graphSettings: ReactGraphSettings =
      (config?.configurable?.graphSettings as ReactGraphSettings) || {};

    // Get configuration from answerNode
    const answerNodeConfig = graphSettings?.answerNode || {};

    const answerModelId =
      answerNodeConfig.modelId || ENV_CONFIG.llm.defaultModelId;
    const answerTemperature = answerNodeConfig.temperature ?? 0.6;
    const answerMaxTokens = answerNodeConfig.maxTokens ?? 3000;

    const answerModel = await this.modelInitializer.initializeChatModel({
      modelId: answerModelId,
      temperature: answerTemperature,
      maxTokens: answerMaxTokens,
    });

    const plan = state.plan as PlanAction | null;
    const answerOutline =
      plan?.type === NextAction.ANSWER ? plan.answer : undefined;

    // Use system prompt from answerNode config
    const answerSystemPrompt = answerNodeConfig.systemPrompt || "";
    const prompt = this.buildAnswerPrompt(state, answerOutline, {
      customPrompt: answerSystemPrompt,
    });

    let answerText = "";

    try {
      const aiMessage = await answerModel.invoke(
        [new SystemMessage(prompt.system), new HumanMessage(prompt.human)],
        config,
      );

      answerText = this.extractMessageText(aiMessage);
    } catch (error) {
      this.logger.error("Answer generation failed:", error);
      answerText = "";
    }

    if (!answerText || answerText.trim().length === 0) {
      answerText = `I could not generate a reliable answer. Here is a summary of the evidence gathered so far:\n${this.formatWorkingMemory(state)}`;
    }

    // Build attachments from state
    const attachments = buildAttachmentsFromState(state);

    const answer: IStoredMessageContent = {
      text: answerText.trim(),
      attachments,
      metadata: {},
    };

    return {
      answer,
      nextAction: NextAction.STOP,
      loopStatus: "completed",
      plan: null,
      clarification: null,
      stepNarrative: {
        doing: "Generated final answer",
        next: "Complete",
      },
      activityLog: [
        {
          phase: "answer",
          summary: "Final answer generated",
          timestamp: new Date().toISOString(),
          details: {
            outlineProvided: Boolean(
              answerOutline && answerOutline.trim().length > 0,
            ),
          },
        },
      ],
    };
  }

  private buildAnswerPrompt(
    state: ReactGraphStateValues,
    outline?: string,
    config: GenerateAnswerConfig & { customPrompt?: string } = {},
  ) {
    const evidence = state.evidence || "(no aggregated evidence)";
    const workingSummary = this.formatWorkingMemory(state);

    const system =
      config.customPrompt ||
      config.systemPrompt ||
      "You are an answer generation node. Create clear responses based on gathered evidence.";

    const formatType = config.formatType || "conversational";
    const includeExecutionDetails = config.includeExecutionDetails || false;

    const formatInstructions = {
      conversational:
        "Write in a natural, conversational tone suitable for direct user interaction.",
      structured:
        "Use clear headings, bullet points, and numbered lists for easy scanning.",
      technical:
        "Provide detailed technical information with precise terminology and specifications.",
    };

    const human = `# Response Generation Task
**User Query**: "${state.query}"
**Evidence Summary**: ${evidence}
**Format Style**: ${formatType}
${outline ? `**Planner Guidance**: ${outline}` : ""}

# Source Material Analysis
${workingSummary}

${
  includeExecutionDetails
    ? `
# Execution Context
Include a brief note about the research process and tools used to gather this information.
`
    : ""
}

# Response Requirements
Create a comprehensive response that:
1. Directly answers the user's query using gathered evidence
2. Maintains ${formatInstructions[formatType as keyof typeof formatInstructions]}
3. References sources inline when relevant (e.g., "According to KB-123")
4. Highlights any remaining uncertainties or scope limitations

# Response Format
Provide the answer as polished user-facing text (no JSON or metadata blocks). If you reference tools or evidence, weave them naturally into the narrative.`;

    return { system, human };
  }

  private formatWorkingMemory(state: ReactGraphStateValues): string {
    if (!state.workingMemory?.length) {
      return "(no tool results)";
    }

    return state.workingMemory
      .map((entry) => {
        const status = entry.observation.success ? "success" : "failure";
        const snippet =
          entry.observation.summary ||
          this.safeTruncate(
            typeof entry.observation.payload === "string"
              ? entry.observation.payload
              : JSON.stringify(entry.observation.payload ?? {}, null, 2),
            400,
          );
        return `${entry.tool} (${status}): ${snippet}`;
      })
      .join("\n");
  }

  private safeTruncate(value: string, maxLength = 400): string {
    if (!value) return "";
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
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
