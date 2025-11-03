import { Injectable, Logger } from "@nestjs/common";
import {
  IChartValue,
  IChartDataset,
  IChartDataPoint,
  ChartType,
} from "@flutchai/flutch-sdk";

/**
 * Chart Builder Tool
 *
 * Intelligent chart generation tool that automatically selects
 * the best chart type based on data characteristics and user intent.
 */
@Injectable()
export class ChartBuilderTool {
  private readonly logger = new Logger(ChartBuilderTool.name);

  /**
   * Build a chart from analytical data
   *
   * @param data - Raw data to visualize
   * @param intent - What the chart should show (e.g., "compare revenue", "show balance trends")
   * @param suggestedType - Optional chart type suggestion
   */
  buildChart(
    data: any,
    intent: string,
    suggestedType?: ChartType
  ): IChartValue {
    this.logger.debug(
      `Building chart with intent: "${intent}", suggested type: ${suggestedType}`
    );

    // Determine chart type if not provided
    const chartType = suggestedType || this.selectChartType(data, intent);

    // Build chart based on data structure
    if (this.isBalanceData(data)) {
      return this.buildBalanceChart(data, chartType);
    } else if (this.isTransactionData(data)) {
      return this.buildTransactionChart(data, chartType);
    } else if (this.isPeriodComparisonData(data)) {
      return this.buildComparisonChart(data, chartType);
    } else if (this.isSpendingPatternsData(data)) {
      return this.buildSpendingChart(data, chartType);
    } else if (this.isFinancialSummaryData(data)) {
      return this.buildSummaryChart(data, chartType);
    }

    // Fallback: generic chart
    return this.buildGenericChart(data, chartType, intent);
  }

  /**
   * Intelligently select chart type based on data and intent
   */
  private selectChartType(data: any, intent: string): ChartType {
    const intentLower = intent.toLowerCase();

    // Keywords for specific chart types
    if (
      intentLower.includes("trend") ||
      intentLower.includes("over time") ||
      intentLower.includes("history")
    ) {
      return "line";
    }

    if (
      intentLower.includes("compare") ||
      intentLower.includes("vs") ||
      intentLower.includes("comparison")
    ) {
      return "bar";
    }

    if (
      intentLower.includes("distribution") ||
      intentLower.includes("breakdown") ||
      intentLower.includes("proportion")
    ) {
      return "pie";
    }

    // Default based on data structure
    if (Array.isArray(data) && data.length > 10) {
      return "line"; // Many points = line chart
    }

    if (Array.isArray(data) && data.length <= 5) {
      return "pie"; // Few categories = pie chart
    }

    return "bar"; // Default
  }

  /**
   * Check if data is balance data (accounts with balances)
   */
  private isBalanceData(data: any): boolean {
    return (
      data?.balancesByType || data?.totals || data?.accountCount !== undefined
    );
  }

  /**
   * Build chart for account balances
   */
  private buildBalanceChart(data: any, chartType: ChartType): IChartValue {
    const { balancesByType, totals } = data;

    if (chartType === "pie") {
      // Pie chart for balance distribution
      const dataPoints: IChartDataPoint[] = [
        {
          label: "Assets",
          value: totals.totalAssets,
          color: "#10b981",
        },
        {
          label: "Liabilities",
          value: totals.totalLiabilities,
          color: "#ef4444",
        },
        {
          label: "Equity",
          value: totals.totalEquity,
          color: "#3b82f6",
        },
      ].filter(p => p.value > 0);

      return {
        type: "pie",
        title: "Financial Position",
        description: "Distribution of assets, liabilities, and equity",
        datasets: [
          {
            label: "Balance",
            data: dataPoints,
          },
        ],
        options: {
          showLegend: true,
          currency: true,
        },
      };
    }

    // Bar chart for comparing account types
    const dataPoints: IChartDataPoint[] = [
      { label: "Assets", value: totals.totalAssets, color: "#10b981" },
      {
        label: "Liabilities",
        value: totals.totalLiabilities,
        color: "#ef4444",
      },
      { label: "Equity", value: totals.totalEquity, color: "#3b82f6" },
      { label: "Revenue", value: totals.totalRevenue, color: "#8b5cf6" },
      { label: "Expenses", value: totals.totalExpenses, color: "#f59e0b" },
    ].filter(p => p.value > 0);

    return {
      type: "bar",
      title: "Account Balances by Type",
      description: `Total of ${data.accountCount} accounts`,
      datasets: [
        {
          label: "Balance",
          data: dataPoints,
        },
      ],
      options: {
        showGrid: true,
        currency: true,
      },
    };
  }

  /**
   * Check if data is transaction data
   */
  private isTransactionData(data: any): boolean {
    return data?.transactions !== undefined;
  }

  /**
   * Build chart for transaction history
   */
  private buildTransactionChart(data: any, chartType: ChartType): IChartValue {
    const transactions = data.transactions || [];

    // Group transactions by date
    const transactionsByDate: Record<string, number> = {};

    transactions.forEach((t: any) => {
      const date = new Date(t.date).toLocaleDateString();
      transactionsByDate[date] =
        (transactionsByDate[date] || 0) + (t.amount || 0);
    });

    const dataPoints: IChartDataPoint[] = Object.entries(transactionsByDate)
      .map(([date, amount]) => ({
        label: date,
        value: amount,
      }))
      .slice(0, 20); // Last 20 days

    return {
      type: chartType === "pie" ? "bar" : chartType,
      title: "Transaction Activity",
      description: `Last ${dataPoints.length} transaction periods`,
      datasets: [
        {
          label: "Amount",
          data: dataPoints,
          color: "#3b82f6",
        },
      ],
      options: {
        showGrid: true,
        currency: true,
      },
    };
  }

  /**
   * Check if data is period comparison data
   */
  private isPeriodComparisonData(data: any): boolean {
    return data?.currentMonth && data?.lastMonth;
  }

  /**
   * Build comparison chart
   */
  private buildComparisonChart(data: any, chartType: ChartType): IChartValue {
    const { currentMonth, lastMonth } = data;

    const dataPoints: IChartDataPoint[] = [
      { label: "Revenue", value: currentMonth.revenue, color: "#10b981" },
      { label: "Expenses", value: currentMonth.expenses, color: "#ef4444" },
      { label: "Profit", value: currentMonth.profit, color: "#3b82f6" },
    ];

    const lastMonthPoints: IChartDataPoint[] = [
      { label: "Revenue", value: lastMonth.revenue, color: "#6ee7b7" },
      { label: "Expenses", value: lastMonth.expenses, color: "#fca5a5" },
      { label: "Profit", value: lastMonth.profit, color: "#93c5fd" },
    ];

    return {
      type: chartType,
      title: "Period Comparison",
      description: "Current month vs last month",
      datasets: [
        {
          label: "Current Month",
          data: dataPoints,
        },
        {
          label: "Last Month",
          data: lastMonthPoints,
        },
      ],
      options: {
        showLegend: true,
        showGrid: true,
        currency: true,
      },
    };
  }

  /**
   * Check if data is spending patterns data
   */
  private isSpendingPatternsData(data: any): boolean {
    return data?.spendingCategories !== undefined;
  }

  /**
   * Build spending patterns chart
   */
  private buildSpendingChart(data: any, chartType: ChartType): IChartValue {
    const categories = data.spendingCategories || [];

    const dataPoints: IChartDataPoint[] = categories
      .slice(0, 10)
      .map((cat: any) => ({
        label: cat.accountName,
        value: cat.totalSpent,
      }));

    return {
      type: chartType,
      title: "Spending by Category",
      description: `Total spending: $${data.totalSpending?.toLocaleString() || 0}`,
      datasets: [
        {
          label: "Spent",
          data: dataPoints,
          color: "#f59e0b",
        },
      ],
      options: {
        showLegend: chartType === "pie",
        showGrid: chartType !== "pie",
        currency: true,
      },
    };
  }

  /**
   * Check if data is financial summary data
   */
  private isFinancialSummaryData(data: any): boolean {
    return data?.profitAndLoss && data?.balanceSheet;
  }

  /**
   * Build financial summary chart
   */
  private buildSummaryChart(data: any, chartType: ChartType): IChartValue {
    const { profitAndLoss, balanceSheet } = data;

    if (chartType === "pie") {
      // Balance Sheet as pie
      const dataPoints: IChartDataPoint[] = [
        { label: "Assets", value: balanceSheet.assets, color: "#10b981" },
        {
          label: "Liabilities",
          value: balanceSheet.liabilities,
          color: "#ef4444",
        },
        { label: "Equity", value: balanceSheet.equity, color: "#3b82f6" },
      ];

      return {
        type: "pie",
        title: "Balance Sheet",
        description: `Net Worth: $${balanceSheet.netWorth.toLocaleString()}`,
        datasets: [
          {
            label: "Balance",
            data: dataPoints,
          },
        ],
        options: {
          showLegend: true,
          currency: true,
        },
      };
    }

    // P&L as bar chart
    const dataPoints: IChartDataPoint[] = [
      { label: "Revenue", value: profitAndLoss.revenue, color: "#10b981" },
      { label: "Expenses", value: profitAndLoss.expenses, color: "#ef4444" },
      { label: "Net Income", value: profitAndLoss.netIncome, color: "#3b82f6" },
    ];

    return {
      type: "bar",
      title: "Profit & Loss",
      description: `Profit Margin: ${profitAndLoss.profitMargin}`,
      datasets: [
        {
          label: "Amount",
          data: dataPoints,
        },
      ],
      options: {
        showGrid: true,
        currency: true,
      },
    };
  }

  /**
   * Build generic chart from unknown data structure
   */
  private buildGenericChart(
    data: any,
    chartType: ChartType,
    title: string
  ): IChartValue {
    this.logger.warn("Building generic chart for unknown data structure");

    // Try to extract numeric data
    const dataPoints: IChartDataPoint[] = [];

    if (typeof data === "object" && data !== null) {
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === "number") {
          dataPoints.push({ label: key, value });
        }
      });
    }

    return {
      type: chartType,
      title: title || "Data Visualization",
      description: "Analytical chart",
      datasets: [
        {
          label: "Value",
          data: dataPoints,
        },
      ],
      options: {
        showGrid: true,
      },
    };
  }
}
