import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { readIndex, writeIndex, type KBEntry } from "@/lib/kb";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const entries = await readIndex();
  const target = entries.find((entry) => entry.id === id);
  if (!target) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const remaining = entries.filter((entry) => entry.id !== id);
  await writeIndex(remaining);

  if (target.kind === "file" && target.storedPath) {
    try {
      await fs.rm(target.storedPath, { force: true });
    } catch {
      // Ignore file system cleanup errors for now.
    }
  }

  return NextResponse.json({
    deleted: { id: target.id, kind: target.kind } satisfies Partial<KBEntry>,
  });
}

