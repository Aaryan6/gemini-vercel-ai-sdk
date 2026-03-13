import { NextResponse } from "next/server";
import { readIndex } from "@/lib/kb";

export const runtime = "nodejs";

export async function GET() {
  const entries = await readIndex();
  const sanitized = entries.map(({ embedding, ...rest }) => rest);
  return NextResponse.json({ items: sanitized });
}

