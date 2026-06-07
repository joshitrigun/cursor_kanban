"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar, type ChatMessage } from "@/components/ChatSidebar";
import type { BoardData } from "@/lib/kanban";

type SessionResponse = {
  authenticated: boolean;
  username: string | null;
  displayName: string | null;
  message?: string;
};

type BoardResponse = {
  board: BoardData;
  boardVersion: number;
  schemaVersion: number;
};

type AIChatResponse = {
  assistantMessage: string;
  boardUpdated: boolean;
  board: BoardData;
  boardVersion: number;
  schemaVersion: number;
};

type ChatHistoryResponse = {
  messages: ChatMessage[];
};

const unauthenticatedSession: SessionResponse = {
  authenticated: false,
  username: null,
  displayName: null,
};

const BOARD_SAVE_DEBOUNCE_MS = 300;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const AppShell = () => {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [boardErrorMessage, setBoardErrorMessage] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const saveQueueRef = useRef(Promise.resolve());
  const pendingBoardRef = useRef<BoardData | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceResolveRef = useRef<(() => void) | null>(null);

  const resetChatState = () => {
    setChatMessages([]);
    setAiErrorMessage(null);
    setIsAiLoading(false);
  };

  const fetchBoard = async () => {
    setIsBoardLoading(true);
    setBoardErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/board`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Unable to load board.");
      }

      const nextBoard = (await response.json()) as BoardResponse;
      setBoard(nextBoard.board);
    } catch {
      setBoard(null);
      setBoardErrorMessage("Unable to load the board. Try again.");
    } finally {
      setIsBoardLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    setAiErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/chat-history`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Unable to load chat history.");
      }

      const history = (await response.json()) as ChatHistoryResponse;
      setChatMessages(history.messages);
    } catch {
      setChatMessages([]);
      setAiErrorMessage("Unable to load chat history. Try again.");
    }
  };

  const sendChatMessage = async (text: string) => {
    await saveQueueRef.current.catch(() => undefined);

    const optimisticMessage = { role: "user" as const, content: text };
    setChatMessages((prev) => [...prev, optimisticMessage]);
    setIsAiLoading(true);
    setAiErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error("AI request failed.");
      }

      const data = (await response.json()) as AIChatResponse;
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.assistantMessage },
      ]);
      if (data.boardUpdated) {
        setBoard(data.board);
      }
    } catch {
      setChatMessages((prev) => {
        for (let index = prev.length - 1; index >= 0; index -= 1) {
          const message = prev[index];
          if (
            message.role === optimisticMessage.role &&
            message.content === optimisticMessage.content
          ) {
            return [...prev.slice(0, index), ...prev.slice(index + 1)];
          }
        }

        return prev;
      });
      setAiErrorMessage("Unable to reach the AI. Try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const flushPendingBoard = async () => {
    const nextBoard = pendingBoardRef.current;
    pendingBoardRef.current = null;

    if (!nextBoard) {
      return;
    }

    setIsSavingBoard(true);

    try {
      const response = await fetch(`${API_BASE}/api/board`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ board: nextBoard }),
      });

      if (!response.ok) {
        throw new Error("Unable to save board.");
      }

      const persistedBoard = (await response.json()) as BoardResponse;
      setBoard(persistedBoard.board);
    } catch {
      setBoardErrorMessage("Unable to save board. Reload to retry.");
    } finally {
      setIsSavingBoard(false);
    }
  };

  const scheduleBoardSave = () => {
    if (!debounceResolveRef.current) {
      const debouncePromise = new Promise<void>((resolve) => {
        debounceResolveRef.current = resolve;
      });

      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await debouncePromise;
          await flushPendingBoard();
        });
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const resolve = debounceResolveRef.current;
      debounceResolveRef.current = null;
      resolve?.();
    }, BOARD_SAVE_DEBOUNCE_MS);

    return saveQueueRef.current;
  };

  const persistBoard = async (nextBoard: BoardData) => {
    setBoard(nextBoard);
    pendingBoardRef.current = nextBoard;
    setBoardErrorMessage(null);

    scheduleBoardSave();

    await saveQueueRef.current;
  };

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/session`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Unable to load session.");
        }

        const nextSession = (await response.json()) as SessionResponse;
        if (!cancelled) {
          setSession(nextSession);
          if (!nextSession.authenticated) {
            setBoard(null);
            resetChatState();
          }
        }
      } catch {
        if (!cancelled) {
          setSession(unauthenticatedSession);
          setBoard(null);
          resetChatState();
          setErrorMessage("Unable to reach the server. Try again.");
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    void fetchBoard();
    void fetchChatHistory();
  }, [session?.authenticated]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const nextSession = (await response.json()) as SessionResponse;
      if (!response.ok) {
        setSession(unauthenticatedSession);
        setErrorMessage(nextSession.message ?? "Login failed.");
        return;
      }

      setSession(nextSession);
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setSession(unauthenticatedSession);
      setBoard(null);
      resetChatState();
      setIsSubmitting(false);
    }
  };

  const handleQuickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = quickAddText.trim();
    if (!text) return;

    setIsQuickAdding(true);
    const isUrl = text.startsWith("http://") || text.startsWith("https://");
    try {
      const response = await fetch(`${API_BASE}/api/cards/quick-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(isUrl ? { url: text } : { text }),
      });
      if (response.ok) {
        const data = (await response.json()) as BoardResponse;
        setBoard(data.board);
        setQuickAddText("");
      }
    } finally {
      setIsQuickAdding(false);
    }
  };

  if (session === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-16">
        <div className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/90 p-10 text-center shadow-[var(--shadow)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Loading session
          </p>
          <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
        </div>
      </main>
    );
  }

  if (session.authenticated) {
    if (isBoardLoading || board === null) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-16">
          <div className="w-full max-w-lg rounded-[32px] border border-[var(--stroke)] bg-white/90 p-10 text-center shadow-[var(--shadow)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
              Loading board
            </p>
            <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            {boardErrorMessage ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {boardErrorMessage}
              </p>
            ) : null}
          </div>
        </main>
      );
    }

    return (
      <div className="flex min-h-screen flex-col xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col xl:min-h-screen">
          <div className="border-b border-[var(--stroke)] bg-white px-6 py-3">
            <form onSubmit={handleQuickAdd} className="flex gap-3">
              <input
                type="text"
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                placeholder="Paste a link or type an idea to add to Ideas..."
                className="flex-1 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                disabled={isQuickAdding}
              />
              <button
                type="submit"
                disabled={!quickAddText.trim() || isQuickAdding}
                className="rounded-full bg-[var(--secondary-purple)] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isQuickAdding ? "Adding..." : "Add"}
              </button>
            </form>
          </div>
          <div className="flex-1">
            <KanbanBoard
              board={board}
              onBoardChange={persistBoard}
              username={session.displayName ?? session.username ?? undefined}
              onLogout={handleLogout}
              statusMessage={isSavingBoard ? "Saving board" : undefined}
              errorMessage={boardErrorMessage}
            />
          </div>
        </div>
        <ChatSidebar
          messages={chatMessages}
          onSendMessage={sendChatMessage}
          isLoading={isAiLoading}
          errorMessage={aiErrorMessage}
        />
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface)] px-6 py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,_rgba(32,157,215,0.24),_transparent_60%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_transparent_70%)]" />

      <section className="relative grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[var(--stroke)] bg-white/80 p-10 shadow-[var(--shadow)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Family Vacation Planner
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold text-[var(--navy-dark)]">
            Trip Board
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--gray-text)]">
            Sign in to open your family trip board. Each family member has their
            own account. Ask your trip organizer for credentials.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Shared board
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--navy-dark)]">Family trip planning</p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Session
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">Backend managed</p>
            </div>
          </div>
        </div>

        <form
          className="rounded-[32px] border border-[var(--stroke)] bg-[var(--surface-strong)] p-8 shadow-[var(--shadow)]"
          onSubmit={handleSubmit}
          data-testid="login-form"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            Sign in
          </p>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="username"
                name="username"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="current-password"
                name="password"
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
};