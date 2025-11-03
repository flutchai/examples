import { Injectable, Inject, Logger } from "@nestjs/common";
import { AbstractGraphBuilder } from "@flutchai/flutch-sdk";
import { IGraphRequestPayload, StreamChannel } from "@flutchai/flutch-sdk";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { StateGraph, START, END } from "@langchain/langgraph";
import { SimpleState } from "../../state.model";
import { SimpleTokens } from "../../simple.tokens";
import {
  SimpleInputValues,
  SimpleConfigValues,
  SimpleCompiledGraph,
  ISimpleGraphBuilder,
} from "../../simple.types";
import * as Nodes from "../../nodes";
import * as path from "path";
/**
 * Builder for Simple graph version 2.0.0
 * Enhanced implementation with reflection node
 */
@Injectable()
export class SimpleV2Builder
  extends AbstractGraphBuilder<"2.0.0">
  implements ISimpleGraphBuilder
{
  readonly version = "2.0.0" as const;

  private readonly generateNode: Nodes.GenerateNode;

  constructor(
    @Inject("CHECKPOINTER")
    private readonly checkpointer: MongoDBSaver,
    @Inject(SimpleTokens.GENERATE_NODE)
    generateNode: Nodes.GenerateNode
  ) {
    super();
    this.generateNode = generateNode;

    // Manifest is now loaded automatically from root on first access
    this.logger.log("SimpleV2Builder initialized with new manifest system");
  }

  /**
   * Build Simple graph v2.0.0 with reflection
   */
  async buildGraph(_payload?: any): Promise<SimpleCompiledGraph> {
    this.logger.debug("Building Simple graph v2.0.0 with reflection");

    const workflow = new StateGraph(SimpleState)
      .addNode("generate", this.generateNode.execute.bind(this.generateNode), {
        metadata: {
          stream_channel: StreamChannel.TEXT,
        },
      })
      .addNode("output_reflect", this.reflectNode.bind(this), {
        metadata: {
          stream_channel: StreamChannel.PROCESSING,
        },
      });

    // V2: Generate -> Reflect -> End
    workflow.addEdge(START, "generate");
    workflow.addEdge("generate", "output_reflect");
    workflow.addEdge("output_reflect", END);

    return workflow.compile({
      checkpointer: this.checkpointer,
    }) as unknown as SimpleCompiledGraph;
  }

  /**
   * Reflection node for v2.0.0
   * Analyzes and potentially improves the generated response
   */
  private async reflectNode(state: any, config?: any): Promise<any> {
    this.logger.debug("Executing reflection node");

    const settings = config?.configurable?.graphSettings || {};

    if (!settings.enableReflection) {
      // Skip reflection if disabled
      return {};
    }

    // In a real implementation, this would analyze the response
    // and potentially regenerate or modify it
    return {
      metadata: {
        ...state.metadata,
        reflected: true,
        reflectionDepth: settings.reflectionDepth || 1,
        version: "2.0.0",
      },
    };
  }

  /**
   * Prepare configuration for v2.0.0
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
        graphSettings: {
          ...settings,
          enableReflection: settings.enableReflection ?? true,
          reflectionDepth: settings.reflectionDepth ?? 1,
        },
      },
    };
  }
}
