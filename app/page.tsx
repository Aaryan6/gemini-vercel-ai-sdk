"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";

type KBItem = {
  id: string;
  kind: "text" | "file";
  createdAt: string;
  text?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  truncated?: boolean;
};

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function Home() {
  const [items, setItems] = useState<KBItem[]>([]);
  const [kbText, setKbText] = useState("");
  const [kbFiles, setKbFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, setMessages, status } = useChat({
    api: "/api/chat",
  });
  const [input, setInput] = useState("");

  const sortedItems = useMemo(() => {
    return [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [items]);

  async function loadIndex() {
    const res = await fetch("/api/index");
    if (!res.ok) return;
    const data = (await res.json()) as { items?: KBItem[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void loadIndex();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function handleIngest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    if (kbText.trim()) {
      formData.set("text", kbText.trim());
    }
    if (kbFiles) {
      Array.from(kbFiles).forEach((file) => formData.append("files", file));
    }

    const res = await fetch("/api/ingest", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = (await res.json()) as { error?: string };
      setUploadError(error.error ?? "Failed to ingest content.");
    } else {
      setKbText("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setKbFiles(null);
      await loadIndex();
    }

    setIsUploading(false);
  }

  async function handleDelete(itemId: string) {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId }),
    });
    if (!res.ok) {
      return;
    }
    await loadIndex();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.05fr_1.2fr] lg:items-start">
        <section className="space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold leading-tight text-white">
              Multimodal knowledge base for chat.
            </h1>
            <p className="text-sm text-slate-400">
              Add text, images, audio, video, or PDFs. Gemini Embedding 2 powers
              retrieval, and the chat model answers with the most relevant
              assets.
            </p>
          </header>

          <form
            onSubmit={handleIngest}
            className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-[0_0_30px_-15px_rgba(59,130,246,0.5)]"
          >
            <label className="block text-sm font-medium text-slate-200">
              Add text notes
            </label>
            <textarea
              value={kbText}
              onChange={(event) => setKbText(event.target.value)}
              placeholder="Paste notes, transcripts, or any text you want to embed."
              rows={5}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none ring-2 ring-transparent focus:ring-blue-500"
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Add files (images, audio, video, PDF, text)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(event) => setKbFiles(event.target.files)}
                className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-blue-500/20 file:px-4 file:py-2 file:text-sm file:text-blue-200 hover:border-blue-500/50"
              />
              <p className="text-xs text-slate-500">
                Max 10 MB per file. Large media may be referenced without being
                fully injected into the chat.
              </p>
            </div>

            {uploadError ? (
              <p className="text-sm text-rose-400">{uploadError}</p>
            ) : null}

            <button
              type="submit"
              disabled={isUploading}
              className="w-full rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/60"
            >
              {isUploading ? "Embedding..." : "Embed Into Knowledge Base"}
            </button>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Knowledge base entries</span>
              <span>{sortedItems.length} items</span>
            </div>
            <div className="space-y-3">
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-200"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    <div className="flex items-center gap-3">
                      <span className="uppercase">{item.kind}</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 transition hover:border-rose-500 hover:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {item.kind === "text" ? (
                    <p className="mt-2 line-clamp-3 text-sm text-slate-100">
                      {item.text}
                      {item.truncated ? "…" : ""}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-slate-100">
                        {item.originalName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.mimeType} · {formatBytes(item.size)}
                      </p>
                      {item.text ? (
                        <p className="text-xs text-slate-400">
                          Text extracted · {item.truncated ? "truncated" : "ok"}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {sortedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
                  Add your first item to start chatting with it.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex min-h-[560px] max-h-[calc(100vh-6rem)] flex-col rounded-3xl border border-slate-800 bg-slate-900/60 p-5 lg:sticky lg:top-10">
          <header className="flex items-start justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Chat</h2>
              <p className="text-xs text-slate-400">
                Ask questions about anything you ingested.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
              <span>{status === "streaming" ? "Thinking..." : "Ready"}</span>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 transition hover:border-blue-500 hover:text-blue-200"
              >
                Clear chat
              </button>
            </div>
          </header>

          <div className="chat-scroll flex-1 space-y-4 overflow-y-auto py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-slate-950 text-slate-100"
                  }`}
                >
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <span key={index}>{part.text}</span>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!input.trim() || status !== "ready") return;
              sendMessage({ text: input.trim() });
              setInput("");
            }}
            className="mt-auto flex gap-2 pt-4"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about the knowledge base..."
              className="flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-100 outline-none ring-2 ring-transparent focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={status !== "ready"}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
