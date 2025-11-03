# Simple Graph

Versioned Simple graph implementation for Amelie's graph system.

## What this is

A multi-version graph implementation that demonstrates proper versioning with separate manifests per version. Each version has its own capabilities and configuration.

## How it works

The graph uses LangGraph state management with MongoDB checkpointing. Each version has:

- Its own manifest file with version-specific configuration
- Separate builder implementation
- Version-specific features and capabilities

## Graph versions

### v1.0.0 (Stable)

- Basic implementation with single generate node
- Simple linear workflow: START → generate → END
- Manifest: `src/versions/v1.0.0/manifest.json`

### v2.0.0 (Beta)

- Enhanced implementation with reflection capabilities
- Extended workflow: START → generate → reflect → END
- Adds self-evaluation for improved response quality
- Manifest: `src/versions/v2.0.0/manifest.json`

### Core components

- **SimpleV1Builder**: Builder for graph version 1.0.0
- **GenerateNode**: Handles LLM message generation
- **SimpleState**: State management using LangGraph annotations
- **SimpleModule**: NestJS module with versioning configuration

## How to use

### Running the service

```bash
# Development mode
yarn start:dev

# Production mode
yarn build
yarn start:prod
```

### API endpoints

```bash
# Health check
GET http://localhost:3003/health

# List registered graphs
GET http://localhost:3003/registry

# Generate response
POST http://localhost:3003/generate
{
  "message": {"role": "user", "content": "Hello"},
  "threadId": "test-123",
  "userId": "user-1",
  "agentId": "agent-1",
  "graphSettings": {
    "graphType": "global.simple::1.0.0",
    "temperature": 0.7,
    "model": "gpt-4"
  }
}

# Stream response
POST http://localhost:3003/stream
{
  "message": {"role": "user", "content": "Tell me a story"},
  "threadId": "test-456",
  "userId": "user-1",
  "agentId": "agent-1",
  "graphSettings": {
    "graphType": "global.simple",
    "systemPrompt": "You are a creative storyteller"
  }
}
```

## Configuration

### Environment variables

```bash
# MongoDB connection
MONGODB_URI=mongodb://localhost:27017/simple-graph

# Service port
PORT=3003

# LLM configuration (optional, can be passed in graphSettings)
OPENAI_API_KEY=your-api-key
```

### Graph settings

```typescript
{
  graphType: "global.simple::1.0.0",  // Graph version
  temperature: 0.7,                     // LLM temperature
  model: "gpt-4",                      // Model name
  maxTokens: 2000,                     // Max tokens
  systemPrompt: "You are helpful"      // System prompt
}
```

## Project structure

```
src/
├── versions/
│   ├── v1.0.0/
│   │   └── builder.ts       # Version 1.0.0 implementation
│   └── v2.0.0/
│       └── builder.ts       # Version 2.0.0 implementation
├── nodes/                   # Shared nodes
├── simple.module.ts         # Module with version registration
└── main.ts                  # Entry point
graph.manifest.json          # Service manifest for discovery
```

## Development

### Adding new versions

1. Create version directory:

```bash
mkdir src/versions/v3.0.0
```

2. Create builder (`src/versions/v3.0.0/builder.ts`):

```typescript
export class SimpleV3Builder extends AbstractGraphBuilder<"3.0.0"> {
  readonly version = "3.0.0" as const;

  constructor(
    @Inject("CHECKPOINTER") checkpointer: MongoDBSaver,
    @Inject(SimpleTokens.GENERATE_NODE) generateNode: Nodes.GenerateNode
  ) {
    super();
    // Implementation
  }

  async buildGraph(): Promise<SimpleCompiledGraph> {
    // Your graph logic here
  }
}
```

3. Register in module:

```typescript
versioning: [
  {
    baseGraphType: "global.simple",
    versions: [
      { version: "1.0.0", builderClass: SimpleV1Builder },
      { version: "2.0.0", builderClass: SimpleV2Builder },
      { version: "3.0.0", builderClass: SimpleV3Builder, isDefault: true },
    ],
  },
];
```

**Note:** Individual version manifests are not needed. The root `graph.manifest.json` is used only for service discovery.

### Testing

```bash
# Unit tests
yarn test

# Coverage
yarn test:cov
```

## Performance notes

- Uses MongoDB checkpointing for state persistence
- Supports streaming responses for better UX
- Automatic connection pooling for MongoDB

## Troubleshooting

### MongoDB connection issues

Ensure MongoDB is running and accessible at the configured URI.

### LLM API errors

Check that your API keys are configured correctly and have sufficient credits.

## What's next

- Add v2.0.0 with enhanced features
- Implement tool calling capabilities
- Add multi-modal support
