import { Injectable, Inject } from "@nestjs/common";
import { AbstractGraphBuilder, WithCallbacks } from "@flutchai/flutch-sdk";
import { IGraphRequestPayload, StreamChannel } from "@flutchai/flutch-sdk";
import { LedgerV1Callbacks } from "../../../callbacks/ledger-v1.callbacks";
import { AccountService } from "../../../service/account/account.service";
import { TransactionService } from "../../../service/transaction/transaction.service";
import { JournalEntryService } from "../../../service/journal-entry/journal-entry.service";
import { PendingAccountPlanService } from "../../../service/pending-account-plan/pending-account-plan.service";
import { StateGraph, START, END, UpdateType } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { WorkflowState } from "../../graph.state";
import { TransactionType } from "../../../common/types";
import { OutputPresentResultNode } from "../../nodes/output_present-result.node";
import { RouteIntentNode } from "../../nodes/route-intent.node";
import { TransactionsSubgraph } from "../../subgraphs/transactions/transactions.subgraph";
import { AccountManagementSubgraph } from "../../subgraphs/account-management/account-management.subgraph";
import { AnalyticsSubgraph } from "../../subgraphs/analytics/analytics.subgraph";
import {
  LedgerGraphStateValues,
  LedgerGraphInputValues,
  LedgerGraphConfigValues,
  LedgerGraphSettings,
  LedgerGraphCompiledGraph,
  LedgerGraphState,
} from "../../../ledger-graph.builder";

@Injectable()
@WithCallbacks(LedgerV1Callbacks)
export class LedgerV1Builder extends AbstractGraphBuilder<"1.0.0"> {
  readonly version = "1.0.0" as const;

  constructor(
    @Inject("CHECKPOINTER")
    private readonly checkpointer: MongoDBSaver,
    private readonly transactionsSubgraph: TransactionsSubgraph,
    private readonly accountManagementSubgraph: AccountManagementSubgraph,
    private readonly analyticsSubgraph: AnalyticsSubgraph,
    private readonly presentResult: OutputPresentResultNode,
    private readonly routeIntent: RouteIntentNode,
    private readonly accountService: AccountService,
    private readonly transactionService: TransactionService,
    private readonly journalEntryService: JournalEntryService,
    private readonly pendingAccountPlanService: PendingAccountPlanService
  ) {
    super();
  }

  async buildGraph(
    _payload?: IGraphRequestPayload
  ): Promise<LedgerGraphCompiledGraph> {
    const transactionsGraph = await this.transactionsSubgraph.build();
    const accountManagementGraph = await this.accountManagementSubgraph.build();
    const analyticsGraph = this.analyticsSubgraph.build();

    const workflow = new StateGraph(LedgerGraphState)
      .addNode("transactions", transactionsGraph)
      .addNode("account_management", accountManagementGraph)
      .addNode("analytics", analyticsGraph);
    // Commented out: each subgraph now handles its own output formatting
    // .addNode(
    //   "output_presentResult",
    //   this.presentResult.execute.bind(this.presentResult),
    //   { metadata: { stream_channel: StreamChannel.TEXT } }
    // );

    // Router: LLM-based routing to determine user intent
    workflow.addConditionalEdges(START, (state, config) =>
      this.routeIntent.route(state, config as any)
    );

    // Each subgraph completes and ends the workflow
    workflow.addEdge("transactions", END);
    workflow.addEdge("account_management", END);
    workflow.addEdge("analytics", END);
    // workflow.addEdge("output_presentResult", END);

    return workflow.compile({
      checkpointer: this.checkpointer,
    }) as unknown as LedgerGraphCompiledGraph;
  }

  async prepareConfig(
    payload: IGraphRequestPayload & { ledgerData?: any }
  ): Promise<{
    input: LedgerGraphInputValues;
    configurable: LedgerGraphConfigValues;
  }> {
    const baseConfig = await super.prepareConfig(payload);
    const ledgerData = payload.ledgerData || {};
    const versionConfig = await this.getVersionConfig();

    let description = "No description provided";
    if (payload.message) {
      const messageObj = payload.message as any;
      if (messageObj.kwargs?.content) {
        description = messageObj.kwargs.content.toString();
      } else if (payload.message.content) {
        description = payload.message.content.toString();
      }
    } else if (ledgerData.description) {
      description = ledgerData.description;
    }

    const userId = ledgerData.userId || payload.userId;
    const timestamp = Date.now();

    const initialState: LedgerGraphInputValues = {
      userId,
      input: {
        userId,
        description,
        amount: ledgerData.amount || 0,
        transactionType: ledgerData.transactionType as TransactionType,
        fromAccountCode: ledgerData.fromAccountCode,
        toAccountCode: ledgerData.toAccountCode,
        reference: ledgerData.reference,
      },
      progress: {
        currentStep: "parse_intent" as const,
        completedSteps: [],
        hasErrors: false,
        errorMessages: [],
        startedAt: new Date().toISOString(),
      },
      metadata: {},
      messages: [payload.message],
      parsedIntent: undefined,
      resolvedAccounts: undefined,
      builtTransaction: undefined,
      validation: undefined,
      output: { text: "", attachments: [], metadata: {} },
      llmAnalysis: undefined,
      attachment: undefined,
      accountsResolved: false,
    };

    const graphSettings: LedgerGraphSettings = payload.graphSettings || {};

    const configurable: LedgerGraphConfigValues = {
      ...baseConfig.configurable,
      checkpoint_ns: this.graphType,
      checkpoint_id: `${payload.threadId}-${timestamp}`,
      metadata: {
        ...baseConfig.configurable.metadata,
        workflowType: this.graphType,
        version: this.version,
        ledgerData,
      },
      graphSettings,
      agentId: payload.agentId,
      userId: payload.userId,
    };

    return {
      input: initialState,
      configurable,
    };
  }

  getService<T>(serviceClass: new (...args: any[]) => T): T {
    if (serviceClass === AccountService) return this.accountService as any;
    if (serviceClass === TransactionService)
      return this.transactionService as any;
    if (serviceClass === JournalEntryService)
      return this.journalEntryService as any;
    if (serviceClass === PendingAccountPlanService)
      return this.pendingAccountPlanService as any;
    throw new Error(`Service ${serviceClass.name} is not available`);
  }
}
