"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

type LibraryItem = {
  id: string;
  kind: "text" | "file";
  createdAt: string;
  text?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  fileUrl?: string;
  truncated?: boolean;
  metadata?: Record<string, unknown>;
};

type RetrievalMatch = {
  score: number;
  willInlineFile: boolean;
  item: LibraryItem;
};

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function Home() {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [noteText, setNoteText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [retrievalMatches, setRetrievalMatches] = useState<RetrievalMatch[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  const sortedItems = useMemo(
    () =>
      [...libraryItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [libraryItems],
  );

  async function loadItems() {
    const response = await fetch("/api/index");
    if (!response.ok) return;
    const data = (await response.json()) as { items?: LibraryItem[] };
    setLibraryItems(data.items ?? []);
  }

  useEffect(() => {
    fetch("/api/index")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { items?: LibraryItem[] };
      })
      .then((data) => {
        if (data) {
          setLibraryItems(data.items ?? []);
        }
      })
      .catch(() => {
        // Keep the empty state if the initial request fails.
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function handleIngest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    if (noteText.trim()) formData.set("text", noteText.trim());
    if (selectedFiles) {
      Array.from(selectedFiles).forEach((file) => formData.append("files", file));
    }

    const response = await fetch("/api/ingest", { method: "POST", body: formData });

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: string };
      setUploadError(errorData.error ?? "Failed to upload content.");
    } else {
      setNoteText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFiles(null);
      await loadItems();
    }

    setIsUploading(false);
  }

  async function handleDelete(id: string) {
    const response = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (response.ok) {
      await loadItems();
    }
  }

  async function inspectRetrieval(query: string) {
    setIsInspecting(true);
    setDebugError(null);

    const response = await fetch("/api/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: string };
      setDebugError(errorData.error ?? "Failed to inspect retrieval.");
      setRetrievalMatches([]);
      setIsInspecting(false);
      return;
    }

    const data = (await response.json()) as { matches?: RetrievalMatch[] };
    setRetrievalMatches(data.matches ?? []);
    setIsInspecting(false);
  }

  const isStreaming = status === "streaming";
  const isThinking = status === "submitted";
  const isBusy = isStreaming || isThinking;

  return (
    <div className="app-root">
      <div className="bg-ambient" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="dot-grid" />
      </div>

      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">◆</div>
            <span className="logo-name">Gemini</span>
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

      <main className="app-main">
        <section
          className="corpus-section animate-in"
          style={{ "--anim-delay": "0ms" } as React.CSSProperties}
        >
          <div className="section-label">01 / library</div>

          <h1 className="corpus-heading">
            Multimodal<br />Library
          </h1>

          <p className="corpus-sub">
            Drop text, images, audio, video, or PDFs.{" "}
            <span className="hl">Gemini Embedding 2</span> vectorizes
            everything, then chat with the most relevant context.
          </p>

          <form
            onSubmit={handleIngest}
            className="ingest-card animate-in"
            style={{ "--anim-delay": "80ms" } as React.CSSProperties}
          >
            <div className="form-fields">
              <div className="form-field">
                <label className="field-label" htmlFor="note-text">
                  Notes
                </label>
                <textarea
                  id="note-text"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Paste notes, transcripts, or any text to embed..."
                  rows={3}
                  className="field-textarea"
                />
              </div>

              <div className="form-field">
                <label className="field-label">
                  Files{" "}
                  <span className="field-label-note">
                    - images, audio, video, PDF, text
                  </span>
                </label>
                <div
                  className={`drop-zone${isDragOver ? " is-drag-over" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Click or drag to add files"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") fileInputRef.current?.click();
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOver(false);
                    setSelectedFiles(event.dataTransfer.files);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(event) => setSelectedFiles(event.target.files)}
                    className="sr-only"
                  />
                  <div className="drop-zone-inner">
                    <span className="drop-icon">⊕</span>
                    {selectedFiles && selectedFiles.length > 0 ? (
                      <span className="drop-text">
                        {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected
                      </span>
                    ) : (
                      <span className="drop-text">Drop files here or click to browse</span>
                    )}
                    <span className="drop-hint">Max 10 MB per file</span>
                  </div>
                </div>
              </div>

              {uploadError && <p className="error-msg">Warning: {uploadError}</p>}

              <button type="submit" disabled={isUploading} className="embed-btn">
                <span className="embed-btn-inner">
                  {isUploading ? (
                    <>
                      <span className="embed-spinner" />
                      Embedding...
                    </>
                  ) : (
                    <>
                      <span>⊛</span>
                      Add to Library
                    </>
                  )}
                </span>
                <span className="embed-btn-shimmer" aria-hidden="true" />
              </button>
            </div>
          </form>

          <div
            className="animate-in"
            style={{ "--anim-delay": "160ms" } as React.CSSProperties}
          >
            <div className="library-list-header">
              <span className="library-list-title">Uploaded Library</span>
              <span>
                <span className="library-count-big">{sortedItems.length}</span>
                <span className="library-count-unit">vectors</span>
              </span>
            </div>

            <div className="library-entries">
              {sortedItems.length === 0 ? (
                <div className="library-empty">
                  <span className="library-empty-glyph">◇</span>
                  <span>No items yet. Upload something to begin.</span>
                </div>
              ) : (
                sortedItems.map((item) => (
                  <div key={item.id} className="library-entry">
                    <div className="library-entry-header">
                      <span className="library-kind-badge" data-kind={item.kind}>
                        {item.kind}
                      </span>
                      <span className="library-entry-time">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="library-delete"
                      >
                        remove
                      </button>
                    </div>

                    {item.kind === "text" ? (
                      <p className="library-entry-text">
                        {item.text}
                        {item.truncated ? "..." : ""}
                      </p>
                    ) : (
                      <div>
                        <span className="library-file-name">{item.originalName}</span>
                        <span className="library-file-meta">
                          {item.mimeType} · {formatBytes(item.size)}
                        </span>
                        {item.fileUrl && (
                          <a
                            href={item.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="library-file-extracted"
                          >
                            open file
                          </a>
                        )}
                        {item.text && (
                          <span className="library-file-extracted">
                            extracted text{item.truncated ? " · truncated" : ""}
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

        <section
          className="chat-section animate-in"
          style={{ "--anim-delay": "40ms" } as React.CSSProperties}
        >
          <div className="chat-panel">
            <div className="chat-header">
              <div>
                <div className="section-label">02 / chat</div>
                <h2 className="chat-heading">Chat with your uploads</h2>
              </div>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="clear-btn"
              >
                clear
              </button>
            </div>

            <div className="chat-messages chat-scroll">
              {messages.length === 0 ? (
                <div className="chat-empty-state">
                  <span className="chat-empty-glyph">◆</span>
                  <span className="chat-empty-title">Ask anything from your uploaded library.</span>
                  <span>The app will surface the most relevant context.</span>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`msg-row ${message.role}`}>
                    <div className={`msg-bubble ${message.role}`}>
                      {message.parts.map((part, index) =>
                        part.type === "text" ? <span key={index}>{part.text}</span> : null,
                      )}
                    </div>
                  </div>
                ))
              )}

              {isThinking && (
                <div className="msg-row assistant">
                  <div className="msg-bubble assistant thinking-indicator" aria-live="polite">
                    <span className="thinking-label">
                      thinking
                      <span className="thinking-ellipsis" aria-hidden="true" />
                    </span>
                    <span className="thinking-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                </div>
              )}

              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="msg-row assistant">
                  <div className="msg-bubble assistant typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!input.trim() || status !== "ready") return;
                if (showDebugPanel) {
                  void inspectRetrieval(input.trim());
                }
                sendMessage({ text: input.trim() });
                setInput("");
              }}
              className="chat-input-row"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about your uploads..."
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
