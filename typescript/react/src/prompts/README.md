# ReAct Graph Prompt System

This directory contains professional ReAct system prompts with best practices and configuration examples.

## Quick Start

The React graph now supports different prompt styles optimized for different use cases:

```typescript
const graphSettings: ReactGraphSettings = {
  // Choose prompt style
  promptStyle: "default", // 'default' | 'research' | 'task-oriented' | 'conversational' | 'custom'

  // Model configuration (simplified)
  modelSettings: {
    modelId: "gpt-4", // Primary model for ReAct
    temperature: 0.7,
  },

  // Tool configuration
  allowedTools: [
    { name: "kb_search", enabled: true, config: { kbIds: ["kb-123"] } },
  ],
};
```

## Prompt Styles

### Default Style

- **Best for**: General-purpose assistance
- **Characteristics**: Balanced, versatile, clear instructions
- **Use when**: Most general use cases

### Research Style

- **Best for**: Knowledge-intensive tasks, fact-checking, analysis
- **Characteristics**: Emphasizes accuracy, source evaluation, evidence synthesis
- **Use when**: Users need detailed research with citations

### Task-Oriented Style

- **Best for**: Action-heavy workflows, process completion
- **Characteristics**: Goal-focused, efficient, step-by-step execution
- **Use when**: Users want specific tasks completed efficiently

### Conversational Style

- **Best for**: Natural dialogue, exploratory conversations
- **Characteristics**: Friendly, contextually aware, adaptive communication
- **Use when**: Users prefer natural conversation flow

## Configuration Examples

### Basic Configuration (Default)

```typescript
const config: ReactGraphSettings = {
  stepBudget: 6,
  modelSettings: {
    modelId: "gpt-4",
    temperature: 0.7,
  },
  allowedTools: [
    { name: "kb_search", enabled: true },
    { name: "web_search", enabled: true },
  ],
};
```

### Research Assistant Configuration

```typescript
const config: ReactGraphSettings = {
  promptStyle: "research",
  stepBudget: 10, // More steps for thorough research
  includeToolContext: true,
  includeConversationHistory: true,
  maxStepsInPrompt: 5, // More context for research
  modelSettings: {
    modelId: "gpt-4",
    temperature: 0.3, // Lower temperature for accuracy
  },
  allowedTools: [
    { name: "kb_search", enabled: true, config: { topK: 15 } },
    { name: "web_search", enabled: true },
    { name: "document_analysis", enabled: true },
  ],
};
```

### Task-Oriented Agent Configuration

```typescript
const config: ReactGraphSettings = {
  promptStyle: "task-oriented",
  stepBudget: 8,
  includeToolContext: true,
  includeConversationHistory: false, // Focus on current task
  modelSettings: {
    modelId: "gpt-4",
    temperature: 0.5,
  },
  allowedTools: [
    { name: "file_operations", enabled: true },
    { name: "api_calls", enabled: true },
    { name: "data_processing", enabled: true },
  ],
};
```

### Conversational Assistant Configuration

```typescript
const config: ReactGraphSettings = {
  promptStyle: "conversational",
  stepBudget: 6,
  includeToolContext: false, // Let tools be discovered naturally
  includeConversationHistory: true,
  maxStepsInPrompt: 3,
  modelSettings: {
    modelId: "gpt-4",
    temperature: 0.8, // More creative responses
  },
  allowedTools: [
    { name: "kb_search", enabled: true },
    { name: "general_info", enabled: true },
  ],
};
```

### Custom Prompt Configuration

```typescript
const config: ReactGraphSettings = {
  promptStyle: "custom",
  systemPrompt: `You are a specialized financial advisor AI that helps users with investment decisions.

## Your Expertise
- Portfolio analysis and optimization
- Risk assessment and management
- Market research and trend analysis
- Financial planning strategies

## Your Approach
1. **Understand** the user's financial goals and risk tolerance
2. **Research** current market conditions and relevant data
3. **Analyze** options using available tools and data
4. **Recommend** specific actions with clear rationale
5. **Explain** risks and potential outcomes

Always provide clear, actionable advice backed by data when possible.`,

  includeToolContext: true,
  modelSettings: {
    modelId: "gpt-4",
    temperature: 0.4, // Conservative for financial advice
  },
  allowedTools: [
    { name: "market_data", enabled: true },
    { name: "financial_calculator", enabled: true },
    { name: "risk_analyzer", enabled: true },
  ],
};
```

## Advanced Configuration Options

### Prompt Context Control

```typescript
const config: ReactGraphSettings = {
  includeToolContext: true, // Show available tools in prompt
  includeConversationHistory: true, // Include previous messages
  maxStepsInPrompt: 5, // How many previous steps to include
  // ...
};
```

### Model Compatibility

```typescript
const config: ReactGraphSettings = {
  modelSettings: {
    // New format (recommended)
    modelId: "gpt-4",

    // Legacy format (still supported)
    plannerModelId: "gpt-4", // Maps to modelId

    // These are ignored in new ReAct pattern
    executorModelId: "gpt-3.5-turbo", // Ignored
    reflectorModelId: "gpt-3.5-turbo", // Ignored

    // This is still used for final answer generation when needed
    answerModelId: "gpt-4",

    temperature: 0.7,
  },
};
```

## Best Practices

### 1. Choose the Right Style

- **Default**: Start here for most use cases
- **Research**: When accuracy and citations matter
- **Task-oriented**: When efficiency and completion matter
- **Conversational**: When user experience and engagement matter
- **Custom**: When you need domain-specific behavior

### 2. Temperature Guidelines

- **0.1-0.3**: Factual, analytical tasks (research, calculations)
- **0.4-0.6**: Balanced tasks (general assistance, planning)
- **0.7-0.9**: Creative, conversational tasks (brainstorming, dialogue)

### 3. Step Budget Sizing

- **3-5 steps**: Simple queries, quick tasks
- **6-8 steps**: Standard complexity (default)
- **9-12 steps**: Complex research, multi-step processes
- **13+ steps**: Very complex workflows (use with caution)

### 4. Tool Configuration

- Enable only tools that are actually needed
- Configure tool parameters appropriately for use case
- Consider tool interaction patterns (some tools work better together)

### 5. Context Management

- `includeToolContext: true` for tool-heavy workflows
- `includeConversationHistory: true` for multi-turn conversations
- Adjust `maxStepsInPrompt` based on context window and needs

## Migration from Old System

### Old Configuration

```typescript
// Old complex configuration
const oldConfig = {
  planAndSelectTool: {
    model: "gpt-4",
    temperature: 0.3,
    systemPrompt: "Complex planning prompt...",
  },
  reflectAndDecide: {
    model: "gpt-3.5-turbo",
    temperature: 0.4,
    systemPrompt: "Complex reflection prompt...",
  },
  // ... more complex configs
};
```

### New Configuration

```typescript
// New simplified configuration
const newConfig = {
  promptStyle: "research", // Handles complexity automatically
  modelSettings: {
    modelId: "gpt-4",
    temperature: 0.3,
  },
  // Much simpler!
};
```

The new system maintains backward compatibility while providing much simpler configuration with better defaults.

## Troubleshooting

### Common Issues

1. **Tools not being used**: Check `includeToolContext: true` and verify tools are properly configured
2. **Repetitive behavior**: Try lowering temperature or using 'task-oriented' style
3. **Not following conversation**: Enable `includeConversationHistory: true`
4. **Too verbose**: Try 'task-oriented' style or lower temperature
5. **Not detailed enough**: Try 'research' style or increase `maxStepsInPrompt`

### Performance Tips

- Use appropriate step budgets (don't over-budget)
- Choose the most specific prompt style for your use case
- Configure only needed tools to reduce prompt complexity
- Adjust context inclusion based on actual needs

## Examples in Practice

See the `examples/` directory for complete working examples of different configuration patterns and their expected behaviors.
