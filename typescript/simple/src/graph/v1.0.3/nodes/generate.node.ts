import { Injectable, Logger } from "@nestjs/common";
import { ModelInitializer, McpToolFilter } from "@flutchai/flutch-sdk";
import { ConfigService } from "@nestjs/config";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import {
  SimpleGraphStateValues,
  SimpleConfigValues,
} from "../../../simple.types";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Generate node for Simple graph
 * Handles message generation using LLM
 */
@Injectable()
export class GenerateNode {
  private readonly logger = new Logger(GenerateNode.name);
  private readonly mcpToolFilter = new McpToolFilter();

  constructor(
    private readonly modelInitializer: ModelInitializer,
    private readonly configService: ConfigService,
  ) {}

  async execute(
    state: SimpleGraphStateValues,
    config?: LangGraphRunnableConfig<SimpleConfigValues>,
  ): Promise<Partial<SimpleGraphStateValues>> {
    this.logger.debug("Executing generate node");

    try {
      // Get model settings from config
      const graphSettings = (config?.configurable as any)?.graphSettings;
      const modelId =
        graphSettings?.modelId ||
        this.configService.get<string>("DEFAULT_MODEL_ID") ||
        "6862986ccd48b6854358ee77";
      const temperature = graphSettings?.temperature;
      const systemPrompt = graphSettings?.systemPrompt || "";

      this.logger.debug(`Using model: ${modelId}, temperature: ${temperature}`);

      // Get validated tools using McpToolFilter
      const enabledTools = graphSettings?.availableTools || [];
      const tools =
        enabledTools.length > 0
          ? await this.mcpToolFilter.getFilteredTools(enabledTools)
          : [];

      if (tools.length > 0) {
        this.logger.log(
          `Configured ${tools.length} tools from MCP runtime: ${tools.map((t) => t.name).join(", ")}`,
        );
      } else if (enabledTools.length > 0) {
        this.logger.warn("No tools available from MCP runtime");
      }

      // Initialize the Chat LLM
      const model = await this.modelInitializer.initializeChatModel({
        modelId,
        temperature,
      });

      // Bind tools to model if available
      const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;

      // Prepare messages with system prompt
      const messages = [new SystemMessage(systemPrompt), ...state.messages];
      this.logger.debug(
        `Processing ${messages.length} messages with ${tools.length} tools`,
      );

      // Call the model
      const result = await modelWithTools.invoke(messages, config);

      // Type guard to ensure result is AIMessage
      if (!result || typeof result !== "object" || !("content" in result)) {
        throw new Error("Invalid response from model");
      }

      const aiMessage = result as AIMessage;
      this.logger.debug(`Generated response: ${aiMessage.content}`);

      return {
        messages: [aiMessage],
        generation: aiMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in generate node: ${errorMessage}`, errorStack);
      throw error;
    }
  }
}
