/**
 * Environment configuration for Ledger Graph service
 * Centralized place for all environment-dependent settings
 */

export interface EnvironmentConfig {
  // Basic service config
  port: number;
  nodeEnv: "development" | "production" | "test";

  // Database Configuration
  database: {
    mongoUri: string;
    dbName: string;
  };

  // Logging Configuration
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

/**
 * Determine default port based on environment
 */
function getDefaultPort(nodeEnv: string, isKubernetes: boolean): number {
  // Kubernetes: use port from environment or 3000
  if (isKubernetes) {
    return parseInt(process.env.PORT || "3000", 10);
  }

  // Production: standard port 3000
  if (nodeEnv === "production") {
    return parseInt(process.env.PORT || "3000", 10);
  }

  // Local development: use higher port to avoid conflicts
  return parseInt(process.env.PORT || "3011", 10);
}

/**
 * Load and validate environment configuration
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as
    | "development"
    | "production"
    | "test";

  const isKubernetes = !!process.env.KUBERNETES_SERVICE_HOST;
  const isProduction = nodeEnv === "production";

  return {
    port: getDefaultPort(nodeEnv, isKubernetes),
    nodeEnv,

    database: {
      mongoUri:
        process.env.MONGODB_URI ||
        "mongodb://gredorsonPbEgjiKDWw2LSt7r:p7I4fhPmwLODfEKk@cluster0-shard-00-00.n07zu.mongodb.net:27017,cluster0-shard-00-01.n07zu.mongodb.net:27017,cluster0-shard-00-02.n07zu.mongodb.net:27017/?ssl=true&replicaSet=atlas-a5sp6w-shard-0&authSource=admin&retryWrites=true&w=majority",
      dbName:
        process.env.MONGO_DB_NAME ||
        (isProduction ? "ledger-graph-prod" : "ledger-graph-dev"),
    },

    logging: {
      level: isProduction ? "info" : "debug",
    },
  };
}

/**
 * Get environment-specific configuration
 */
export const ENV_CONFIG = loadEnvironmentConfig();

/**
 * Environment detection helpers
 */
export const ENV_HELPERS = {
  isKubernetes: !!process.env.KUBERNETES_SERVICE_HOST,
  isProduction: ENV_CONFIG.nodeEnv === "production",
  isDevelopment: ENV_CONFIG.nodeEnv === "development",
  isTest: ENV_CONFIG.nodeEnv === "test",
};
