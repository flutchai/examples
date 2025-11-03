# Analytics Subgraph

Analytics subgraph for financial data analysis and reporting in the Ledger Graph.

## Overview

The Analytics subgraph handles analytical queries about accounts and transactions. It uses LLM to understand user intent, executes appropriate analytical tools, and formats results into user-friendly insights.

## Architecture

### Flow

```
START
  ↓
[Analyze Query] - LLM determines what user wants and which tools are needed
  ↓
[Execute Tools] - Retrieve and process data using analytical tools
  ↓
[Format Response] - LLM formats results into user-friendly insights
  ↓
END
```

### State

**File:** `analytics.state.ts`

```typescript
{
  query: string,                    // Original user query
  analyticalIntent: string,         // What user wants to know
  toolsToExecute: string[],         // Tools needed for analysis
  toolResults: Record<string, any>, // Tool execution results
  analyticsResult: string,          // Final formatted response
  messages: BaseMessage[],          // LLM conversation history
  userId: string,                   // User ID
  error?: string                    // Error if any
}
```

## Nodes

### 1. Analyze Query Node

**File:** `nodes/analyze-query.node.ts`

**Purpose:** Uses LLM to analyze user's analytical query and determine:

- What the user wants to know (analytical intent)
- Which tools/data sources are needed
- How to structure the analysis

**Available Analytical Capabilities:**

1. `get_account_balances` - Get current balances for accounts
2. `get_transaction_history` - Get transaction history with filters
3. `calculate_period_comparison` - Compare financial metrics between periods
4. `analyze_spending_patterns` - Analyze spending by category
5. `generate_financial_summary` - Generate summary reports

**Output:** Updates state with `analyticalIntent` and `toolsToExecute`.

### 2. Execute Analytics Tool Node

**File:** `nodes/execute-analytics-tool.node.ts`

**Purpose:** Executes the analytical tools determined by AnalyzeQueryNode. This is where actual data retrieval and calculations happen.

**Status:** Framework ready. Individual tool implementations will be added later.

**Output:** Updates state with `toolResults`.

### 3. Format Analytics Response Node

**File:** `nodes/format-analytics-response.node.ts`

**Purpose:** Takes tool execution results and formats them into a user-friendly analytical response using LLM.

Provides:

1. Direct answer to the user's question
2. Key insights from the data
3. Relevant trends or patterns
4. Actionable recommendations if appropriate

**Output:** Updates state with `analyticsResult`.

## Router Integration

The analytics subgraph is integrated into the main ledger graph through the router.

**File:** `graph/nodes/route-intent.node.ts`

When user asks analytical questions like:

- "Show me account balances"
- "What were my expenses last month?"
- "Compare revenue this quarter vs last quarter"
- "Analyze spending patterns"

The router directs to the `analytics` subgraph.

## Usage Example

```typescript
// User query: "What were my total expenses last month?"

// 1. Router routes to analytics subgraph
// 2. Analyze Query determines:
{
  intent: "Calculate total expenses for the previous month",
  tools: ["get_transaction_history", "calculate_period_comparison"],
  parameters: {
    period: "last month",
    accountType: "EXPENSE"
  }
}

// 3. Execute Tools retrieves data
// 4. Format Response creates user-friendly answer:
"Your total expenses last month were $3,450.
This is a 15% increase compared to the previous month ($3,000).
The main categories were: Office expenses ($1,200),
Salaries ($2,000), and Utilities ($250)."
```

## Next Steps

### Tool Implementation

Tools to be implemented in `execute-analytics-tool.node.ts`:

1. **get_account_balances**
   - Query AccountService for current balances
   - Filter by account type if specified
   - Return formatted balance data

2. **get_transaction_history**
   - Query JournalEntryService for transactions
   - Apply filters (date range, account, type)
   - Return transaction list with details

3. **calculate_period_comparison**
   - Get data for two periods
   - Calculate differences and percentages
   - Return comparison metrics

4. **analyze_spending_patterns**
   - Group transactions by category/account
   - Calculate totals and averages
   - Identify trends

5. **generate_financial_summary**
   - Generate P&L statement
   - Generate Balance Sheet
   - Calculate key ratios

## Integration

The analytics subgraph is fully integrated into the main graph:

- **Router:** Updated to recognize analytical queries
- **Builder:** Analytics subgraph wired into v1.0.0 graph
- **Module:** All analytics components registered in GraphModule

Ready for tool implementation and testing! 🚀
