import type { Card, Column } from "@/lib/kanban";

type DayPlanViewProps = {
  column: Column;
  cards: Card[];
  onLock: (columnId: string) => void;
  onUnlock: (columnId: string) => void;
};

const TAG_COLORS: Record<string, string> = {
  Transport: "bg-blue-100 text-blue-700",
  Food: "bg-orange-100 text-orange-700",
  Activity: "bg-green-100 text-green-700",
  Lodging: "bg-purple-100 text-purple-700",
};

const STATUS_COLORS: Record<string, string> = {
  idea: "bg-yellow-100 text-yellow-800",
  researching: "bg-blue-100 text-blue-700",
  booked: "bg-green-100 text-green-700",
  maybe: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

const sortCardsByTime = (cards: Card[]) =>
  [...cards].sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"));

export const DayPlanView = ({ column, cards, onLock, onUnlock }: DayPlanViewProps) => {
  const locked = column.locked ?? false;
  const isDayColumn = column.id.startsWith("col-day-");
  const sortedCards = sortCardsByTime(cards);
  const bookedCount = sortedCards.filter((card) => card.status === "booked").length;
  const researchingCount = sortedCards.filter((card) => card.status === "researching").length;
  const foodCount = sortedCards.filter((card) => card.ai_tag === "Food").length;
  const isPackedDay = sortedCards.length >= 5;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow)] backdrop-blur">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            {column.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-text)]">
            {sortedCards.length === 0
              ? isDayColumn ? "No activities planned yet." : "No unscheduled ideas yet."
              : `${sortedCards.length} item${sortedCards.length === 1 ? "" : "s"} · ${bookedCount} booked`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-700">
              {bookedCount} booked
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
              {researchingCount} researching
            </span>
            {isDayColumn && foodCount === 0 && sortedCards.length > 0 ? (
              <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-yellow-800">
                No meal yet
              </span>
            ) : null}
            {isDayColumn && isPackedDay ? (
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
                Packed day
              </span>
            ) : null}
            {locked ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-green-800">
                Finalized
              </span>
            ) : null}
          </div>
        </div>
        {isDayColumn && sortedCards.length > 0 && (
          locked ? (
            <button
              type="button"
              onClick={() => onUnlock(column.id)}
              className="inline-flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-green-700 transition hover:bg-green-100"
            >
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Locked
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onLock(column.id)}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
            >
              Finalize Day
            </button>
          )
        )}
      </div>

      {sortedCards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--stroke)] bg-white/70 px-8 py-14 text-center shadow-[var(--shadow)]">
          <p className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            {isDayColumn ? "Build this day from the basics" : "Use this as the idea inbox"}
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--gray-text)]">
            {isDayColumn
              ? "Add breakfast, travel time, one main activity, lunch, downtime, and dinner. Drag ideas here from Unscheduled when they fit."
              : "Paste links or quick thoughts into Quick-Add, then drag the strongest ideas into a day when the plan starts taking shape."}
          </p>
        </div>
      ) : (
        <ol className="relative flex flex-col gap-4 before:absolute before:left-5 before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-[var(--stroke)] sm:before:left-24">
          {sortedCards.map((card, index) => {
            const tagColor = card.ai_tag ? (TAG_COLORS[card.ai_tag] ?? "bg-gray-100 text-gray-600") : null;
            const statusColor = card.status ? (STATUS_COLORS[card.status] ?? "bg-gray-100 text-gray-700") : null;
            const timeLabel = card.start_time && card.end_time
              ? `${card.start_time}-${card.end_time}`
              : card.start_time ?? "Any time";
            return (
              <li
                key={card.id}
                className="relative grid gap-3 sm:grid-cols-[7rem_1fr]"
              >
                <div className="flex items-start gap-3 sm:justify-end">
                  <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-4 border-white bg-[var(--accent-yellow)] text-xs font-bold text-white shadow-sm sm:order-2">
                    {index + 1}
                  </div>
                  <p className="pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)] sm:order-1 sm:text-right">
                    {timeLabel}
                  </p>
                </div>
                <div className="min-w-0 rounded-2xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                      {card.ai_title || card.title}
                    </h3>
                    {card.status && statusColor && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
                        {card.status}
                      </span>
                    )}
                    {card.ai_tag && tagColor && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tagColor}`}>
                        {card.ai_tag}
                      </span>
                    )}
                  </div>
                  {(card.start_time || card.end_time || card.location) && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
                      {[
                        card.location,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="mt-1 text-sm leading-6 text-[var(--gray-text)]">
                    {card.ai_summary || card.details}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {card.content_url && (
                      <a
                        href={card.content_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--primary-blue)] hover:underline"
                      >
                        View link
                      </a>
                    )}
                    {card.suggested_by && (
                      <span className="text-xs text-[var(--gray-text)]">
                        by {card.suggested_by}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {isDayColumn && sortedCards.length > 0 && !locked && bookedCount < sortedCards.length && (
        <p className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-center text-xs font-semibold text-yellow-800">
          Some items are not booked yet. Finalize when this day is ready to share.
        </p>
      )}

      {isDayColumn && locked && (
        <p className="mt-6 text-center text-xs text-[var(--gray-text)]">
          This day is finalized. Click <span className="font-semibold">Locked</span> to reopen for editing.
        </p>
      )}
    </div>
  );
};
