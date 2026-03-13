import fs from "node:fs/promises";
import path from "node:path";

export type KBEntry = {
  id: string;
  kind: "text" | "file";
  createdAt: string;
  embedding: number[];
  text?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  storedPath?: string;
  truncated?: boolean;
};

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

export async function ensureDataDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function readIndex(): Promise<KBEntry[]> {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    return JSON.parse(raw) as KBEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeIndex(entries: KBEntry[]) {
  await fs.writeFile(INDEX_PATH, JSON.stringify(entries, null, 2), "utf8");
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function pickTopK(entries: KBEntry[], queryEmbedding: number[], k = 4) {
  return entries
    .map((entry) => ({
      entry,
      score: cosineSimilarity(entry.embedding, queryEmbedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((item) => item.score > 0);
}

export async function saveUpload(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
) {
  await ensureDataDirs();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${Date.now()}-${safeName}`;
  const storedPath = path.join(UPLOAD_DIR, storedName);
  await fs.writeFile(storedPath, buffer);
  return { storedName, storedPath };
}

export function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function truncateText(input: string, maxChars: number) {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return { text: input.slice(0, maxChars), truncated: true };
}

