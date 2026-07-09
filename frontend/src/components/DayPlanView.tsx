import { formatCardStatus, formatCardType, getVoteSummary, normalizeCardStatus, normalizeCardType, type Card, type Column } from "@/lib/kanban";

type DayPlanViewProps = {
  column: Column;
  cards: Card[];
  onLock: (columnId: string) => void;
  onUnlock: (columnId: string) => void;
  onUpdateCard?: (cardId: string, patch: Partial<Card>) => void;
  username?: string;
};

const TYPE_COLORS: Record<string, string> = {
  transport: "bg-blue-100 text-blue-700",
  food: "bg-orange-100 text-orange-700",
  activity: "bg-green-100 text-green-700",
  lodging: "bg-purple-100 text-purple-700",
  reservation: "bg-red-100 text-red-700",
  reminder: "bg-slate-100 text-slate-700",
  backup: "bg-amber-100 text-amber-700",
};

const STATUS_COLORS: Record<string, string> = {
  idea: "bg-yellow-100 text-yellow-800",
  researching: "bg-blue-100 text-blue-700",
  shortlisted: "bg-orange-100 text-orange-700",
  booked: "bg-green-100 text-green-700",
  confirmed: "bg-emerald-100 text-emerald-800",
  skipped: "bg-gray-100 text-gray-700",
};

const displayColumnTitle = (column: Column) =>
  column.id === "col-unscheduled" && column.title === "Unscheduled" ? "Ideas Inbox" : column.title;

const sortCardsByTime = (cards: Card[]) =>
  [...cards].sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"));

const DAY_SECTIONS = [
  { label: "Morning", hint: "Breakfast, checkout, travel, first activity", from: 5, to: 12 },
  { label: "Afternoon", hint: "Lunch, main activity, downtime", from: 12, to: 17 },
  { label: "Evening", hint: "Dinner, village time, return plan", from: 17, to: 24 },
  { label: "Anytime", hint: "Ideas that still need a time", from: null, to: null },
];

const getStartHour = (card: Card) => {
  if (!card.start_time) {
    return null;
  }
  const hour = Number.parseInt(card.start_time.split(":")[0] ?? "", 10);
  return Number.isNaN(hour) ? null : hour;
};

const getSectionLabel = (card: Card) => {
  const hour = getStartHour(card);

  if (hour === null) {
    return "Anytime";
  }

  const section = DAY_SECTIONS.find(
    ({ from, to }) => from !== null && to !== null && hour >= from && hour < to
  );
  return section?.label ?? "Anytime";
};

const isMealCard = (card: Card) =>
  normalizeCardType(card) === "food" || /breakfast|brunch|lunch|dinner|meal|restaurant/i.test(`${card.title} ${card.details}`);

const isTravelCard = (card: Card) =>
  normalizeCardType(card) === "transport" || /drive|travel|transfer|flight|airport|ferry|gondola|check-in|checkout/i.test(`${card.title} ${card.details}`);

export const DayPlanView = ({ column, cards, onLock, onUnlock, onUpdateCard, username }: DayPlanViewProps) => {
  const locked = column.locked ?? false;
  const isDayColumn = column.id.startsWith("col-day-");
  const sortedCards = sortCardsByTime(cards);
  const bookedCount = sortedCards.filter((card) => normalizeCardStatus(card.status) === "booked").length;
  const researchingCount = sortedCards.filter((card) => normalizeCardStatus(card.status) === "researching").length;
  const dayCost = sortedCards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0);
  const foodCount = sortedCards.filter(isMealCard).length;
  const travelCount = sortedCards.filter(isTravelCard).length;
  const isPackedDay = sortedCards.length >= 5;
  const hasMixedCities =
    isDayColumn &&
    sortedCards.some((c) => /whistler/i.test(c.location ?? "")) &&
    sortedCards.some((c) => /vancouver|north.?van/i.test(c.location ?? ""));
  const cardsBySection = DAY_SECTIONS.map((section) => ({
    ...section,
    cards: sortedCards.filter((card) => getSectionLabel(card) === section.label),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow)] backdrop-blur">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            {displayColumnTitle(column)}
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
            {isDayColumn && dayCost > 0 && (
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                Est. ${dayCost.toLocaleString()}
              </span>
            )}
            {hasMixedCities && (
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
                Multi-city day
              </span>
            )}
            {isDayColumn && foodCount === 0 && sortedCards.length > 0 ? (
              <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-yellow-800">
                No meal yet
              </span>
            ) : null}
            {isDayColumn && travelCount === 0 && sortedCards.length > 0 ? (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                Add travel time
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
            {isDayColumn ? "Build this day from the basics" : "Use this as the Ideas Inbox"}
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--gray-text)]">
            {isDayColumn
              ? "Add breakfast, travel time, one main activity, lunch, downtime, and dinner. Drag ideas here from Unscheduled when they fit."
              : "Paste links or quick thoughts into Quick-Add, then drag the strongest ideas into a day when the plan starts taking shape."}
          </p>
        </div>
      ) : column.id === "col-unscheduled" ? (
        <div className="flex flex-col gap-4" data-testid="ideas-inbox-queue">
          {([
            { type: "activity", label: "Activities" },
            { type: "food", label: "Food" },
            { type: "lodging", label: "Lodging" },
            { type: "transport", label: "Transport" },
            { type: "reservation", label: "Reservations" },
            { type: "reminder", label: "Reminders" },
            { type: "backup", label: "Backup Options" },
          ] as const).map(({ type, label }) => {
            const groupCards = sortedCards.filter(
              (c) => normalizeCardType(c) === type && normalizeCardStatus(c.status) !== "skipped",
            );
            if (groupCards.length === 0) return null;
            return (
              <section key={type}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${TYPE_COLORS[type] ?? "bg-gray-100 text-gray-600"}`}>
                    {label}
                  </span>
                  <span className="text-xs text-[var(--gray-text)]">{groupCards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {groupCards.map((card) => {
                    const cardStatus = normalizeCardStatus(card.status);
                    const statusColor = STATUS_COLORS[cardStatus];
                    const isConfirmed = cardStatus === "shortlisted" || cardStatus === "booked" || cardStatus === "confirmed";
                    return (
                      <div
                        key={card.id}
                        className={`rounded-2xl border p-4 transition ${
                          isConfirmed ? "border-green-200 bg-green-50/60" : "border-[var(--stroke)] bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
                                {formatCardStatus(cardStatus)}
                              </span>
                              {card.suggested_by && (
                                <span className="text-[10px] text-[var(--gray-text)]">by {card.suggested_by}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-[var(--navy-dark)]">{card.ai_title || card.title}</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">{card.ai_summary || card.details}</p>
                            {(() => {
                              const vs = getVoteSummary(card);
                              if (vs.total === 0) return null;
                              return (
                                <p className="mt-1.5 flex gap-3 text-[10px] font-semibold">
                                  {vs.mustDo > 0 && <span className="text-green-700">{vs.mustDo} must-do</span>}
                                  {vs.niceToHave > 0 && <span className="text-[var(--primary-blue)]">{vs.niceToHave} nice</span>}
                                  {vs.skip > 0 && <span className="text-[var(--gray-text)]">{vs.skip} skip</span>}
                                </p>
                              );
                            })()}
                          </div>
                          <div className="flex flex-shrink-0 flex-col gap-1.5">
                            {username && (
                              <button
                                type="button"
                                onClick={() => {
                                  const current = card.votes?.[username];
                                  onUpdateCard?.(card.id, {
                                    votes: { ...card.votes, [username]: current === "must-do" ? "nice-to-have" : "must-do" },
                                  });
                                }}
                                className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                                  card.votes?.[username] === "must-do"
                                    ? "bg-green-100 text-green-800"
                                    : "border border-[var(--stroke)] text-[var(--gray-text)] hover:border-green-300 hover:text-green-700"
                                }`}
                              >
                                Must-do
                              </button>
                            )}
                            {!isConfirmed && (
                              <button
                                type="button"
                                onClick={() => onUpdateCard?.(card.id, { status: "shortlisted" })}
                                className="rounded-full bg-green-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-green-700 transition hover:bg-green-100"
                              >
                                Shortlist
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onUpdateCard?.(card.id, { status: "skipped" })}
                              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)]"
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {(() => {
            const skipped = sortedCards.filter((c) => normalizeCardStatus(c.status) === "skipped");
            if (skipped.length === 0) return null;
            return (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]">
                  Skipped ({skipped.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {skipped.map((card) => (
                    <div key={card.id} className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white/60 px-4 py-2.5 opacity-60">
                      <p className="text-sm text-[var(--gray-text)] line-through">{card.ai_title || card.title}</p>
                      <button
                        type="button"
                        onClick={() => onUpdateCard?.(card.id, { status: "idea" })}
                        className="ml-3 flex-shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary-blue)] hover:underline"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {isDayColumn && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">Meals</p>
                <p className="mt-2 text-sm font-semibold text-[var(--navy-dark)]">
                  {foodCount > 0 ? `${foodCount} planned` : "Needs lunch or dinner"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">Travel</p>
                <p className="mt-2 text-sm font-semibold text-[var(--navy-dark)]">
                  {travelCount > 0 ? `${travelCount} travel block${travelCount === 1 ? "" : "s"}` : "Add drive or transfer"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">Pace</p>
                <p className="mt-2 text-sm font-semibold text-[var(--navy-dark)]">
                  {isPackedDay ? "Packed day" : "Room to breathe"}
                </p>
              </div>
            </div>
          )}
          {cardsBySection.map((section) => (
            <section key={section.label} className="rounded-3xl border border-[var(--stroke)] bg-white/70 p-4 shadow-[var(--shadow)] sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold text-[var(--navy-dark)]">{section.label}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">{section.hint}</p>
                </div>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)]">
                  {section.cards.length} item{section.cards.length === 1 ? "" : "s"}
                </span>
              </div>
              {section.cards.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--stroke)] bg-white/60 px-4 py-5 text-sm text-[var(--gray-text)]">
                  Nothing planned here yet.
                </p>
              ) : (
                <ol className="relative flex flex-col gap-4 before:absolute before:left-5 before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-[var(--stroke)] sm:before:left-24">
                  {section.cards.map((card, index) => {
                    const cardType = normalizeCardType(card);
                    const typeColor = TYPE_COLORS[cardType] ?? "bg-gray-100 text-gray-600";
                    const cardStatus = normalizeCardStatus(card.status);
                    const statusColor = STATUS_COLORS[cardStatus];
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
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
                              {formatCardStatus(cardStatus)}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor}`}>
                              {formatCardType(cardType)}
                            </span>
                            {(() => {
                              const vs = getVoteSummary(card);
                              return vs.mustDo > 0 ? (
                                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                                  {vs.mustDo} must-do
                                </span>
                              ) : null;
                            })()}
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
            </section>
          ))}
        </div>
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
