import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const isUnscheduled = column.id === "col-unscheduled";
  const locked = column.locked ?? false;
  const columnTitle = isUnscheduled && column.title === "Unscheduled" ? "Ideas Inbox" : column.title;

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isUnscheduled && "border-yellow-200 bg-yellow-50/70",
        locked && "border-green-200 bg-green-50/60",
        isOver && !locked && "ring-2 ring-[var(--accent-yellow)]",
        isOver && locked && "ring-2 ring-green-300"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "h-2 w-10 rounded-full",
                locked ? "bg-green-500" : isUnscheduled ? "bg-[var(--accent-yellow)]" : "bg-[var(--primary-blue)]"
              )}
            />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {locked ? "Finalized" : isUnscheduled ? "Inbox" : `${cards.length} cards`}
            </span>
          </div>
          <input
            value={columnTitle}
            onChange={(event) => onRename(column.id, event.target.value)}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
          />
          {isUnscheduled ? (
            <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">
              Drop family links, restaurants, and raw ideas here before assigning them to a trip day.
            </p>
          ) : locked ? (
            <p className="mt-1 text-xs leading-5 text-green-700">
              This day is finalized. Unlock it from the day tab before editing.
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {isUnscheduled ? "Add ideas here" : "Drop a card here"}
          </div>
        )}
      </div>
      {!locked && (
        <NewCardForm
          onAdd={(title, details) => onAddCard(column.id, title, details)}
        />
      )}
    </section>
  );
};
