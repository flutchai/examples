import { Injectable, Logger } from "@nestjs/common";
import {
  SupportWorkflowStateValues,
  SupportWorkflowStateUtils,
} from "../graph.state";
import { SupportErrorType, SupportError } from "../../common/types";
import {
  formatError,
  getErrorMessage,
  ModelInitializer,
} from "@flutchai/flutch-sdk";
// import { trackLLMCall } from "@flutchai/flutch-sdk"; // ❌ DOES NOT EXIST - commented out
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * StreamProcessor Node - Final response generation with auto-streaming
 *
 * Node starts with "output_" therefore automatically streams.
 * Makes a simple LLM call for the final response.
 */

@Injectable()
export class OutputStreamProcessorNode {
  private readonly logger = new Logger(OutputStreamProcessorNode.name);

  constructor(private readonly modelInitializer: ModelInitializer) {
    this.logger.debug(
      "StreamProcessor initialized - auto streaming via output_ prefix"
    );
  }

  /**
   * Execute final response generation with auto-streaming
   */
  async execute(
    state: SupportWorkflowStateValues
  ): Promise<Partial<SupportWorkflowStateValues>> {
    this.logger.log("Starting final response generation with auto-streaming");

    try {
      // Get the prepared response from previous steps
      const preparedResponse =
        state.enhancedResponse || state.output?.text || "";

      if (!preparedResponse) {
        throw new Error("No response content available for streaming");
      }

      this.logger.log(
        `Processing final response: ${preparedResponse.length} characters`
      );

      // Simply return the output - auto-streaming happens because node starts with "output_"
      return {
        output: {
          text: preparedResponse,
          attachments: state.output?.attachments || [],
          metadata: {
            nodeType: "output_stream_processor",
            timestamp: new Date().toISOString(),
            autoStreaming: true,
            responseLength: preparedResponse.length,
          },
        },
      };
    } catch (error) {
      const errorInfo = formatError(error);
      this.logger.error(
        `Final response generation failed: ${errorInfo.message}`,
        errorInfo.stack
      );

      // Fallback response
      return {
        output: {
          text: "I apologize, but I encountered an error while preparing my response. Please try asking your question again.",
          metadata: {
            nodeType: "output_stream_processor",
            timestamp: new Date().toISOString(),
            error: true,
            errorMessage: errorInfo.message,
          },
        },
      };
    }
  }
}
