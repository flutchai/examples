# Agentic Support Graph 2025

Multi-agent support system using LangGraph with CoRAG (Chain-of-Retrieval Augmented Generation), intelligent query routing, and adaptive context retrieval.

## What this is

Advanced AI support system that intelligently routes user queries to specialized agents:

- **ConversationRouter**: Analyzes queries and routes to appropriate specialist
- **AuthoritativeAgent**: Fast, accurate answers from documentation and FAQ
- **ResearchAgent**: Deep analysis using iterative CoRAG for complex questions
- **EscalationAgent**: Handles unclear queries, critical issues, and human handoffs

## How it works

### Intelligent Query Routing

The system analyzes each user query to determine the best handling approach:

1. **Documentation queries** → AuthoritativeAgent (fast FAQ/docs search)
2. **Research questions** → ResearchAgent (iterative CoRAG analysis)
3. **Unclear/critical issues** → EscalationAgent (clarification/escalation)

### Chain-of-Retrieval Augmented Generation (CoRAG)

ResearchAgent uses advanced CoRAG for complex queries:

- **Iterative search**: Refines queries based on previous findings
- **Multi-source synthesis**: Combines information from diverse sources
- **Adaptive strategy**: Adjusts search approach based on query complexity
- **Self-reflection**: Validates response quality and completeness

### Streaming & Real-time Updates

- Real-time response streaming for better user experience
- Progress indicators showing current agent thinking
- Adaptive context window management

## Main Components

### Graph Builder (`src/graph/versions/v1.0.0/builder.ts`)

Main workflow orchestration with conditional agent routing and state management.

### Agent Nodes

- **ConversationRouter** (`src/graph/nodes/conversation-router.node.ts`): Query analysis and routing logic
- **AuthoritativeAgent** (`src/graph/nodes/authoritative-agent.node.ts`): Fast documentation search with reranking
- **ResearchAgent** (`src/graph/nodes/research-agent.node.ts`): CoRAG implementation with reflection
- **EscalationAgent** (`src/graph/nodes/escalation-agent.node.ts`): Problem resolution and human handoff

### State Management (`src/graph/graph.state.ts`)

Comprehensive workflow state with:

- Query classification and routing decisions
- CoRAG iteration results and synthesis
- Agent responses with confidence metrics
- Reflection and quality assessments

### Callbacks (`src/callbacks/support-v1.callbacks.ts`)

Interactive user workflows:

- Clarification requests for unclear queries
- Human escalation with ticket management
- Feedback collection and quality assessment
- Follow-up question handling

## API Endpoints

### Process Support Query

```bash
POST /process-support
```

Main endpoint for support query processing:

```json
{
  "threadId": "thread-123",
  "userId": "user-456",
  "agentId": "agent-789",
  "supportData": {
    "userId": "user-456",
    "query": "Как настроить OAuth2 аутентификацию?",
    "priority": "medium",
    "language": "ru",
    "context": "Setting up authentication"
  },
  "graphSettings": {
    "enableCoRAG": true,
    "maxIterations": 5,
    "temperature": 0.7
  }
}
```

### Test Different Query Types

```bash
POST /test-query-type
```

Test different agent routing scenarios:

```json
{
  "queryType": "documentation|research|urgent|unclear",
  "query": "Your test query",
  "language": "ru"
}
```

### Health Check

```bash
GET /health
```

Returns system health and component status.

### Metrics

```bash
GET /metrics?threadId=optional
```

Workflow performance metrics and analytics.

## Configuration

### Environment Variables

```env
# LLM Configuration
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Graph Settings
ENABLE_CORAG=true
MAX_CORAG_ITERATIONS=5
CONTEXT_WINDOW_SIZE=8000
DEFAULT_TEMPERATURE=0.7

# Vector Database
VECTOR_DB_URL=your-vector-db-url
RERANKING_MODEL=cohere_rerank

# Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
```

### Graph Settings

Configure via `graphSettings` in requests:

```json
{
  "enableCoRAG": true,
  "enableReranking": true,
  "maxIterations": 5,
  "contextWindowSize": 8000,
  "temperature": 0.7,
  "streamingEnabled": true
}
```

## Usage Examples

### Simple Documentation Query

```typescript
const request = SupportGraphV1Builder.createDocumentationQuery(
  "user-123",
  "OAuth2",
  "Как подключить Google OAuth?",
  "ru"
);
```

### Research Question

```typescript
const request = SupportGraphV1Builder.createResearchRequest(
  "user-123",
  "Сравните JWT и session-based аутентификацию",
  "Выбор подхода для микросервисной архитектуры",
  "ru"
);
```

### Urgent Issue

```typescript
const request = SupportGraphV1Builder.createUrgentSupportRequest(
  "user-123",
  "API возвращает 500 ошибку для всех запросов!",
  "Production environment down"
);
```

## Integration with Vector Databases

The system integrates with vector databases for document retrieval:

```typescript
// Vector search configuration
const vectorConfig = {
  topK: 15,
  threshold: 0.6,
  hybridSearch: true,
  filters: {
    sources: ["documentation", "faq", "api_reference"],
  },
};
```

## Callback Workflows

### Clarification Flow

When queries are unclear:

1. System identifies ambiguity
2. Generates clarifying questions
3. User provides additional context
4. Workflow resumes with enhanced query

### Escalation Flow

For critical or complex issues:

1. System recognizes need for human help
2. Creates escalation ticket
3. Notifies human specialists
4. Provides status updates to user

### Feedback Loop

Quality improvement through feedback:

1. System requests response rating
2. User provides feedback and rating
3. Analytics track agent performance
4. System learns from feedback patterns

## Performance & Monitoring

### Quality Metrics

- **Confidence scores**: Agent certainty in responses
- **Source diversity**: Range of information sources used
- **Processing time**: Response generation speed
- **User satisfaction**: Feedback-based quality scores

### System Health

- Component availability monitoring
- LLM API health checks
- Vector database connectivity
- Processing pipeline status

### Analytics

- Query type distribution
- Agent usage patterns
- Resolution time analysis
- User satisfaction trends

## Security Considerations

- **Input validation**: All user queries sanitized
- **Rate limiting**: Prevents API abuse
- **PII protection**: Sensitive data handling
- **Access control**: User authorization checks
- **Audit logging**: Complete interaction history

## Development

### Running Locally

```bash
# Install dependencies
yarn install

# Start development server
yarn start:dev

# Run tests
yarn test

# Build for production
yarn build
```

### Testing Agents

Use the built-in test endpoints:

```bash
# Test documentation agent
curl -X POST http://localhost:3000/test-query-type \
  -H "Content-Type: application/json" \
  -d '{"queryType": "documentation", "query": "OAuth2 setup"}'

# Test research agent
curl -X POST http://localhost:3000/test-query-type \
  -H "Content-Type: application/json" \
  -d '{"queryType": "research", "query": "authentication methods"}'
```

### Adding New Agents

1. Create agent node in `src/graph/nodes/`
2. Add to workflow in `builder.ts`
3. Update routing logic in ConversationRouter
4. Add corresponding callbacks if needed

## Troubleshooting

### Common Issues

**Agent not routing correctly**

- Check ConversationRouter confidence thresholds
- Verify query classification logic
- Review routing decision logs

**CoRAG not converging**

- Increase max iterations
- Adjust convergence threshold
- Check vector search quality

**High latency responses**

- Monitor LLM API response times
- Optimize vector search parameters
- Check network connectivity

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=debug
ENABLE_WORKFLOW_TRACING=true
```

This provides detailed insights into:

- Agent routing decisions
- CoRAG iteration progress
- LLM response analysis
- State transitions

## What's Next

Planned improvements:

- **Streaming responses**: Real-time answer generation
- **Multi-modal support**: Image/document analysis
- **Advanced reranking**: Better result relevance
- **Learning from feedback**: Adaptive agent improvement
- **Integration APIs**: External knowledge base connectors
