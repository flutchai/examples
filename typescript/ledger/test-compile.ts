// Minimal test to check compilation
import { Annotation } from "@langchain/langgraph";

const TestState = Annotation.Root({
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  input: Annotation<{ userId: string; description: string }>({
    reducer: (_, next) => next,
    default: () => ({ userId: "", description: "" }),
  }),
});

console.log("Test state created successfully");
