"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { DayPlanView } from "@/components/DayPlanView";
import { computeReadiness, createId, initialData, moveCard, normalizeCardStatus, type BoardData, type Card } from "@/lib/kanban";

type KanbanBoardProps = {
  board?: BoardData;
  onBoardChange?: (board: BoardData) => void | Promise<void>;
  username?: string;
  onLogout?: () => Promise<void> | void;
  statusMessage?: string;
  errorMessage?: string | null;
  tripStartDate?: string | null;
  latestActivity?: string | null;
};

const isCardBooked = (card: Card) => normalizeCardStatus(card.status) === "booked" || normalizeCardStatus(card.status) === "confirmed";

export const KanbanBoard = ({
  board,
  onBoardChange,
  username,
  onLogout,
  statusMessage,
  errorMessage,
  tripStartDate,
  latestActivity,
}: KanbanBoardProps) => {
  const [internalBoard, setInternalBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("col-day-1");
  const resolvedBoard = board ?? internalBoard;
  const hasAppliedDefaultDayRef = useRef(false);

  useEffect(() => {
    if (hasAppliedDefaultDayRef.current || !tripStartDate) {
      return;
    }

    const dayColumns = resolvedBoard.columns.filter((column) => column.id.startsWith("col-day-"));
    if (dayColumns.length === 0) {
      return;
    }

    const [startYear, startMonth, startDay] = tripStartDate.split("-").map(Number);
    const today = new Date();
    const startMidnight = new Date(startYear, startMonth - 1, startDay);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayOffset = Math.round((todayMidnight.getTime() - startMidnight.getTime()) / 86_400_000);
    const clampedIndex = Math.min(Math.max(dayOffset, 0), dayColumns.length - 1);

    hasAppliedDefaultDayRef.current = true;
    setActiveTab(dayColumns[clampedIndex].id);
  }, [tripStartDate, resolvedBoard.columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => resolvedBoard.cards, [resolvedBoard.cards]);
  const totalCards = resolvedBoard.columns.reduce(
    (total, column) => total + column.cardIds.length,
    0
  );
  const finalizedDays = resolvedBoard.columns.filter((column) => column.locked).length;
  const dayCount = resolvedBoard.columns.filter((column) =>
    column.id.startsWith("col-day-")
  ).length;
  const allCards = Object.values(resolvedBoard.cards);
  const {
    items: readinessItems,
    coveredCount: readinessCount,
    nextActions,
    tripTotal,
    bookedTotal,
    decisionsNeeded,
    bookingsMissing,
  } = useMemo(
    () => computeReadiness(allCards),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedBoard.cards],
  );

  const commitBoard = (updater: (currentBoard: BoardData) => BoardData) => {
    const nextBoard = updater(resolvedBoard);

    if (onBoardChange) {
      void onBoardChange(nextBoard);
      return;
    }

    setInternalBoard(nextBoard);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeColumn = resolvedBoard.columns.find((column) =>
      column.cardIds.includes(active.id as string)
    );
    const overColumn = resolvedBoard.columns.find((column) =>
      column.id === over.id || column.cardIds.includes(over.id as string)
    );

    if (activeColumn?.locked || overColumn?.locked) {
      return;
    }

    commitBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    commitBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    commitBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet.", type: "activity", status: "idea" },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    commitBoard((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));
  };

  const handleUpdateCard = (cardId: string, patch: Partial<Card>) => {
    commitBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          ...patch,
        },
      },
    }));
  };

  const handleLockColumn = (columnId: string) => {
    commitBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId ? { ...col, locked: true } : col
      ),
    }));
  };

  const handleUnlockColumn = (columnId: string) => {
    commitBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === columnId ? { ...col, locked: false } : col
      ),
    }));
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const getColumnTitle = (column: BoardData["columns"][number]) =>
    column.id === "col-unscheduled" && column.title === "Unscheduled" ? "Ideas Inbox" : column.title;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(135deg,_rgba(31,111,84,0.22),_rgba(17,126,162,0.16)_45%,_rgba(244,251,255,0)_80%)]" />
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-2/3 bg-[linear-gradient(160deg,_transparent_0%,_rgba(255,255,255,0.35)_35%,_transparent_36%,_transparent_48%,_rgba(255,255,255,0.24)_49%,_transparent_50%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
        <header className="flex flex-col gap-5 rounded-[28px] border border-[var(--stroke)] bg-white/85 p-5 shadow-[var(--shadow)] backdrop-blur sm:p-6">
          {/* Compact mobile-only header */}
          <div className="flex items-center justify-between sm:hidden">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--forest-green)]">Vancouver / Whistler</p>
              <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Trip Plan</h1>
            </div>
            <div className="flex items-center gap-2">
              {username ? <span className="text-xs font-semibold text-[var(--gray-text)]">{username}</span> : null}
              {onLogout ? (
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
                >
                  Log out
                </button>
              ) : null}
            </div>
          </div>
          {/* Full desktop header */}
          <div className="hidden sm:flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--forest-green)]">
                Vancouver / Whistler Family Vacation
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)] sm:text-4xl">
                Pacific Northwest Trip Plan
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pacific-teal)]">
                  Mountains + ocean
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--forest-green)]">
                  World Cup optional
                </span>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--navy-dark)]">
                  {dayCount} days
                </span>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--navy-dark)]">
                  {totalCards} cards
                </span>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-green-700">
                  {finalizedDays} finalized
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                Plan days, then finalize each one.
              </p>
              {username ? (
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Signed in as {username}
                </p>
              ) : null}
              {onLogout ? (
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="mt-4 inline-flex items-center rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
                >
                  Log out
                </button>
              ) : null}
              {statusMessage ? (
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary-blue)]">
                  {statusMessage}
                </p>
              ) : null}
              {errorMessage ? (
                <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          </div>
          <section className="rounded-3xl border border-[var(--stroke)] bg-white/70 p-4" data-testid="readiness-section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gray-text)]">
                  Trip Readiness
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
                  {readinessCount} of {readinessItems.length} essentials covered
                </h2>
              </div>
              <span className="rounded-full bg-[var(--snow)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--forest-green)]">
                Confidence check
              </span>
              {tripTotal > 0 && (
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--navy-dark)]">
                  Est. ${tripTotal.toLocaleString()} total
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold" data-testid="pitch-overview">
              <span className="text-[var(--navy-dark)]">{dayCount} days planned</span>
              <span className="text-yellow-700">{decisionsNeeded} decisions needed</span>
              <span className="text-red-700">{bookingsMissing} bookings missing</span>
              {latestActivity && (
                <span className="truncate text-[var(--gray-text)]" data-testid="latest-activity">
                  Latest: {latestActivity}
                </span>
              )}
            </div>
            {/* Readiness grid — desktop only */}
            <div className="hidden sm:grid mt-4 gap-2 sm:grid-cols-4">
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${
                    item.ready
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-yellow-200 bg-yellow-50 text-yellow-800"
                  }`}
                >
                  <span className="block text-[10px] uppercase tracking-[0.16em] opacity-70">
                    {item.ready ? "Covered" : "Needs plan"}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
            {tripTotal > 0 && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold" data-testid="cost-breakdown">
                <span className="text-green-700">${bookedTotal.toLocaleString()} booked</span>
                <span className="text-yellow-700">${(tripTotal - bookedTotal).toLocaleString()} unbooked</span>
              </div>
            )}
            {/* Next actions — desktop only */}
            {nextActions.length > 0 && (
              <div className="hidden sm:block mt-4 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Top next actions
                </p>
                <ol className="mt-2 flex flex-col gap-1">
                  {nextActions.map((action, i) => (
                    <li key={action} className="flex items-center gap-2 text-sm font-semibold text-[var(--navy-dark)]">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-yellow)] text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      {action}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
          <div className="sticky top-3 z-20 -mx-2 flex gap-2 overflow-x-auto rounded-2xl border border-[var(--stroke)] bg-white/90 p-2 shadow-[0_10px_30px_rgba(3,33,71,0.08)] backdrop-blur">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                activeTab === "all"
                  ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                  : "border-[var(--stroke)] text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
              }`}
            >
              All Days
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px]">
                {totalCards}
              </span>
            </button>
            {resolvedBoard.columns.map((column) => (
              <button
                key={column.id}
                type="button"
                onClick={() => setActiveTab(column.id)}
                className={`inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  activeTab === column.id
                    ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                    : "border-[var(--stroke)] text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
                }`}
              >
                {column.locked && (
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                )}
                {getColumnTitle(column)}
                <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px]">
                  {column.cardIds.length}
                </span>
              </button>
            ))}
          </div>
        </header>

        {activeTab === "all" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="flex gap-6 overflow-x-auto pb-4">
              {resolvedBoard.columns.map((column) => (
                <div key={column.id} className="w-[300px] flex-shrink-0">
                  <KanbanColumn
                    column={column}
                    cards={column.cardIds.map((cardId) => resolvedBoard.cards[cardId]).filter(Boolean)}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onUpdateCard={handleUpdateCard}
                    onDeleteCard={handleDeleteCard}
                  />
                </div>
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          (() => {
            const col = resolvedBoard.columns.find((c) => c.id === activeTab);
            if (!col) return null;
            return (
              <DayPlanView
                column={col}
                cards={col.cardIds.map((id) => resolvedBoard.cards[id]).filter(Boolean)}
                onLock={handleLockColumn}
                onUnlock={handleUnlockColumn}
                onUpdateCard={handleUpdateCard}
                username={username}
              />
            );
          })()
        )}
      </main>
    </div>
  );
};
