import { Injectable } from "@nestjs/common";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ModelInitializer } from "@flutchai/flutch-sdk";
import {
  LedgerGraphStateValues,
  LedgerGraphConfigValues,
} from "../../ledger-graph.builder";

/**
 * Route Intent Node
 *
 * Uses LLM to determine user intent and route to appropriate subgraph:
 * - account_management: For chart of accounts operations (list, create, update accounts)
 * - transactions: For financial transaction operations (record transactions, journal entries)
 */
@Injectable()
export class RouteIntentNode {
  constructor(private readonly modelInitializer: ModelInitializer) {}

  /**
   * Route the request based on user intent using LLM
   */
  async route(
    state: LedgerGraphStateValues,
    config: LangGraphRunnableConfig<LedgerGraphConfigValues>,
  ): Promise<"account_management" | "transactions" | "analytics"> {
    const description = state.input?.description || "";

    console.log(`[ROUTER] Analyzing user request: "${description}"`);

    // Get LLM config from graphSettings
    const routeConfig = config.configurable?.graphSettings?.routeIntent;
    const modelSettings = routeConfig?.llmConfig;

    if (!modelSettings) {
      console.log("[ROUTER] No model settings, defaulting to transactions");
      return "transactions";
    }

    // Initialize LLM with config
    const model = await this.modelInitializer.initializeChatModel({
      modelId: modelSettings.modelId,
      temperature: modelSettings.temperature || 0.0,
      maxTokens: modelSettings.maxTokens || 50,
    });

    if (!model) {
      console.log("[ROUTER] No LLM available, defaulting to transactions");
      return "transactions";
    }

    const routingPrompt = `You are a routing assistant for a financial ledger system. Analyze the user's request and determine which component should handle it.

User request: "${description}"

Available routes:
1. **account_management** - For operations with chart of accounts:
   - Listing accounts
   - Creating new accounts
   - Updating/renaming accounts
   - Managing account hierarchy
   - Viewing account details

2. **transactions** - For financial transaction operations:
   - Recording transactions
   - Creating journal entries
   - Moving money between accounts
   - Viewing transaction history

3. **analytics** - For analytical queries and reporting:
   - Account balance analysis
   - Transaction history analysis
   - Financial reports and summaries
   - Spending patterns
   - Revenue/expense breakdowns
   - Period comparisons
   - Any questions about financial data

Respond with ONLY ONE WORD - either "account_management", "transactions", or "analytics".`;

    try {
      const response = await model.invoke(
        [{ role: "user", content: routingPrompt }],
        config,
      );

      const route = response.content.toString().toLowerCase().trim();

      console.log(`[ROUTER] LLM response: "${route}"`);

      // Validate and return route
      if (
        route.includes("account_management") ||
        route === "account_management"
      ) {
        console.log(`[ROUTER] Route: account_management`);
        return "account_management";
      } else if (route.includes("analytics") || route === "analytics") {
        console.log(`[ROUTER] Route: analytics`);
        return "analytics";
      } else {
        console.log(`[ROUTER] Route: transactions (default)`);
        return "transactions";
      }
    } catch (error) {
      console.error(`[ROUTER] Error during LLM routing:`, error);
      return "transactions"; // Default fallback
    }
  }
}
