import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import {
  McpTool,
  ToolExecutionResult,
  McpRuntimeClient as IMcpRuntimeClient,
} from "@flutchai/flutch-sdk";

export interface ReactGraphMcpTool extends McpTool {
  tags?: string[];
}

@Injectable()
export class McpRuntimeClient implements IMcpRuntimeClient {
  private readonly logger = new Logger(McpRuntimeClient.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.MCP_RUNTIME_URL || "http://localhost:3004";
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    this.logger.log(`MCP Runtime Client initialized with URL: ${this.baseUrl}`);
  }

  async getTools(): Promise<ReactGraphMcpTool[]> {
    try {
      this.logger.debug("Fetching available tools from MCP runtime");
      const response = await this.httpClient.get("/tools/list");
      const tools = Array.isArray(response.data) ? response.data : [];
      this.logger.log(`Retrieved ${tools.length} tools from MCP runtime`);
      return tools;
    } catch (error) {
      this.logger.error("Failed to fetch tools from MCP runtime:", error);
      throw new Error(`Failed to fetch tools: ${error.message}`);
    }
  }

  async executeTool(
    name: string,
    args: any,
    context?: { agentId?: string; kbIds?: string[]; userId?: string }
  ): Promise<ToolExecutionResult> {
    try {
      this.logger.debug(`Executing tool: ${name} with args:`, args);
      const requestBody: any = {
        name,
        arguments: args || {},
      };

      // Add context if provided
      if (context) {
        requestBody.context = context;
      }

      const response = await this.httpClient.post(
        "/tools/execute",
        requestBody
      );
      this.logger.log(`Tool ${name} executed successfully`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to execute tool ${name}:`, error);

      if (error.response) {
        return {
          success: false,
          error:
            error.response.data.message ||
            error.response.data.error ||
            "Tool execution failed",
        };
      }

      return {
        success: false,
        error: error.message || "Unknown error occurred",
      };
    }
  }

  async getToolStats() {
    try {
      const response = await this.httpClient.get("/tools/stats");
      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch tool stats:", error);
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.get("/", { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      this.logger.warn("MCP Runtime health check failed:", error.message);
      return false;
    }
  }
}
