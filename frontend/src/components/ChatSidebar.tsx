"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatSidebarProps = {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  errorMessage: string | null;
};

export const ChatSidebar = ({
  messages,
  onSendMessage,
  isLoading,
  errorMessage,
}: ChatSidebarProps) => {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isLoading) return;
    setDraft("");
    await onSendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <aside className="flex w-full min-w-0 flex-col border-t border-[var(--stroke)] bg-white/90 backdrop-blur xl:sticky xl:top-0 xl:h-screen xl:w-[340px] xl:min-w-[240px] xl:border-l xl:border-t-0">
      <div className="border-b border-[var(--stroke)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          AI Assistant
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-[var(--navy-dark)]">
          Chat
        </h2>
      </div>

      <div className="max-h-[420px] flex-1 space-y-3 overflow-y-auto p-4 xl:max-h-none">
        {messages.length === 0 && !isLoading && (
          <p className="py-6 text-center text-xs text-[var(--gray-text)]">
            Ask the assistant to create, move, or rename cards and columns.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                msg.role === "user"
                  ? "bg-[var(--primary-blue)] text-white"
                  : "border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--gray-text)]">
              Thinking...
            </div>
          </div>
        )}
        {errorMessage && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {errorMessage}
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => void handleSubmit(e)}
        className="border-t border-[var(--stroke)] p-4"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the assistant..."
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          rows={2}
          disabled={isLoading}
          data-testid="chat-input"
          aria-label="Chat message"
        />
        <button
          type="submit"
          disabled={isLoading || !draft.trim()}
          className="mt-2 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "Thinking..." : "Send"}
        </button>
      </form>
    </aside>
  );
};
