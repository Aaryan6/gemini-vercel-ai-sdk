import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";

export type StoredItem = {
  id: string;
  kind: "text" | "file";
  createdAt: string;
  embedding: number[];
  text?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
  fileUrl?: string;
  truncated?: boolean;
  metadata?: Record<string, unknown>;
};

type StoredItemRow = {
  id: string;
  kind: "text" | "file";
  created_at: string;
  embedding?: unknown;
  text: string | null;
  truncated: boolean | null;
  original_name: string | null;
  stored_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  file_url: string | null;
  metadata: Record<string, unknown> | null;
};

type MatchRow = StoredItemRow & {
  score: number;
};

export function createStoredItemId() {
  return randomUUID();
}

export function sanitizeStoredItem(item: StoredItem) {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => key !== "embedding"),
  ) as Omit<StoredItem, "embedding">;
}

function sanitizeFileName(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toVectorString(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

function parseEmbedding(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => Number(item));
      }
    } catch {
      return [];
    }
  }

  return [];
}

function mapRowToStoredItem(row: StoredItemRow): StoredItem {
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    embedding: parseEmbedding(row.embedding),
    text: row.text ?? undefined,
    filename: row.stored_name ?? undefined,
    originalName: row.original_name ?? undefined,
    mimeType: row.mime_type ?? undefined,
    size: row.size_bytes ?? undefined,
    storagePath: row.storage_path ?? undefined,
    fileUrl: row.file_url ?? undefined,
    truncated: row.truncated ?? false,
    metadata: row.metadata ?? undefined,
  };
}

function mapStoredItemToRow(item: StoredItem) {
  return {
    id: item.id,
    kind: item.kind,
    created_at: item.createdAt,
    embedding: toVectorString(item.embedding),
    text: item.text ?? null,
    truncated: item.truncated ?? false,
    original_name: item.originalName ?? null,
    stored_name: item.filename ?? null,
    mime_type: item.mimeType ?? null,
    size_bytes: item.size ?? null,
    storage_path: item.storagePath ?? null,
    file_url: item.fileUrl ?? null,
    metadata: item.metadata ?? {},
  };
}

export async function listStoredItems() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("uploaded_items")
    .select(
      "id, kind, created_at, text, truncated, original_name, stored_name, mime_type, size_bytes, storage_path, file_url, metadata",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list items: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRowToStoredItem(row as StoredItemRow));
}

export async function getStoredItemById(id: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("uploaded_items")
    .select(
      "id, kind, created_at, text, truncated, original_name, stored_name, mime_type, size_bytes, storage_path, file_url, metadata",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read item: ${error.message}`);
  }

  return data ? mapRowToStoredItem(data as StoredItemRow) : null;
}

export async function insertStoredItem(item: StoredItem) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("uploaded_items")
    .insert(mapStoredItemToRow(item))
    .select(
      "id, kind, created_at, embedding, text, truncated, original_name, stored_name, mime_type, size_bytes, storage_path, file_url, metadata",
    )
    .single();

  if (error) {
    throw new Error(`Failed to save item: ${error.message}`);
  }

  return mapRowToStoredItem(data as StoredItemRow);
}

export async function deleteStoredItem(id: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("uploaded_items").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete item: ${error.message}`);
  }
}

export async function searchStoredItems(queryEmbedding: number[], limit = 4) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("match_uploaded_items", {
    query_embedding: toVectorString(queryEmbedding),
    match_count: limit,
  });

  if (error) {
    throw new Error(`Failed to search items: ${error.message}`);
  }

  return ((data ?? []) as MatchRow[]).map((row) => ({
    item: mapRowToStoredItem(row),
    score: Number(row.score ?? 0),
  }));
}

export async function uploadFileToStorage(
  fileId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
) {
  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();
  const storedName = `${Date.now()}-${sanitizeFileName(originalName)}`;
  const storagePath = `uploads/${fileId}/${storedName}`;

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return { storedName, storagePath, fileUrl: publicUrl };
}

export async function downloadStoredFile(storagePath: string) {
  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function removeStoredFile(storagePath: string) {
  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export function toDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function truncateText(input: string, maxChars: number) {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return { text: input.slice(0, maxChars), truncated: true };
}
