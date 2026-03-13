import { NextResponse } from "next/server";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import {
  ensureDataDirs,
  readIndex,
  saveUpload,
  truncateText,
  writeIndex,
  type KBEntry,
  toDataUrl,
} from "@/lib/kb";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;

function isTextMimeType(mimeType: string) {
  return mimeType.startsWith("text/");
}

function allowedMimeType(mimeType: string) {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf"
  );
}

export async function POST(req: Request) {
  await ensureDataDirs();
  const formData = await req.formData();
  const textInput = formData.get("text");
  const files = formData.getAll("files");

  const entries = await readIndex();
  const created: KBEntry[] = [];

  if (typeof textInput === "string" && textInput.trim().length > 0) {
    const trimmed = textInput.trim();
    const { text, truncated } = truncateText(trimmed, MAX_TEXT_CHARS);
    const { embedding } = await embed({
      model: google.embedding("gemini-embedding-2-preview"),
      value: text,
      providerOptions: { google: { taskType: "RETRIEVAL_DOCUMENT" } },
    });

    created.push({
      id: crypto.randomUUID(),
      kind: "text",
      createdAt: new Date().toISOString(),
      embedding,
      text,
      truncated,
    });
  }

  for (const file of files) {
    if (!(file instanceof File)) continue;
    if (file.size === 0) continue;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File ${file.name} exceeds 10MB limit.` },
        { status: 400 },
      );
    }
    if (!allowedMimeType(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { storedName, storedPath } = await saveUpload(
      buffer,
      file.name,
      file.type,
    );

    let embedding: number[] | undefined;
    let extractedText: string | undefined;
    let truncated = false;

    if (isTextMimeType(file.type)) {
      const rawText = buffer.toString("utf8");
      const truncatedResult = truncateText(rawText, MAX_TEXT_CHARS);
      extractedText = truncatedResult.text;
      truncated = truncatedResult.truncated;
      const embedResult = await embed({
        model: google.embedding("gemini-embedding-2-preview"),
        value: extractedText,
        providerOptions: { google: { taskType: "RETRIEVAL_DOCUMENT" } },
      });
      embedding = embedResult.embedding;
    } else {
      const dataUrl = toDataUrl(buffer, file.type);
      const embedResult = await embed({
        model: google.embedding("gemini-embedding-2-preview"),
        value: file.name,
        providerOptions: {
          google: {
            taskType: "RETRIEVAL_DOCUMENT",
            content: [
              {
                type: "file",
                data: dataUrl,
                mediaType: file.type,
              },
            ],
          },
        },
      });
      embedding = embedResult.embedding;
    }

    created.push({
      id: crypto.randomUUID(),
      kind: "file",
      createdAt: new Date().toISOString(),
      embedding: embedding ?? [],
      filename: storedName,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      storedPath,
      text: extractedText,
      truncated,
    });
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: "No text or files provided." },
      { status: 400 },
    );
  }

  await writeIndex([...created, ...entries]);

  return NextResponse.json({
    added: created.map(({ embedding, ...rest }) => rest),
  });
}
