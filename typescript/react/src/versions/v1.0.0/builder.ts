import { Injectable, Inject } from "@nestjs/common";
import {
  StateGraph,
  START,
  END,
  LangGraphRunnableConfig,
  UpdateType,
} from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { AbstractGraphBuilder } from "@flutchai/flutch-sdk";
import { IGraphRequestPayload } from "@flutchai/flutch-sdk";
import { ReactGraphStateValidator } from "../../types/state.validator";
import { AttachmentType, StreamChannel } from "@flutchai/flutch-sdk";

import {
  ReactGraphCompiledGraph,
  ReactGraphSettings,
  IReactGraphBuilder,
} from "../../react.types";
import {
  ReactGraphState,
  ReactGraphStateValues,
  ReactGraphDefinition,
  ReactGraphInputValues,
  ReactGraphConfigValues,
} from "../../react-graph.builder";
import { ReactGraphTokens } from "../../react.tokens";
import * as Nodes from "../../graph/nodes";
import { GraphNodeId } from "../../types/graph.constants";
import {
  routeFromPlanAndSelectTool,
  routeFromReflectAndDecide,
  ROUTE_MAPPINGS,
} from "./routing.helpers";

@Injectable()
export class ReactGraphV1Builder
  extends AbstractGraphBuilder<"1.0.0">
  implements IReactGraphBuilder
{
  readonly version = "1.0.0" as const;
  private readonly stateValidator = new ReactGraphStateValidator();
  constructor(
    @Inject("CHECKPOINTER")
    private readonly checkpointer: MongoDBSaver,
    @Inject(ReactGraphTokens.PLAN_AND_SELECT_NODE)
    private readonly planNode: Nodes.PlanAndSelectToolNode,
    // Keep other nodes injected but unused for now - we'll use them later when expanding
    @Inject(ReactGraphTokens.EXECUTE_TOOL_NODE)
    private readonly executeNode: Nodes.ExecuteToolNode,
    @Inject(ReactGraphTokens.REFLECT_AND_DECIDE_NODE)
    private readonly reflectNode: Nodes.ReflectAndDecideNode,
    @Inject(ReactGraphTokens.GENERATE_ANSWER_NODE)
    private readonly answerNode: Nodes.GenerateAnswerNode,
    @Inject(ReactGraphTokens.CLARIFY_NODE)
    private readonly clarifyNode: Nodes.ClarifyNode
  ) {
    super();
  }

  async buildGraph(
    _payload?: IGraphRequestPayload
  ): Promise<ReactGraphCompiledGraph> {
    const workflow = new StateGraph<
      ReactGraphDefinition,
      ReactGraphStateValues,
      UpdateType<ReactGraphDefinition>,
      string,
      any,
      any,
      any
    >(ReactGraphState);

    // Add all nodes
    workflow.addNode(
      GraphNodeId.PLAN_AND_SELECT_TOOL,
      this.planNode.execute.bind(this.planNode),
      {
        metadata: {
          stream_channel: StreamChannel.PROCESSING,
        },
      }
    );
    workflow.addNode(
      GraphNodeId.EXECUTE_TOOL,
      this.executeNode.execute.bind(this.executeNode)
    );
    workflow.addNode(
      GraphNodeId.REFLECT_AND_DECIDE,
      this.reflectNode.execute.bind(this.reflectNode),
      {
        metadata: {
          stream_channel: StreamChannel.PROCESSING,
        },
      }
    );
    workflow.addNode(
      GraphNodeId.GENERATE_ANSWER,
      this.answerNode.execute.bind(this.answerNode),
      {
        metadata: {
          stream_channel: StreamChannel.TEXT,
        },
      }
    );
    workflow.addNode(
      GraphNodeId.CLARIFY,
      this.clarifyNode.execute.bind(this.clarifyNode),
      {
        metadata: {
          stream_channel: StreamChannel.TEXT,
        },
      }
    );

    // Entry point
    workflow.addEdge(START, GraphNodeId.PLAN_AND_SELECT_TOOL);

    // Conditional routing from plan_and_select_tool
    workflow.addConditionalEdges(
      GraphNodeId.PLAN_AND_SELECT_TOOL,
      (state: ReactGraphStateValues) => routeFromPlanAndSelectTool(state),
      ROUTE_MAPPINGS.fromPlanAndSelectTool
    );

    // After tool execution, go to reflect
    workflow.addEdge(GraphNodeId.EXECUTE_TOOL, GraphNodeId.REFLECT_AND_DECIDE);

    // Conditional routing from reflect_and_decide
    workflow.addConditionalEdges(
      GraphNodeId.REFLECT_AND_DECIDE,
      (state: ReactGraphStateValues) => routeFromReflectAndDecide(state),
      ROUTE_MAPPINGS.fromReflectAndDecide
    );

    // Terminal nodes - direct to END
    workflow.addEdge(GraphNodeId.GENERATE_ANSWER, END);
    workflow.addEdge(GraphNodeId.CLARIFY, END);

    const compiledGraph = workflow.compile({
      checkpointer: this.checkpointer,
    });

    return compiledGraph as unknown as ReactGraphCompiledGraph;
  }

  async prepareConfig(payload: IGraphRequestPayload): Promise<{
    input: ReactGraphInputValues;
    configurable: ReactGraphConfigValues;
  }> {
    const baseConfig = await super.prepareConfig(payload);
    const graphSettings: ReactGraphSettings =
      (payload.graphSettings as ReactGraphSettings) || {};

    const stepBudget = graphSettings.stepBudget ?? 6;
    const allowedTools = (graphSettings.allowedTools || [])
      .filter(tool => tool.enabled !== false)
      .map(tool => tool.name);

    // Extract user query from message - like in support graph
    let query = "";

    if (payload.message) {
      const messageObj = payload.message as any;
      if (messageObj.kwargs?.content) {
        query = messageObj.kwargs.content.toString();
      } else if (payload.message.content) {
        query = payload.message.content.toString();
      }
    }

    if (!query || query.trim().length === 0) {
      const errorMsg = `Empty query extracted from payload. Message: ${JSON.stringify(payload.message)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const input: ReactGraphInputValues = {
      query,
      stepBudget,
      allowedTools,
    };

    // Validate the input using state validator
    const validationResult = this.stateValidator.validateState({
      query: input.query,
      stepBudget: input.stepBudget,
      allowedTools: input.allowedTools,
      step: 0,
    } as any);

    if (!validationResult.valid) {
      this.logger.error("State validation failed:", validationResult.errors);
      throw new Error(
        `State validation failed: ${validationResult.errors.join(", ")}`
      );
    }

    const configurable: ReactGraphConfigValues = {
      ...baseConfig.configurable,
      checkpoint_ns: this.graphType,
      checkpoint_id:
        (payload as any)?.checkpoint_id ??
        (payload.threadId ? String(payload.threadId) : undefined) ??
        `${payload.agentId ?? "react"}-${Date.now()}`,
      agentId: payload.agentId,
      userId: payload.userId,
      graphSettings: {
        ...graphSettings,
        stepBudget,
      },
    };

    if (validationResult.warnings.length > 0) {
      this.logger.warn("State validation warnings:", validationResult.warnings);
    }

    return {
      input,
      configurable,
    };
  }
}
