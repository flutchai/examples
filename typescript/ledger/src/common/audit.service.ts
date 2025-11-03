import { Injectable, Logger } from "@nestjs/common";

/**
 * Simple audit service that logs ledger operations with correlation IDs.
 * In a real-world scenario this could persist records to an audit store
 * or emit events for further processing.
 */
@Injectable()
export class LedgerAuditService {
  private readonly logger = new Logger(LedgerAuditService.name);

  /**
   * Log an operation with optional correlation identifier and payload.
   */
  log(action: string, payload: Record<string, any>, correlationId?: string) {
    const message = correlationId ? `[${correlationId}] ${action}` : action;
    this.logger.log(message, JSON.stringify(payload));
  }
}
