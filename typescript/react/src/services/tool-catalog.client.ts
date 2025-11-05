import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { IToolCatalog } from "@flutchai/flutch-sdk";
import { firstValueFrom } from "rxjs";
import { ENV_CONFIG } from "../config/environment.config";

@Injectable()
export class ToolCatalogClient {
  private readonly logger = new Logger(ToolCatalogClient.name);
  private readonly baseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = ENV_CONFIG.apis?.backend || "http://localhost:3001";
  }

  async getActiveTools(): Promise<IToolCatalog[]> {
    try {
      this.logger.debug("Fetching active tools from catalog");
      const response = await firstValueFrom(
        this.httpService.get<IToolCatalog[]>(
          `${this.baseUrl}/api/tools/active`,
        ),
      );
      this.logger.debug(`Retrieved ${response.data.length} active tools`);
      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch active tools:", error.message);
      return [];
    }
  }

  async getToolsByNames(toolNames: string[]): Promise<IToolCatalog[]> {
    if (toolNames.length === 0) {
      return [];
    }

    try {
      this.logger.debug(`Fetching tools by names: ${toolNames.join(", ")}`);
      const response = await firstValueFrom(
        this.httpService.post<IToolCatalog[]>(
          `${this.baseUrl}/api/tools/by-names`,
          {
            toolNames,
          },
        ),
      );
      this.logger.debug(
        `Found ${response.data.length} tools out of ${toolNames.length} requested`,
      );
      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch tools by names:", error.message);
      return [];
    }
  }

  async validateTools(toolNames: string[]): Promise<{
    validTools: string[];
    invalidTools: string[];
    inactiveTools: string[];
  }> {
    if (toolNames.length === 0) {
      return { validTools: [], invalidTools: [], inactiveTools: [] };
    }

    const catalogTools = await this.getToolsByNames(toolNames);
    const catalogToolMap = new Map(
      catalogTools.map((tool) => [tool.toolName, tool]),
    );

    const validTools: string[] = [];
    const invalidTools: string[] = [];
    const inactiveTools: string[] = [];

    for (const toolName of toolNames) {
      const catalogTool = catalogToolMap.get(toolName);

      if (!catalogTool) {
        invalidTools.push(toolName);
      } else if (!catalogTool.isActive) {
        inactiveTools.push(toolName);
      } else {
        validTools.push(toolName);
      }
    }

    this.logger.debug(
      `Tool validation results: ${validTools.length} valid, ${invalidTools.length} invalid, ${inactiveTools.length} inactive`,
    );

    return { validTools, invalidTools, inactiveTools };
  }
}
