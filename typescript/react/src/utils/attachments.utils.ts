import { ReactGraphStateValues } from "../react-graph.builder";
import {
  IAttachment,
  AttachmentType,
  CitationValue,
} from "@flutchai/flutch-sdk";

/**
 * Build attachments from graph state by extracting them from working memory
 */
export function buildAttachmentsFromState(
  state: ReactGraphStateValues,
): IAttachment[] {
  const attachments: IAttachment[] = [];
  const seen = new Set<string>();

  const summaries = state.workingMemory ?? [];
  summaries.forEach((summary) => {
    const payload = summary.observation?.payload;
    const extracted = extractAttachmentsFromPayload(payload);
    extracted.forEach((att) => {
      // For citations, deduplicate by source URL and title
      if (att.type === AttachmentType.CITATION) {
        const citationValue = att.value as CitationValue;
        const sourceUrl = citationValue.source?.url ?? "";
        const sourceTitle = citationValue.source?.title ?? "";
        const key = `${att.type}:${sourceUrl}:${sourceTitle}`;
        if (!seen.has(key)) {
          seen.add(key);
          attachments.push(att);
        }
      } else {
        // For other attachment types, just add them
        attachments.push(att);
      }
    });
  });

  return attachments;
}

function extractAttachmentsFromPayload(payload: unknown): IAttachment[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const attachments: IAttachment[] = [];
  const value = payload as Record<string, any>;

  // Knowledge base search chunks
  if (Array.isArray(value.chunks)) {
    value.chunks.forEach((chunk: any) => {
      const metadata = chunk?.metadata ?? {};
      attachments.push({
        type: AttachmentType.CITATION,
        value: {
          source: {
            url: metadata.sourceUrl ?? metadata.url ?? "",
            title:
              metadata.sourceTitle ||
              metadata.title ||
              metadata.slug ||
              `KB Document ${metadata.articleId ?? ""}`,
            type: "article",
            articleId: metadata.articleId,
            knowledgeBaseId: metadata.knowledgeBaseId,
          },
        },
      });
    });
  }

  // Web search results
  if (Array.isArray(value.results)) {
    value.results.forEach((result: any) => {
      attachments.push({
        type: AttachmentType.CITATION,
        value: {
          source: {
            url: result.url ?? "",
            title: result.title ?? result.url ?? "Web result",
            type: "webpage",
          },
        },
      });
    });
  }

  // Full document retrieval
  if (value.publishedArticle || value.draftArticle) {
    const doc = value.publishedArticle ?? value.draftArticle;
    attachments.push({
      type: AttachmentType.CITATION,
      value: {
        source: {
          url: doc?.slug ? `${doc.slug}` : "",
          title: doc?.title ?? "Knowledge base document",
          type: "article",
          articleId: doc?.id,
          knowledgeBaseId: doc?.knowledgeBaseId,
        },
      },
    });
  }

  return attachments;
}
