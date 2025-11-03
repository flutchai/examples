/**
 * Dependency injection tokens for Simple graph
 */
export const SimpleTokens = {
  GENERATE_NODE: Symbol("GENERATE_NODE"),
  CHECKPOINTER: Symbol("CHECKPOINTER"),
  MONGO_CONNECTION: Symbol("MONGO_CONNECTION"),
  MONGO_CLIENT: Symbol("MONGO_CLIENT"),
} as const;
