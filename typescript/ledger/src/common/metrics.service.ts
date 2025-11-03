import { Counter, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Basic Prometheus metrics for the ledger graph service.
 */
export class LedgerMetrics {
  private readonly registry: Registry;
  private readonly operations: Counter;

  constructor(registry?: Registry) {
    this.registry = registry ?? new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.operations = new Counter({
      name: "ledger_operations_total",
      help: "Total number of ledger operations processed",
      registers: [this.registry],
    });
  }

  /**
   * Increment the operations counter.
   */
  incOperations() {
    this.operations.inc();
  }

  /**
   * Expose metrics in Prometheus text format.
   */
  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
