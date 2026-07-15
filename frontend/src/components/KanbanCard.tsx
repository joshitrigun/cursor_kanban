import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  TRAVEL_CARD_STATUSES,
  formatCardStatus,
  formatCardType,
  normalizeCardStatus,
  normalizeCardType,
  type Card,
  type TravelCardStatus,
} from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onUpdateCard: (cardId: string, patch: Partial<Card>) => void;
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

const TYPE_STYLES: Record<string, string> = {
  transport: "bg-sky-100 text-sky-700",
  food: "bg-orange-100 text-orange-700",
  activity: "bg-green-100 text-green-700",
  lodging: "bg-violet-100 text-violet-700",
  reservation: "bg-red-100 text-red-700",
  reminder: "bg-slate-100 text-slate-700",
  backup: "bg-amber-100 text-amber-700",
};

export const KanbanCard = ({ card, onUpdateCard, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const cardType = normalizeCardType(card);
  const cardStatus = normalizeCardStatus(card.status);

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
            <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_STYLES[cardStatus])}>
              {formatCardStatus(cardStatus)}
            </span>
            <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TYPE_STYLES[cardType] ?? "bg-slate-100 text-slate-700")}>
              {formatCardType(cardType)}
            </span>
          </div>
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.ai_title || card.title}
          </h4>
          {(card.start_time || card.location) && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
              {[card.start_time, card.location].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--gray-text)]">
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
          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
            Status
            <select
              value={cardStatus}
              onChange={(event) => onUpdateCard(card.id, { status: event.target.value as TravelCardStatus })}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              aria-label={`Status for ${card.title}`}
            >
              {TRAVEL_CARD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatCardStatus(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
            Est. cost
            <div className="mt-1 flex items-center rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5">
              <span className="mr-1 text-xs text-[var(--gray-text)]">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={card.estimated_cost ?? ""}
                onChange={(event) => {
                  const val = event.target.value === "" ? undefined : Number(event.target.value);
                  onUpdateCard(card.id, { estimated_cost: val });
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full bg-transparent text-xs font-semibold text-[var(--navy-dark)] outline-none"
                placeholder="0"
                aria-label={`Estimated cost for ${card.title}`}
              />
            </div>
          </label>
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
