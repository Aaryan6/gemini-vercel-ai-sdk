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
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Home() {
  const [items, setItems] = useState<KBItem[]>([]);
  const [kbText, setKbText] = useState("");
  const [kbFiles, setKbFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, setMessages, status } = useChat({ api: "/api/chat" });
  const [input, setInput] = useState("");

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items],
  );

  async function loadIndex() {
    const res = await fetch("/api/index");
    if (!res.ok) return;
    const data = (await res.json()) as { items?: KBItem[] };
    setItems(data.items ?? []);
  }

  useEffect(() => { void loadIndex(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function handleIngest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    if (kbText.trim()) formData.set("text", kbText.trim());
    if (kbFiles) Array.from(kbFiles).forEach((f) => formData.append("files", f));

    const res = await fetch("/api/ingest", { method: "POST", body: formData });

    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      setUploadError(err.error ?? "Failed to ingest content.");
    } else {
      setKbText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setKbFiles(null);
      await loadIndex();
    }

    setIsUploading(false);
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await loadIndex();
  }

  const isStreaming = status === "streaming";
  const isThinking = status === "submitted";
  const isBusy = isStreaming || isThinking;

  return (
    <div className="app-root">
      {/* ── Ambient background ── */}
      <div className="bg-ambient" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="dot-grid" />
      </div>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">◈</div>
            <span className="logo-name">
              Gem<em>KB</em>
            </span>
          </div>
          <div className="header-right">
            <span className="header-tag">Gemini Embedding 2</span>
            <div className="status-pill" data-streaming={isBusy}>
              <span className="status-dot" />
              {isBusy ? (isThinking ? "thinking" : "processing") : "ready"}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {/* ── Left: Corpus ── */}
        <section
          className="corpus-section animate-in"
          style={{ "--anim-delay": "0ms" } as React.CSSProperties}
        >
          <div className="section-label">01 / corpus</div>

          <h1 className="corpus-heading">
            Multimodal<br />Knowledge Base
          </h1>

          <p className="corpus-sub">
            Drop text, images, audio, video, or PDFs.{" "}
            <span className="hl">Gemini Embedding 2</span> vectorizes
            everything — then chat with the most relevant context.
          </p>

          {/* ── Ingest form ── */}
          <form
            onSubmit={handleIngest}
            className="ingest-card animate-in"
            style={{ "--anim-delay": "80ms" } as React.CSSProperties}
          >
            <div className="form-fields">
              {/* Text notes */}
              <div className="form-field">
                <label className="field-label" htmlFor="kb-text">
                  Text Notes
                </label>
                <textarea
                  id="kb-text"
                  value={kbText}
                  onChange={(e) => setKbText(e.target.value)}
                  placeholder="Paste notes, transcripts, or any text to embed…"
                  rows={3}
                  className="field-textarea"
                />
              </div>

              {/* File drop zone */}
              <div className="form-field">
                <label className="field-label">
                  Files{" "}
                  <span className="field-label-note">
                    — images, audio, video, PDF, text
                  </span>
                </label>
                <div
                  className={`drop-zone${isDragOver ? " is-drag-over" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Click or drag to add files"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    setKbFiles(e.dataTransfer.files);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => setKbFiles(e.target.files)}
                    className="sr-only"
                  />
                  <div className="drop-zone-inner">
                    <span className="drop-icon">⊕</span>
                    {kbFiles && kbFiles.length > 0 ? (
                      <span className="drop-text">
                        {kbFiles.length} file{kbFiles.length > 1 ? "s" : ""} selected
                      </span>
                    ) : (
                      <span className="drop-text">Drop files here or click to browse</span>
                    )}
                    <span className="drop-hint">Max 10 MB per file</span>
                  </div>
                </div>
              </div>

              {uploadError && (
                <p className="error-msg">⚠ {uploadError}</p>
              )}

              <button type="submit" disabled={isUploading} className="embed-btn">
                <span className="embed-btn-inner">
                  {isUploading ? (
                    <>
                      <span className="embed-spinner" />
                      Embedding…
                    </>
                  ) : (
                    <>
                      <span>⊛</span>
                      Embed into Knowledge Base
                    </>
                  )}
                </span>
                <span className="embed-btn-shimmer" aria-hidden="true" />
              </button>
            </div>
          </form>

          {/* ── KB entries list ── */}
          <div
            className="animate-in"
            style={{ "--anim-delay": "160ms" } as React.CSSProperties}
          >
            <div className="kb-list-header">
              <span className="kb-list-title">Knowledge Base</span>
              <span>
                <span className="kb-count-big">{sortedItems.length}</span>
                <span className="kb-count-unit">vectors</span>
              </span>
            </div>

            <div className="kb-entries">
              {sortedItems.length === 0 ? (
                <div className="kb-empty">
                  <span className="kb-empty-glyph">◇</span>
                  <span>No entries yet. Embed something to begin.</span>
                </div>
              ) : (
                sortedItems.map((item) => (
                  <div key={item.id} className="kb-entry">
                    <div className="kb-entry-header">
                      <span className="kb-kind-badge" data-kind={item.kind}>
                        {item.kind}
                      </span>
                      <span className="kb-entry-time">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="kb-delete"
                      >
                        ✕ remove
                      </button>
                    </div>

                    {item.kind === "text" ? (
                      <p className="kb-entry-text">
                        {item.text}
                        {item.truncated ? "…" : ""}
                      </p>
                    ) : (
                      <div>
                        <span className="kb-file-name">{item.originalName}</span>
                        <span className="kb-file-meta">
                          {item.mimeType} · {formatBytes(item.size)}
                        </span>
                        {item.text && (
                          <span className="kb-file-extracted">
                            text extracted{item.truncated ? " · truncated" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ── Right: Chat ── */}
        <section
          className="chat-section animate-in"
          style={{ "--anim-delay": "40ms" } as React.CSSProperties}
        >
          <div className="chat-panel">
            {/* Chat header */}
            <div className="chat-header">
              <div>
                <div className="section-label">02 / oracle</div>
                <h2 className="chat-heading">Chat with your data</h2>
              </div>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="clear-btn"
              >
                clear
              </button>
            </div>

            {/* Messages */}
            <div className="chat-messages chat-scroll">
              {messages.length === 0 ? (
                <div className="chat-empty-state">
                  <span className="chat-empty-glyph">◈</span>
                  <span className="chat-empty-title">Ask anything you embedded.</span>
                  <span>The knowledge base will surface the most relevant context.</span>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`msg-row ${msg.role}`}>
                    <div className={`msg-bubble ${msg.role}`}>
                      {msg.parts.map((part, i) =>
                        part.type === "text" ? <span key={i}>{part.text}</span> : null,
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Typing indicator while waiting for first token */}
              {isThinking && (
                <div className="msg-row assistant">
                  <div className="msg-bubble assistant thinking-indicator" aria-live="polite">
                    <span className="thinking-label">thinking<span className="thinking-ellipsis" aria-hidden="true" /></span>
                    <span className="thinking-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                </div>
              )}

              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="msg-row assistant">
                  <div className="msg-bubble assistant typing-indicator">
                    <span /><span /><span />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!input.trim() || status !== "ready") return;
                sendMessage({ text: input.trim() });
                setInput("");
              }}
              className="chat-input-row"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your knowledge base…"
                disabled={isStreaming}
                className="chat-input"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={status !== "ready"}
                className="send-btn"
              >
                <span>Send</span>
                <span className="send-arrow">→</span>
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
