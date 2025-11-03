/**
 * Environment configuration for the Email + KB ReAct graph service
 */

export interface EnvironmentConfig {
  port: number;
  nodeEnv: "development" | "production" | "test";
  llm: {
    defaultModelId?: string;
    apiUrl?: string;
  };
  database: {
    mongoUri: string;
    dbName: string;
  };
  apis: {
    backend: string;
  };
  serviceDiscovery: {
    enabled: boolean;
    type: "file" | "consul" | "kubernetes";
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

function resolvePort(nodeEnv: string, isKubernetes: boolean): number {
  if (isKubernetes) {
    return parseInt(process.env.PORT || "3000", 10);
  }
  if (nodeEnv === "production") {
    return parseInt(process.env.PORT || "3000", 10);
  }
  return parseInt(process.env.PORT || "3020", 10);
}

export function loadEnvironmentConfig(): EnvironmentConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as
    | "development"
    | "production"
    | "test";
  const isKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST);
  const isProduction = nodeEnv === "production";

  return {
    port: resolvePort(nodeEnv, isKubernetes),
    nodeEnv,
    llm: {
      defaultModelId:
        process.env.DEFAULT_MODEL_ID || "6862986ccd48b6854358ee77",
      apiUrl: process.env.LLM_API_URL || "http://localhost:3000",
    },
    database: {
      mongoUri:
        process.env.MONGODB_URI || "mongodb://localhost:27017/react-graph",
      dbName: process.env.MONGO_DB_NAME || "react_graph",
    },
    apis: {
      backend: process.env.BACKEND_API_URL || "http://localhost:3001",
    },
    serviceDiscovery: {
      enabled: !isProduction,
      type: isKubernetes ? "kubernetes" : "file",
    },
    logging: {
      level: isProduction ? "info" : "debug",
    },
  };
}

export const ENV_CONFIG = loadEnvironmentConfig();

export const ENV_HELPERS = {
  isLocalDev:
    ENV_CONFIG.nodeEnv === "development" &&
    !process.env.KUBERNETES_SERVICE_HOST,
  isKubernetes: Boolean(process.env.KUBERNETES_SERVICE_HOST),
  isProduction: ENV_CONFIG.nodeEnv === "production",
  isDevelopment: ENV_CONFIG.nodeEnv === "development",
  isTest: ENV_CONFIG.nodeEnv === "test",
};
