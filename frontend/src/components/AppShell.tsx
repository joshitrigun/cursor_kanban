"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { ChatMessage } from "@/components/ChatSidebar";
import { diffBoards, type BoardData } from "@/lib/kanban";

const ChatSidebar = dynamic(
  () => import("@/components/ChatSidebar").then((m) => ({ default: m.ChatSidebar })),
  { ssr: false },
);

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

type TripResponse = {
  name: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
};

type AIChatResponse = {
  assistantMessage: string;
  summaryOnly: boolean;
  proposedBoard: BoardData | null;
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

const markPerformance = (name: string) => {
  if (typeof performance === "undefined" || !performance.mark) {
    return;
  }
  performance.mark(name);
};

const measurePerformance = (name: string, startMark: string, endMark: string) => {
  if (typeof performance === "undefined" || !performance.measure) {
    return;
  }

  try {
    performance.measure(name, startMark, endMark);
  } catch {
    return;
  }
};

export const AppShell = () => {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [boardVersion, setBoardVersion] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [boardErrorMessage, setBoardErrorMessage] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [pendingProposal, setPendingProposal] = useState<BoardData | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const saveQueueRef = useRef(Promise.resolve());
  const pendingBoardRef = useRef<BoardData | null>(null);
  const boardVersionRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceResolveRef = useRef<(() => void) | null>(null);
  const appLoadStartMarkRef = useRef(`app-load-start-${Date.now()}`);
  const loginStartMarkRef = useRef<string | null>(null);
  const quickAddStartMarkRef = useRef<string | null>(null);
  const boardVisibleMeasuredRef = useRef(false);

  const resetChatState = () => {
    setChatMessages([]);
    setAiErrorMessage(null);
    setIsAiLoading(false);
    setPendingProposal(null);
  };

  const applyPersistedBoard = (payload: BoardResponse) => {
    setBoard(payload.board);
    setBoardVersion(payload.boardVersion);
    boardVersionRef.current = payload.boardVersion;
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
      applyPersistedBoard(nextBoard);
    } catch {
      setBoard(null);
      setBoardVersion(null);
      boardVersionRef.current = null;
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

  const fetchTrip = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trip`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Unable to load trip.");
      }

      setTrip((await response.json()) as TripResponse);
    } catch {
      setTrip(null);
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
        { role: "assistant", content: data.assistantMessage, summaryOnly: data.summaryOnly },
      ]);
      applyPersistedBoard(data);
      if (data.proposedBoard) {
        setPendingProposal(data.proposedBoard);
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
    const expectedBoardVersion = boardVersionRef.current;
    pendingBoardRef.current = null;

    if (!nextBoard || expectedBoardVersion === null) {
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
        body: JSON.stringify({
          board: nextBoard,
          expectedBoardVersion,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save board.");
      }

      const persistedBoard = (await response.json()) as BoardResponse;
      applyPersistedBoard(persistedBoard);
    } catch {
      await fetchBoard();
      setBoardErrorMessage("Unable to save board. The latest board was reloaded.");
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
    markPerformance(appLoadStartMarkRef.current);

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
            setBoardVersion(null);
            boardVersionRef.current = null;
            resetChatState();
          }
        }
      } catch {
        if (!cancelled) {
          setSession(unauthenticatedSession);
          setBoard(null);
          setBoardVersion(null);
          boardVersionRef.current = null;
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

    void Promise.all([fetchBoard(), fetchChatHistory(), fetchTrip()]);
  }, [session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || board === null || boardVisibleMeasuredRef.current) {
      return;
    }

    boardVisibleMeasuredRef.current = true;
    markPerformance("board-visible");
    measurePerformance("app-load-to-board-visible", appLoadStartMarkRef.current, "board-visible");
    if (loginStartMarkRef.current) {
      measurePerformance("login-to-board-visible", loginStartMarkRef.current, "board-visible");
      loginStartMarkRef.current = null;
    }
  }, [board, session?.authenticated]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const toggleChat = useCallback(() => setIsChatOpen((v) => !v), []);

  const applyProposal = useCallback(async () => {
    if (!pendingProposal || boardVersionRef.current === null) return;
    const proposalToApply = pendingProposal;
    setPendingProposal(null);
    setIsSavingBoard(true);
    try {
      const response = await fetch(`${API_BASE}/api/board`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          board: proposalToApply,
          expectedBoardVersion: boardVersionRef.current,
        }),
      });
      if (!response.ok) throw new Error();
      const persisted = (await response.json()) as BoardResponse;
      applyPersistedBoard(persisted);
    } catch {
      setBoardErrorMessage("Unable to apply AI changes. Try again.");
    } finally {
      setIsSavingBoard(false);
    }
  }, [pendingProposal]);

  const rejectProposal = useCallback(() => setPendingProposal(null), []);

  const pendingProposalDiff = useMemo(() => {
    if (!pendingProposal || !board) return null;
    return diffBoards(board, pendingProposal);
  }, [pendingProposal, board]);

  const latestActivity = useMemo(() => {
    const last = chatMessages[chatMessages.length - 1];
    return last ? last.content : null;
  }, [chatMessages]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleChat();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [toggleChat]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    loginStartMarkRef.current = `login-start-${Date.now()}`;
    markPerformance(loginStartMarkRef.current);

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
      setBoardVersion(null);
      boardVersionRef.current = null;
      resetChatState();
      setIsSubmitting(false);
    }
  };

  const handleQuickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = quickAddText.trim();
    if (!text) return;

    setIsQuickAdding(true);
    quickAddStartMarkRef.current = `quick-add-start-${Date.now()}`;
    markPerformance(quickAddStartMarkRef.current);
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
        applyPersistedBoard(data);
        setQuickAddText("");
        markPerformance("quick-add-card-visible");
        measurePerformance("quick-add-to-card-visible", quickAddStartMarkRef.current, "quick-add-card-visible");
      }
    } finally {
      quickAddStartMarkRef.current = null;
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
      <div className="flex min-h-screen flex-col">
        <div className="border-b border-[var(--stroke)] bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <form onSubmit={handleQuickAdd} className="flex flex-1 gap-2">
              <input
                type="text"
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                placeholder="Paste a link or idea..."
                className="flex-1 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                disabled={isQuickAdding}
              />
              <button
                type="submit"
                disabled={!quickAddText.trim() || isQuickAdding}
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isQuickAdding ? "Adding..." : "Add"}
              </button>
            </form>
            <button
              onClick={toggleChat}
              title="Toggle AI Chat (⌘K)"
              className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition sm:justify-start ${
                isChatOpen
                  ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                  : "border-[var(--stroke)] bg-white text-[var(--navy-dark)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 10.5a1.5 1.5 0 0 1-1.5 1.5H4L1 15V2.5A1.5 1.5 0 0 1 2.5 1h10A1.5 1.5 0 0 1 14 2.5v8Z" />
              </svg>
              AI
            </button>
          </div>
        </div>
        <div className="flex-1">
          <KanbanBoard
            board={board}
            onBoardChange={persistBoard}
            username={session.displayName ?? session.username ?? undefined}
            onLogout={handleLogout}
            statusMessage={isSavingBoard ? "Saving board" : undefined}
            errorMessage={boardErrorMessage}
            tripStartDate={trip?.startDate}
            latestActivity={latestActivity}
          />
        </div>
        <ChatSidebar
          messages={chatMessages}
          onSendMessage={sendChatMessage}
          isLoading={isAiLoading}
          errorMessage={aiErrorMessage}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          pendingProposalDiff={pendingProposalDiff}
          onApplyProposal={applyProposal}
          onRejectProposal={rejectProposal}
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