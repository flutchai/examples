import { Injectable, Logger } from "@nestjs/common";
import { StateGraph, START, END } from "@langchain/langgraph";
import { TransactionState } from "./transaction.state";
import { AnalyzeTransactionNode } from "./nodes/analyze-transaction.node";
import { BuildTransactionNode } from "./nodes/build-transaction.node";
import { ConfirmAccountsNode } from "./nodes/confirm-accounts.node";
import { CreateTransactionsNode } from "./nodes/create-transactions.node";
import { PresentResultNode } from "./nodes/present-result.node";
import { StreamChannel } from "@flutchai/flutch-sdk";

/**
 * Transactions Subgraph
 *
 * Handles all transaction-related operations:
 * 1. Analyze: Parse user message → extract transaction details
 * 2. Build: Use account intelligence → determine debit/credit accounts
 * 3. Confirm: Auto-approve with LLM-generated account names (no interrupts)
 * 4. Create: Create new accounts (if needed) → create journal entries
 *
 * Users can later rename/modify accounts via Account Management subgraph.
 */
@Injectable()
export class TransactionsSubgraph {
  private readonly logger = new Logger(TransactionsSubgraph.name);

  constructor(
    private readonly analyzeNode: AnalyzeTransactionNode,
    private readonly buildNode: BuildTransactionNode,
    private readonly confirmNode: ConfirmAccountsNode,
    private readonly createNode: CreateTransactionsNode,
    private readonly presentNode: PresentResultNode,
  ) {}

  /**
   * Build the transactions subgraph
   */
  async build() {
    this.logger.log("Building Transactions subgraph");

    const subgraph = new StateGraph(TransactionState)
      .addNode("analyze", this.analyzeNode.execute.bind(this.analyzeNode), {
        metadata: {
          stream_channel: StreamChannel.PROCESSING,
        },
      })
      .addNode("build", this.buildNode.execute.bind(this.buildNode), {
        metadata: {
          stream_channel: StreamChannel.PROCESSING,
        },
      })
      .addNode("confirm", this.confirmNode.execute.bind(this.confirmNode), {
        metadata: {
          stream_channel: StreamChannel.TEXT,
        },
      })
      .addNode("create", this.createNode.execute.bind(this.createNode), {
        metadata: {
          stream_channel: StreamChannel.PROCESSING,
        },
      })
      .addNode("present", this.presentNode.execute.bind(this.presentNode), {
        metadata: {
          stream_channel: StreamChannel.TEXT,
        },
      });

    // Linear flow: analyze → build → confirm → create → present
    subgraph.addEdge(START, "analyze");

    // After analyze: check for errors
    subgraph.addConditionalEdges(
      "analyze",
      (state) => {
        if (state.hasErrors) {
          this.logger.warn("Analysis failed, ending subgraph");
          return END;
        }
        return "build";
      },
      {
        build: "build",
        __end__: END,
      },
    );

    subgraph.addEdge("build", "confirm");

    // After confirm: check if user cancelled
    subgraph.addConditionalEdges(
      "confirm",
      (state) => {
        if (state.hasErrors) {
          this.logger.warn("Confirmation cancelled or failed, ending subgraph");
          return END;
        }
        return "create";
      },
      {
        create: "create",
        __end__: END,
      },
    );

    subgraph.addEdge("create", "present");
    subgraph.addEdge("present", END);

    this.logger.log("Transactions subgraph built successfully");

    return subgraph.compile();
  }
}
