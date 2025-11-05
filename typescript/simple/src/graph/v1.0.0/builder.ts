import { Injectable, Inject, Logger } from "@nestjs/common";
import { AbstractGraphBuilder } from "@flutchai/flutch-sdk";
import { IGraphRequestPayload, StreamChannel } from "@flutchai/flutch-sdk";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { StateGraph, START, END } from "@langchain/langgraph";
import {
  SimpleState,
  SimpleInputValues,
  SimpleConfigValues,
  SimpleCompiledGraph,
  ISimpleGraphBuilder,
  SimpleGraphStateValues,
  SimpleGraphStateDefinition,
} from "../../simple.types";
import * as Nodes from "./nodes";
/**
 * Builder for Simple graph version 1.0.0
 * Basic implementation with single generate node
 */
@Injectable()
export class SimpleV1Builder
  extends AbstractGraphBuilder<"1.0.0">
  implements ISimpleGraphBuilder
{
  readonly version = "1.0.0" as const;

  private readonly generateNode: Nodes.GenerateNode;
  private readonly executeToolsNode: Nodes.ExecuteToolsNode;

  constructor(
    @Inject("CHECKPOINTER")
    private readonly checkpointer: MongoDBSaver,
    generateNode: Nodes.GenerateNode,
    executeToolsNode: Nodes.ExecuteToolsNode,
  ) {
    super();
    this.generateNode = generateNode;
    this.executeToolsNode = executeToolsNode;

    // Manifest is now loaded automatically from root on first access
    this.logger.log("SimpleV1Builder initialized with new manifest system");
  }

  /**
   * Build Simple graph v1.0.0 with MCP tools support
   */
  async buildGraph(_payload?: any): Promise<SimpleCompiledGraph> {
    this.logger.debug("Building Simple graph v1.0.0 with MCP tools support");

    const workflow = new StateGraph<SimpleGraphStateDefinition>(SimpleState)
      .addNode(
        "output_generate",
        this.generateNode.execute.bind(this.generateNode),
        {
          metadata: {
            stream_channel: StreamChannel.TEXT,
          },
        },
      )
      .addNode(
        "tools",
        this.executeToolsNode.execute.bind(this.executeToolsNode),
      );

    // V1: Enhanced flow with tool support
    workflow.addEdge(START, "output_generate");

    // Conditional routing: if tool calls are present, go to tools node
    workflow.addConditionalEdges(
      "output_generate",
      (state: SimpleGraphStateValues) => {
        const lastMessage = state.messages[state.messages.length - 1];
        return (lastMessage as any)?.tool_calls?.length > 0 ? "tools" : END;
      },
      {
        tools: "tools",
        [END]: END,
      },
    );

    // After tools execution, continue generation
    workflow.addEdge("tools", "output_generate");

    return workflow.compile({
      checkpointer: this.checkpointer as any, // Type compatibility issue between langgraph 1.0 and checkpoint-mongodb 0.1.1
    }) as unknown as SimpleCompiledGraph;
  }

  /**
   * Prepare configuration for v1.0.0
   */
  async prepareConfig(payload: IGraphRequestPayload): Promise<{
    input: SimpleInputValues;
    configurable: SimpleConfigValues;
  }> {
    // Use base implementation to create context
    const baseConfig = await super.prepareConfig(payload);
    const settings = payload.graphSettings || {};

    const input: SimpleInputValues = {
      messages: [payload.message],
    };

    return {
      input,
      configurable: {
        ...baseConfig.configurable,
        checkpoint_ns: this.graphType,
        checkpoint_id: `${payload.threadId}-${Date.now()}`,
        metadata: {
          ...baseConfig.configurable.metadata,
          workflowType: this.graphType,
        },
        graphSettings: settings,
      },
    };
  }
}
