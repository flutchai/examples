/**
 * Environment configuration for Simple Graph service
 * Centralized place for all environment-dependent settings
 */

export interface EnvironmentConfig {
  // Basic service config
  port: number;
  nodeEnv: "development" | "production" | "test";

  // LLM Configuration
  llm: {
    defaultModelId?: string;
    apiUrl?: string;
  };

  // Database Configuration
  database: {
    mongoUri: string;
    dbName: string;
  };

  // API Endpoints Configuration
  apis: {
    backend: string;
  };

  // Service Discovery Configuration
  serviceDiscovery: {
    enabled: boolean;
    type: "file" | "consul" | "kubernetes";
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
  return parseInt(process.env.PORT || "3010", 10);
}

/**
 * Load and validate environment configuration
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as
    | "development"
    | "production"
    | "test";

  // Determine if we're in local development
  const isLocalDev =
    nodeEnv === "development" && !process.env.KUBERNETES_SERVICE_HOST;
  const isKubernetes = !!process.env.KUBERNETES_SERVICE_HOST;
  const isProduction = nodeEnv === "production";

  return {
    port: getDefaultPort(nodeEnv, isKubernetes),
    nodeEnv,

    llm: {
      defaultModelId:
        process.env.DEFAULT_MODEL_ID || "6862986ccd48b6854358ee77",
      apiUrl: process.env.LLM_API_URL || "http://localhost:3000",
    },

    database: {
      mongoUri:
        process.env.MONGODB_URI ||
        "mongodb://gredorsonPbEgjiKDWw2LSt7r:p7I4fhPmwLODfEKk@cluster0-shard-00-00.n07zu.mongodb.net:27017,cluster0-shard-00-01.n07zu.mongodb.net:27017,cluster0-shard-00-02.n07zu.mongodb.net:27017/?ssl=true&replicaSet=atlas-a5sp6w-shard-0&authSource=admin&retryWrites=true&w=majority",
      dbName:
        process.env.MONGO_DB_NAME ||
        (isProduction ? "simple-graph-prod" : "simple-graph-dev"),
    },

    apis: {
      backend: process.env.BACKEND_API_URL || "http://localhost:3001",
    },

    serviceDiscovery: {
      // Enable Service Discovery in development and kubernetes, disable in production
      enabled: !isProduction,
      type: isKubernetes ? "kubernetes" : "file",
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
  isLocalDev:
    ENV_CONFIG.nodeEnv === "development" &&
    !process.env.KUBERNETES_SERVICE_HOST,
  isKubernetes: !!process.env.KUBERNETES_SERVICE_HOST,
  isProduction: ENV_CONFIG.nodeEnv === "production",
  isDevelopment: ENV_CONFIG.nodeEnv === "development",
  isTest: ENV_CONFIG.nodeEnv === "test",
};
