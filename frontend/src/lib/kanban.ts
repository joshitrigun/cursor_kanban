export const TRAVEL_CARD_TYPES = [
  "lodging",
  "transport",
  "activity",
  "food",
  "reservation",
  "reminder",
  "backup",
] as const;

export type TravelCardType = (typeof TRAVEL_CARD_TYPES)[number];

export const TRAVEL_CARD_STATUSES = [
  "idea",
  "researching",
  "shortlisted",
  "booked",
  "confirmed",
  "skipped",
] as const;

export type TravelCardStatus = (typeof TRAVEL_CARD_STATUSES)[number];

export type Card = {
  id: string;
  title: string;
  details: string;
  type?: TravelCardType | string;
  status?: TravelCardStatus | string;
  estimated_cost?: number;
  votes?: Record<string, string>;
  start_time?: string;
  end_time?: string;
  location?: string;
  address?: string;
  content_url?: string;
  ai_title?: string;
  ai_summary?: string;
  ai_tag?: string;
  suggested_by?: string;
  trip_date?: string;
  deadline?: string;
};

const AI_TAG_TO_TYPE: Record<string, TravelCardType> = {
  Lodging: "lodging",
  Transport: "transport",
  Activity: "activity",
  Food: "food",
  Event: "reservation",
  "World Cup": "activity",
};

export const normalizeCardType = (card: Pick<Card, "type" | "ai_tag" | "title" | "details">): TravelCardType => {
  const explicitType = typeof card.type === "string" ? card.type.toLowerCase() : "";
  if ((TRAVEL_CARD_TYPES as readonly string[]).includes(explicitType)) {
    return explicitType as TravelCardType;
  }

  if (card.ai_tag && AI_TAG_TO_TYPE[card.ai_tag]) {
    return AI_TAG_TO_TYPE[card.ai_tag];
  }

  const haystack = `${card.title} ${card.details}`.toLowerCase();
  if (/hotel|airbnb|lodging|accommodation|check-in|checkout|room/.test(haystack)) return "lodging";
  if (/drive|transfer|flight|airport|ferry|train|car|bus|gondola/.test(haystack)) return "transport";
  if (/breakfast|brunch|lunch|dinner|meal|restaurant|coffee|cafe/.test(haystack)) return "food";
  if (/book|ticket|reservation|confirm|confirmation/.test(haystack)) return "reservation";
  if (/pack|passport|document|reminder|check/.test(haystack)) return "reminder";
  if (/backup|rainy|alternative/.test(haystack)) return "backup";
  return "activity";
};

export const formatCardType = (type: TravelCardType | string) =>
  type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const normalizeCardStatus = (status: Card["status"]): TravelCardStatus => {
  const normalizedStatus = typeof status === "string" ? status.toLowerCase() : "";
  if ((TRAVEL_CARD_STATUSES as readonly string[]).includes(normalizedStatus)) {
    return normalizedStatus as TravelCardStatus;
  }
  return "idea";
};

export const formatCardStatus = (status: TravelCardStatus | string) =>
  status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const getVoteSummary = (card: Pick<Card, "votes">) => {
  const allVotes = Object.values(card.votes ?? {});
  return {
    mustDo: allVotes.filter((v) => v === "must-do").length,
    niceToHave: allVotes.filter((v) => v === "nice-to-have").length,
    skip: allVotes.filter((v) => v === "skip").length,
    total: allVotes.length,
  };
};

// ---------------------------------------------------------------------------
// Board diff
// ---------------------------------------------------------------------------

export type BoardDiff = {
  added: string[];    // titles of cards present in proposed but not in current
  updated: string[];  // titles of cards whose title or details changed
  moved: string[];    // titles of cards that appear in a different column
};

export const diffBoards = (current: BoardData, proposed: BoardData): BoardDiff => {
  const currentColumnOfCard: Record<string, string> = {};
  for (const col of current.columns) {
    for (const cardId of col.cardIds) currentColumnOfCard[cardId] = col.id;
  }

  const proposedColumnOfCard: Record<string, string> = {};
  for (const col of proposed.columns) {
    for (const cardId of col.cardIds) proposedColumnOfCard[cardId] = col.id;
  }

  const added: string[] = [];
  const updated: string[] = [];
  const moved: string[] = [];

  for (const [id, card] of Object.entries(proposed.cards)) {
    const label = card.ai_title || card.title;
    const existing = current.cards[id];
    if (!existing) {
      added.push(label);
      continue;
    }
    if (card.title !== existing.title || card.details !== existing.details) {
      updated.push(label);
    }
    if (currentColumnOfCard[id] !== undefined && currentColumnOfCard[id] !== proposedColumnOfCard[id]) {
      moved.push(label);
    }
  }

  return { added, updated, moved };
};

// ---------------------------------------------------------------------------
// Trip Readiness
// ---------------------------------------------------------------------------

export type ReadinessItem = {
  label: string;
  ready: boolean;
  action: string;
};

export type ReadinessResult = {
  items: ReadinessItem[];
  coveredCount: number;
  nextActions: string[];
  tripTotal: number;
  bookedTotal: number;
};

const isCardBookedOrConfirmed = (card: Card) => {
  const s = normalizeCardStatus(card.status);
  return s === "booked" || s === "confirmed";
};

const isCardAtLeastShortlisted = (card: Card) => {
  const s = normalizeCardStatus(card.status);
  return s === "shortlisted" || s === "booked" || s === "confirmed";
};

export const computeReadiness = (cards: Card[]): ReadinessResult => {
  const active = cards.filter((c) => normalizeCardStatus(c.status) !== "skipped");

  const items: ReadinessItem[] = [
    {
      label: "Lodging",
      ready: active.some((c) => isCardBookedOrConfirmed(c) && normalizeCardType(c) === "lodging"),
      action: "Confirm lodging",
    },
    {
      label: "Transport",
      ready: active.some((c) => isCardBookedOrConfirmed(c) && normalizeCardType(c) === "transport"),
      action: "Add transport plan",
    },
    {
      label: "Key activities",
      ready: active.some((c) => isCardAtLeastShortlisted(c) && normalizeCardType(c) === "activity"),
      action: "Shortlist at least one activity",
    },
    {
      label: "Meals",
      ready: active.some((c) => normalizeCardType(c) === "food"),
      action: "Pick lunch or dinner options",
    },
    {
      label: "Reservations",
      ready: active.some((c) => isCardBookedOrConfirmed(c) && normalizeCardType(c) === "reservation"),
      action: "Confirm key reservations",
    },
    {
      label: "Documents",
      ready: active.some(
        (c) =>
          normalizeCardType(c) === "reminder" &&
          /passport|visa|document|id\b/i.test(`${c.title} ${c.details}`),
      ),
      action: "Add document checklist",
    },
    {
      label: "Emergency info",
      ready: active.some((c) =>
        /emergency|hospital|insurance|contact/i.test(`${c.title} ${c.details}`),
      ),
      action: "Add emergency contact info",
    },
    {
      label: "Budget",
      ready:
        active.some((c) => typeof c.estimated_cost === "number" && c.estimated_cost > 0) ||
        active.some((c) => /budget|cost|estimate|expense|spend/i.test(`${c.title} ${c.details}`)),
      action: "Estimate trip budget",
    },
  ];

  const coveredCount = items.filter((i) => i.ready).length;
  const nextActions = items
    .filter((i) => !i.ready)
    .slice(0, 3)
    .map((i) => i.action);

  const tripTotal = active.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0);
  const bookedTotal = active
    .filter((c) => isCardBookedOrConfirmed(c))
    .reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0);

  return { items, coveredCount, nextActions, tripTotal, bookedTotal };
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
  locked?: boolean;
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-unscheduled", title: "Ideas Inbox", cardIds: ["card-1", "card-2"] },
    { id: "col-day-1", title: "Day 1 \u00b7 Jun 28", cardIds: [] },
    { id: "col-day-2", title: "Day 2 \u00b7 Jun 29", cardIds: ["card-3"] },
    { id: "col-day-3", title: "Day 3 \u00b7 Jun 30", cardIds: [] },
    { id: "col-day-4", title: "Day 4 \u00b7 Jul 1", cardIds: [] },
    { id: "col-day-5", title: "Day 5 \u00b7 Jul 2", cardIds: [] },
    { id: "col-day-6", title: "Day 6 \u00b7 Jul 3", cardIds: [] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Destination ideas",
      details: "Beach, mountains, city break? Add your suggestions here.",
      suggested_by: "User",
      type: "activity",
      status: "idea",
    },
    "card-2": {
      id: "card-2",
      title: "Activities wish list",
      details: "Drop any activities, restaurants, or experiences you want to do.",
      suggested_by: "User",
      type: "activity",
      status: "idea",
    },
    "card-3": {
      id: "card-3",
      title: "Check accommodation options",
      details: "Compare Airbnb vs hotel for the dates. Need to decide before June 15.",
      suggested_by: "User",
      type: "lodging",
      ai_tag: "Lodging",
      status: "researching",
    },
  },
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};
