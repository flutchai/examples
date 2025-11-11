# Simple Graph Service

Simple versioned graph implementation for Amelie's graph system.

## Quick Start

### Local Development

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build
yarn build

# Run production build
yarn start:prod
```

### Docker Build

The service uses npm version of `@flutchai/flutch-sdk` (currently `^0.1.8`).

**Configure Docker Registry (First Time Setup):**

Copy `.env.example` to `.env` and set your Docker registry:

```bash
cp .env.example .env
```

Edit `.env` and configure:
```bash
DOCKER_REGISTRY=your-registry.example.com
DOCKER_IMAGE_NAME=simple-graph-service
```

**Build from this directory:**

```bash
# Using the build script (recommended)
./build-docker.sh 1.0.19-final

# Or manually
docker build -t your-registry/simple-graph-service:1.0.19-final .
```

**Important:** Build context is the current directory (`examples/typescript/simple`), not the repository root.

### Deploy to Kubernetes

```bash
# Push image to registry
docker push your-registry/simple-graph-service:1.0.19-final

# Update deployment YAML with new image version
# Edit your deployment file with the image tag

# Apply deployment
kubectl apply -f <your-deployment.yaml>

# Check status
kubectl get pods -l app=simple-graph-service
kubectl logs -l app=simple-graph-service --tail=50
```

## Architecture

### Graph Type

- **Base Type:** `flutch.simple`
- **Versioned Type:** `flutch.simple::1.0.3`
- **Company Slug:** `flutch`
- **Graph Name:** `simple`

### Components

- **SimpleV1Builder** (`src/graph/v1.0.3/builder.ts`) - Graph builder for version 1.0.3
- **GenerateNode** - LLM generation node
- **ExecuteToolsNode** - Tool execution node

### Dependencies

- `@flutchai/flutch-sdk` - Core SDK (from npm)
- `@langchain/langgraph` - Graph framework
- `@langchain/langgraph-checkpoint-mongodb` - Checkpointing
- NestJS - Application framework

## Environment Variables

### Docker Build Variables

Configure in `.env` file:

```bash
# Docker registry configuration
DOCKER_REGISTRY=your-registry.example.com
DOCKER_IMAGE_NAME=simple-graph-service
```

### Runtime Variables

Required variables for Kubernetes deployment:

```yaml
# Service
NODE_ENV: production
PORT: 3000

# Graph identification
GRAPH_NAME: flutch.simple
GRAPH_VERSION: 1.0.7

# Databases
REDIS_URL: redis://redis:6379
MONGODB_URI: <from secret>
MONGO_DB_NAME: graph-simple

# Backend integration
API_URL: http://amelie-service:80
INTERNAL_API_TOKEN: <from secret>

# LLM API Keys (from secrets)
ANTHROPIC_API_KEY: <from secret>
OPENAI_API_KEY: <from secret>
# ... other LLM providers
```

## Development

### SDK Version

This graph uses npm version of the SDK. To update SDK version:

```bash
# Update package.json
yarn add @flutchai/flutch-sdk@^0.1.9

# Rebuild
yarn build
```

### Testing Locally

```bash
# Run with development env vars
PORT=3000 yarn dev

# Test health endpoint
curl http://localhost:3000/health

# Test graph types
curl http://localhost:3000/graph-types
```

## Build Script

The `build-docker.sh` script reads Docker configuration from `.env` file:

```bash
# Build with specific version
./build-docker.sh 1.0.20

# Build with 'latest' tag
./build-docker.sh
```

The script:
1. Loads `DOCKER_REGISTRY` and `DOCKER_IMAGE_NAME` from `.env`
2. Builds Docker image with the specified version tag
3. Provides next steps for pushing and deploying

## Deployment History

- **1.0.19-final** - Clean build with npm SDK 0.1.8, optimized Dockerfile
- **1.0.18-npm** - Switched to npm SDK version from local
- **1.0.17-clean** - Removed debug logs from SDK
- **1.0.16-final** - Fixed NestJS dependency injection issues
- **1.0.7-debug** - Initial Kubernetes deployment

## Troubleshooting

### Build Issues

If build fails, check:
1. You're in the correct directory (`examples/typescript/simple`)
2. `.env` file exists with correct `DOCKER_REGISTRY` and `DOCKER_IMAGE_NAME`
3. SDK version in package.json matches published version
4. yarn.lock is up to date

### Runtime Issues

Check pod logs:
```bash
kubectl logs -l app=simple-graph-service --tail=100
```

Common issues:
- Missing environment variables
- MongoDB connection issues
- Redis connection issues
- LLM API key not configured
