import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";

// Import common modules
import { DatabaseModule } from "../common/database.module";
import { ServiceModule } from "../service/service.module";
import { LedgerAuditService } from "../common/audit.service";
import { LedgerMetrics } from "../common/metrics.service";

// Graph components
import { LedgerV1Builder } from "./versions";

// UI Components
import { LedgerUIController } from "../ui/ledger.ui-endpoints";

// Callback handlers
import { LedgerV1Callbacks } from "../callbacks/ledger-v1.callbacks";

// Graph nodes (old nodes kept for compatibility during migration)
import { OutputPresentResultNode } from "./nodes/output_present-result.node";
import { RouteIntentNode } from "./nodes/route-intent.node";

// Graph services
import { AccountIntelligenceService } from "./services/account-intelligence.service";

// Subgraph: Transactions
import { TransactionsSubgraph } from "./subgraphs/transactions/transactions.subgraph";
import { AnalyzeTransactionNode } from "./subgraphs/transactions/nodes/analyze-transaction.node";
import { BuildTransactionNode as SubgraphBuildTransactionNode } from "./subgraphs/transactions/nodes/build-transaction.node";
import { ConfirmAccountsNode } from "./subgraphs/transactions/nodes/confirm-accounts.node";
import { CreateTransactionsNode } from "./subgraphs/transactions/nodes/create-transactions.node";
import { PresentResultNode } from "./subgraphs/transactions/nodes/present-result.node";

// Subgraph: Account Management
import { AccountManagementSubgraph } from "./subgraphs/account-management/account-management.subgraph";
import { ExecuteToolNode } from "./subgraphs/account-management/nodes/execute-tool.node";
import { FormatResponseNode } from "./subgraphs/account-management/nodes/format-response.node";
import { AccountService } from "../service/account/account.service";

// Subgraph: Analytics
import { AnalyticsSubgraph } from "./subgraphs/analytics/analytics.subgraph";
import { AnalyzeQueryNode } from "./subgraphs/analytics/nodes/analyze-query.node";
import { ExecuteAnalyticsToolNode } from "./subgraphs/analytics/nodes/execute-analytics-tool.node";
import { FormatAnalyticsResponseNode } from "./subgraphs/analytics/nodes/format-analytics-response.node";
import { ChartBuilderTool } from "./subgraphs/analytics/tools/chart-builder.tool";

// Graph service infrastructure
import {
  UniversalGraphModule,
  GraphEngineType,
  BaseGraphServiceController,
} from "@flutchai/flutch-sdk";

import { ModelInitializer } from "@flutchai/flutch-sdk";

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),

    DatabaseModule,
    ServiceModule,

    UniversalGraphModule.forRoot({
      engineType: GraphEngineType.LANGGRAPH,
      versioning: [
        {
          baseGraphType: "flutch.financial-ledger",
          versions: [
            {
              version: "1.0.0",
              builderClass: LedgerV1Builder,
              isDefault: true,
            },
          ],
          defaultVersionStrategy: "explicit",
        },
      ],
    }),
  ],
  controllers: [BaseGraphServiceController, LedgerUIController],
  providers: [
    ModelInitializer,
    LedgerV1Builder,
    LedgerV1Callbacks,
    AccountIntelligenceService,
    OutputPresentResultNode,
    RouteIntentNode,
    LedgerAuditService,
    LedgerMetrics,

    // Transactions Subgraph
    TransactionsSubgraph,
    AnalyzeTransactionNode,
    SubgraphBuildTransactionNode,
    ConfirmAccountsNode,
    CreateTransactionsNode,
    PresentResultNode,

    // Account Management Subgraph
    AccountManagementSubgraph,
    ExecuteToolNode,
    FormatResponseNode,
    {
      provide: "AccountService",
      useExisting: AccountService,
    },

    // Analytics Subgraph
    AnalyticsSubgraph,
    AnalyzeQueryNode,
    ExecuteAnalyticsToolNode,
    FormatAnalyticsResponseNode,
    ChartBuilderTool,
  ],
  exports: [LedgerV1Builder, LedgerAuditService, LedgerMetrics, ServiceModule],
})
export class GraphModule {}

/**
 * Graph Module
 *
 * LangGraph workflow orchestration for ledger transactions.
 * Coordinates business operations through workflow nodes.
 */
