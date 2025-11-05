import { Injectable, Logger } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { AnalyticsStateValues } from "../analytics.state";
import { AccountService } from "../../../../service/account/account.service";
import { JournalEntryService } from "../../../../service/journal-entry/journal-entry.service";
import { AccountType } from "../../../../common/types";
import { ChartBuilderTool } from "../tools/chart-builder.tool";
import { ChartType } from "@flutchai/flutch-sdk";

/**
 * Execute Analytics Tool Node
 *
 * Executes the analytical tools determined by the AnalyzeQueryNode.
 * This is where actual data retrieval and calculations happen.
 */
@Injectable()
export class ExecuteAnalyticsToolNode {
  private readonly logger = new Logger(ExecuteAnalyticsToolNode.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly journalEntryService: JournalEntryService,
    private readonly chartBuilder: ChartBuilderTool,
  ) {}

  async execute(
    state: AnalyticsStateValues,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<AnalyticsStateValues>> {
    this.logger.log(
      `[ANALYTICS] Executing tools: ${state.toolsToExecute?.join(", ")}`,
    );

    const toolResults: Record<string, any> = {};

    try {
      // Execute each tool
      for (const toolName of state.toolsToExecute || []) {
        this.logger.debug(`[ANALYTICS] Executing tool: ${toolName}`);

        switch (toolName) {
          case "get_account_balances":
            toolResults[toolName] = await this.getAccountBalances(state.userId);
            break;

          case "get_transaction_history":
            toolResults[toolName] = await this.getTransactionHistory(
              state.userId,
            );
            break;

          case "calculate_period_comparison":
            toolResults[toolName] = await this.calculatePeriodComparison(
              state.userId,
            );
            break;

          case "analyze_spending_patterns":
            toolResults[toolName] = await this.analyzeSpendingPatterns(
              state.userId,
            );
            break;

          case "generate_financial_summary":
            toolResults[toolName] = await this.generateFinancialSummary(
              state.userId,
            );
            break;

          case "generate_chart":
            // Generate chart from other tool results
            toolResults[toolName] = this.generateChart(
              toolResults,
              state.analyticalIntent || state.query,
            );
            break;

          default:
            this.logger.warn(`[ANALYTICS] Unknown tool: ${toolName}`);
            toolResults[toolName] = {
              status: "unknown_tool",
              message: `Tool ${toolName} is not implemented`,
            };
        }
      }

      this.logger.log(
        `[ANALYTICS] Tools executed: ${Object.keys(toolResults).length}`,
      );

      return {
        toolResults,
      };
    } catch (error) {
      this.logger.error(`[ANALYTICS] Error executing tools:`, error);
      return {
        error: `Failed to execute analytical tools: ${error.message}`,
      };
    }
  }

  /**
   * Tool: Get Account Balances
   * Returns current balances for all or specific accounts
   */
  private async getAccountBalances(userId: string) {
    this.logger.debug(`[TOOL] get_account_balances for user: ${userId}`);

    const accounts = await this.accountService.getUserAccounts(userId);

    // Group by type
    const balancesByType = {
      assets: accounts
        .filter((a) => a.accountType === AccountType.ASSET)
        .map((a) => ({
          code: a.accountCode,
          name: a.accountName,
          balance: a.balance,
        })),
      liabilities: accounts
        .filter((a) => a.accountType === AccountType.LIABILITY)
        .map((a) => ({
          code: a.accountCode,
          name: a.accountName,
          balance: a.balance,
        })),
      equity: accounts
        .filter((a) => a.accountType === AccountType.EQUITY)
        .map((a) => ({
          code: a.accountCode,
          name: a.accountName,
          balance: a.balance,
        })),
      revenue: accounts
        .filter((a) => a.accountType === AccountType.REVENUE)
        .map((a) => ({
          code: a.accountCode,
          name: a.accountName,
          balance: a.balance,
        })),
      expenses: accounts
        .filter((a) => a.accountType === AccountType.EXPENSE)
        .map((a) => ({
          code: a.accountCode,
          name: a.accountName,
          balance: a.balance,
        })),
    };

    // Calculate totals
    const totals = {
      totalAssets: balancesByType.assets.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      ),
      totalLiabilities: balancesByType.liabilities.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      ),
      totalEquity: balancesByType.equity.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      ),
      totalRevenue: balancesByType.revenue.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      ),
      totalExpenses: balancesByType.expenses.reduce(
        (sum, acc) => sum + acc.balance,
        0,
      ),
    };

    const netWorth =
      totals.totalAssets - totals.totalLiabilities + totals.totalEquity;

    return {
      balancesByType,
      totals,
      netWorth,
      accountCount: accounts.length,
    };
  }

  /**
   * Tool: Get Transaction History
   * Returns recent transactions with details
   */
  private async getTransactionHistory(userId: string, limit: number = 20) {
    this.logger.debug(`[TOOL] get_transaction_history for user: ${userId}`);

    const entries = await this.journalEntryService.getUserJournalEntries(
      userId,
      undefined,
      limit,
    );

    const transactions = entries.map((entry) => {
      const debitEntry = entry.entries.find((e) => e.debitAmount > 0);
      const creditEntry = entry.entries.find((e) => e.creditAmount > 0);

      return {
        id: entry.journalEntryId,
        date: entry.date,
        description: entry.description,
        reference: entry.reference,
        amount: debitEntry?.debitAmount || 0,
        debitAccount: debitEntry
          ? {
              code: (debitEntry.accountId as any)?.accountCode,
              name: (debitEntry.accountId as any)?.accountName,
            }
          : null,
        creditAccount: creditEntry
          ? {
              code: (creditEntry.accountId as any)?.accountCode,
              name: (creditEntry.accountId as any)?.accountName,
            }
          : null,
        status: entry.status,
      };
    });

    return {
      transactions,
      totalCount: transactions.length,
    };
  }

  /**
   * Tool: Calculate Period Comparison
   * Compares financial metrics between periods
   */
  private async calculatePeriodComparison(userId: string) {
    this.logger.debug(`[TOOL] calculate_period_comparison for user: ${userId}`);

    // Get current month transactions
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get previous month transactions
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const currentMonthEntries =
      await this.journalEntryService.getJournalEntriesInDateRange(
        userId,
        currentMonthStart,
        currentMonthEnd,
      );

    const lastMonthEntries =
      await this.journalEntryService.getJournalEntriesInDateRange(
        userId,
        lastMonthStart,
        lastMonthEnd,
      );

    // Calculate totals
    const calculateTotals = (entries: any[]) => {
      let revenue = 0;
      let expenses = 0;

      entries.forEach((entry) => {
        entry.entries.forEach((line: any) => {
          const account = line.accountId;
          if (account?.accountType === AccountType.REVENUE) {
            revenue += line.creditAmount;
          } else if (account?.accountType === AccountType.EXPENSE) {
            expenses += line.debitAmount;
          }
        });
      });

      return { revenue, expenses, profit: revenue - expenses };
    };

    const currentMonth = calculateTotals(currentMonthEntries);
    const lastMonth = calculateTotals(lastMonthEntries);

    // Calculate changes
    const revenueChange =
      lastMonth.revenue > 0
        ? ((currentMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100
        : 0;
    const expenseChange =
      lastMonth.expenses > 0
        ? ((currentMonth.expenses - lastMonth.expenses) / lastMonth.expenses) *
          100
        : 0;

    return {
      currentMonth: {
        period: "Current Month",
        ...currentMonth,
        transactionCount: currentMonthEntries.length,
      },
      lastMonth: {
        period: "Last Month",
        ...lastMonth,
        transactionCount: lastMonthEntries.length,
      },
      changes: {
        revenueChange: `${revenueChange.toFixed(1)}%`,
        expenseChange: `${expenseChange.toFixed(1)}%`,
      },
    };
  }

  /**
   * Tool: Analyze Spending Patterns
   * Analyzes spending by category/account
   */
  private async analyzeSpendingPatterns(userId: string) {
    this.logger.debug(`[TOOL] analyze_spending_patterns for user: ${userId}`);

    const accounts = await this.accountService.getUserAccounts(userId);
    const expenseAccounts = accounts.filter(
      (a) => a.accountType === AccountType.EXPENSE,
    );

    // Get transactions for last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const entries = await this.journalEntryService.getJournalEntriesInDateRange(
      userId,
      startDate,
      endDate,
    );

    // Aggregate spending by expense account
    const spendingByAccount: Record<
      string,
      { name: string; total: number; count: number }
    > = {};

    entries.forEach((entry) => {
      entry.entries.forEach((line: any) => {
        const account = line.accountId;
        if (account?.accountType === AccountType.EXPENSE) {
          const key = account.accountCode;
          if (!spendingByAccount[key]) {
            spendingByAccount[key] = {
              name: account.accountName,
              total: 0,
              count: 0,
            };
          }
          spendingByAccount[key].total += line.debitAmount;
          spendingByAccount[key].count += 1;
        }
      });
    });

    // Sort by total spending
    const spendingCategories = Object.entries(spendingByAccount)
      .map(([code, data]) => ({
        accountCode: code,
        accountName: data.name,
        totalSpent: data.total,
        transactionCount: data.count,
        averageTransaction: data.total / data.count,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    const totalSpending = spendingCategories.reduce(
      (sum, cat) => sum + cat.totalSpent,
      0,
    );

    return {
      period: "Last 30 days",
      spendingCategories,
      totalSpending,
      topCategory: spendingCategories[0] || null,
    };
  }

  /**
   * Tool: Generate Financial Summary
   * Generates comprehensive financial summary (P&L, Balance Sheet)
   */
  private async generateFinancialSummary(userId: string) {
    this.logger.debug(`[TOOL] generate_financial_summary for user: ${userId}`);

    const trialBalance = await this.accountService.getTrialBalance(userId);

    // Calculate P&L metrics
    const totalRevenue = trialBalance.revenue.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );
    const totalExpenses = trialBalance.expenses.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );
    const netIncome = totalRevenue - totalExpenses;

    // Balance Sheet metrics
    const totalAssets = trialBalance.assets.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );
    const totalLiabilities = trialBalance.liabilities.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );
    const totalEquity = trialBalance.equity.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );

    const netWorth = totalAssets - totalLiabilities + totalEquity;

    // Financial ratios
    const currentRatio =
      totalLiabilities > 0 ? totalAssets / totalLiabilities : 0;
    const profitMargin =
      totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

    return {
      profitAndLoss: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netIncome,
        profitMargin: `${profitMargin.toFixed(1)}%`,
      },
      balanceSheet: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        netWorth,
      },
      ratios: {
        currentRatio: currentRatio.toFixed(2),
        debtToEquity:
          totalEquity > 0 ? (totalLiabilities / totalEquity).toFixed(2) : "N/A",
      },
      isBalanced: trialBalance.isBalanced,
    };
  }

  /**
   * Tool: Generate Chart
   * Creates a visual chart from analytical data
   */
  private generateChart(toolResults: Record<string, any>, intent: string): any {
    this.logger.debug(`[TOOL] generate_chart with intent: ${intent}`);

    // Find the most relevant data source from tool results
    let dataSource: any;
    let suggestedChartType: ChartType | undefined;

    // Determine which data to visualize based on what tools were executed
    if (toolResults.get_account_balances) {
      dataSource = toolResults.get_account_balances;
      suggestedChartType = intent.toLowerCase().includes("distribution")
        ? "pie"
        : "bar";
    } else if (toolResults.calculate_period_comparison) {
      dataSource = toolResults.calculate_period_comparison;
      suggestedChartType = "bar";
    } else if (toolResults.analyze_spending_patterns) {
      dataSource = toolResults.analyze_spending_patterns;
      suggestedChartType = intent.toLowerCase().includes("breakdown")
        ? "pie"
        : "bar";
    } else if (toolResults.generate_financial_summary) {
      dataSource = toolResults.generate_financial_summary;
      suggestedChartType = "bar";
    } else if (toolResults.get_transaction_history) {
      dataSource = toolResults.get_transaction_history;
      suggestedChartType = "line";
    }

    if (!dataSource) {
      this.logger.warn("[TOOL] No data source found for chart generation");
      return {
        error: "No data available for chart generation",
      };
    }

    // Use ChartBuilder to create the chart
    const chart = this.chartBuilder.buildChart(
      dataSource,
      intent,
      suggestedChartType,
    );

    this.logger.log(
      `[TOOL] Chart generated: type=${chart.type}, title="${chart.title}"`,
    );

    return chart;
  }
}
