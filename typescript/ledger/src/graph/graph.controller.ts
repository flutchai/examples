import { Controller, Inject } from "@nestjs/common";
import { GraphController } from "@flutchai/flutch-sdk";
import { IGraphService } from "@flutchai/flutch-sdk";
import { BuilderRegistryService } from "@flutchai/flutch-sdk";

/**
 * Ledger Graph Controller
 * Inherits all base graph functionality (health, generate, stream, etc.)
 * No custom endpoints needed - use base /generate and /stream
 */
@Controller()
export class LedgerGraphController extends GraphController {
  constructor(
    @Inject("GRAPH_SERVICE") protected readonly graphService: IGraphService,
    builderRegistry: BuilderRegistryService
  ) {
    super(graphService, builderRegistry);
  }

  // Base methods (health, graph-types, generate, stream) are inherited from GraphController
}
