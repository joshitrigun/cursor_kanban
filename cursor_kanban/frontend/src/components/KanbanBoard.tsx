"use client";

import { useMemo, useState } from "react";
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
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  board?: BoardData;
  onBoardChange?: (board: BoardData) => void | Promise<void>;
  username?: string;
  onLogout?: () => Promise<void> | void;
  statusMessage?: string;
  errorMessage?: string | null;
};

export const KanbanBoard = ({
  board,
  onBoardChange,
  username,
  onLogout,
  statusMessage,
  errorMessage,
}: KanbanBoardProps) => {
  const [internalBoard, setInternalBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const resolvedBoard = board ?? internalBoard;

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
        [id]: { id, title, details: details || "No details yet.", status: "idea" },
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

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6">
        <header className="flex flex-col gap-5 rounded-[28px] border border-[var(--stroke)] bg-white/85 p-5 shadow-[var(--shadow)] backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Family Vacation Planner
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)] sm:text-4xl">
                Trip Board
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
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
                {column.title}
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
                    cards={column.cardIds.map((cardId) => resolvedBoard.cards[cardId])}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
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
              />
            );
          })()
        )}
      </main>
    </div>
  );
};
