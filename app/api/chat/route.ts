import fs from "node:fs/promises";
import {
  embed,
  streamText,
  convertToModelMessages,
  type CoreMessage,
  type UIMessage,
} from "ai";
import { google } from "@ai-sdk/google";
import { readIndex, pickTopK } from "@/lib/kb";

export const runtime = "nodejs";

const MAX_FILE_CONTEXT_BYTES = 20 * 1024 * 1024;

function extractLatestUserText(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user") {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const query = extractLatestUserText(messages);
  const entries = await readIndex();

  let contextMessage: CoreMessage | null = null;
  if (query && entries.length > 0) {
    const { embedding: queryEmbedding } = await embed({
      model: google.embedding("gemini-embedding-2-preview"),
      value: query,
      providerOptions: { google: { taskType: "RETRIEVAL_QUERY" } },
    });

    const matches = pickTopK(entries, queryEmbedding, 4);
    if (matches.length > 0) {
      const parts: CoreMessage["content"] = [
        {
          type: "text",
          text: "Context from the knowledge base. Use only when relevant.",
        },
      ];

      for (const match of matches) {
        const entry = match.entry;
        if (entry.kind === "text" && entry.text) {
          parts.push({
            type: "text",
            text: `Text note (${entry.id}): ${entry.text}${
              entry.truncated ? "…" : ""
            }`,
          });
          continue;
        }

        if (
          entry.kind === "file" &&
          entry.storedPath &&
          entry.mimeType &&
          entry.originalName
        ) {
          if ((entry.size ?? 0) <= MAX_FILE_CONTEXT_BYTES) {
            const buffer = await fs.readFile(entry.storedPath);
            parts.push({
              type: "text",
              text: `File (${entry.id}): ${entry.originalName}`,
            });
            parts.push({
              type: "file",
              data: buffer,
              mediaType: entry.mimeType,
            });
          } else {
            parts.push({
              type: "text",
              text: `File (${entry.id}): ${entry.originalName} (${entry.mimeType}) is too large to inline. Refer to its metadata.`,
            });
          }
        }
      }

      contextMessage = { role: "user", content: parts };
    }
  }

  const modelMessages = await convertToModelMessages(messages);
  const systemMessage: CoreMessage = {
    role: "system",
    content:
      "You answer questions using the provided knowledge base context. If the context is insufficient, say what is missing.",
  };

  const response = streamText({
    model: google("gemini-2.5-flash"),
    messages: [
      systemMessage,
      ...(contextMessage ? [contextMessage] : []),
      ...modelMessages,
    ],
  });

  return response.toUIMessageStreamResponse();
}
