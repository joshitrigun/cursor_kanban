import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
};

const STATUS_STYLES: Record<string, string> = {
  idea: "bg-yellow-100 text-yellow-800",
  researching: "bg-blue-100 text-blue-700",
  shortlisted: "bg-orange-100 text-orange-700",
  booked: "bg-green-100 text-green-700",
  confirmed: "bg-emerald-100 text-emerald-800",
  skipped: "bg-gray-100 text-gray-700",
};

const formatStatus = (status: string) =>
  status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const TAG_STYLES: Record<string, string> = {
  Transport: "bg-sky-100 text-sky-700",
  Food: "bg-orange-100 text-orange-700",
  Activity: "bg-green-100 text-green-700",
  Lodging: "bg-violet-100 text-violet-700",
  Event: "bg-red-100 text-red-700",
  "World Cup": "bg-red-100 text-red-700",
};

export const KanbanCard = ({ card, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            {card.status && (
              <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_STYLES[card.status] ?? "bg-gray-100 text-gray-700")}>
                {formatStatus(card.status)}
              </span>
            )}
            {card.ai_tag && (
              <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TAG_STYLES[card.ai_tag] ?? "bg-slate-100 text-slate-700")}>
                {card.ai_tag}
              </span>
            )}
          </div>
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.ai_title || card.title}
          </h4>
          {(card.start_time || card.location) && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
              {[card.start_time, card.location].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.ai_summary || card.details}
          </p>
          {card.content_url && (
            <a
              href={card.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-xs text-[var(--primary-blue)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View link
            </a>
          )}
          {card.suggested_by && (
            <p className="mt-2 text-xs text-[var(--gray-text)]">by {card.suggested_by}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
};
