// Global type registry extension for Agentic Support graph
import { SupportWorkflowStateValues } from "./graph.state";
import { SupportWorkflowConfigValues } from "./graph.config";

// Make this file a module
export {};

declare global {
  namespace GraphTypes {
    interface Registry {
      agenticSupport: {
        Params: unknown;
        State: SupportWorkflowStateValues;
        Config: SupportWorkflowConfigValues;
        Input: unknown;
        Definition: unknown;
        ConfigDefinition: unknown;
        InputDefinition: unknown;
        StateValues: SupportWorkflowStateValues;
        ConfigValues: SupportWorkflowConfigValues;
        InputValues: unknown;
        OutputValues: SupportWorkflowStateValues;
      };
    }
  }
}
