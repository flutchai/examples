import { Controller, Inject } from "@nestjs/common";
import { GraphController } from "@flutchai/flutch-sdk";
import { IGraphService } from "@flutchai/flutch-sdk";
import { BuilderRegistryService } from "@flutchai/flutch-sdk";

/**
 * Support Graph Controller
 * Inherits all base graph functionality (health, generate, stream, etc.)
 * No custom endpoints needed - use base /generate and /stream
 */
@Controller()
export class SupportGraphController extends GraphController {
  constructor(
    @Inject("GRAPH_SERVICE") protected readonly graphService: IGraphService,
    builderRegistry: BuilderRegistryService
  ) {
    super(graphService, builderRegistry);
  }

  // All methods are inherited from GraphController:
  // - /health - health check
  // - /graph-types - get supported graph types
  // - /generate - synchronous generation
  // - /stream - streaming generation
  // - /cancel/:requestId - cancel request
  // - /registry - registry info
}
