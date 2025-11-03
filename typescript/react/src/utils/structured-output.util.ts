import { Logger } from "@nestjs/common";
import { ZodSchema } from "zod";

type ContentLike = unknown;

function normalizeContent(content: ContentLike): string {
  if (content == null) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String((part as Record<string, unknown>).text ?? "");
        }
        return "";
      })
      .join(" ");
  }

  if (
    typeof content === "object" &&
    "text" in (content as Record<string, unknown>)
  ) {
    return String((content as Record<string, unknown>).text ?? "");
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function extractJsonObject(text: string): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export function parseStructuredOutput<T>(
  content: ContentLike,
  schema: ZodSchema<T>,
  contextLabel: string,
  logger?: Logger
): T | null {
  const rawText = normalizeContent(content);
  const jsonPayload = extractJsonObject(rawText);

  if (!jsonPayload) {
    logger?.warn?.(
      `${contextLabel}: unable to locate JSON object in model response`
    );
    return null;
  }

  try {
    const parsed = JSON.parse(jsonPayload);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      logger?.warn?.(`${contextLabel}: schema validation failed`, result.error);
      return null;
    }

    return result.data;
  } catch (error) {
    logger?.warn?.(`${contextLabel}: JSON parsing failed`, error as Error);
    return null;
  }
}
