export type Card = {
  id: string;
  title: string;
  details: string;
  status?: "idea" | "researching" | "booked" | "maybe" | "cancelled" | string;
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
    { id: "col-unscheduled", title: "Unscheduled", cardIds: ["card-1", "card-2"] },
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
      status: "idea",
    },
    "card-2": {
      id: "card-2",
      title: "Activities wish list",
      details: "Drop any activities, restaurants, or experiences you want to do.",
      suggested_by: "User",
      status: "idea",
    },
    "card-3": {
      id: "card-3",
      title: "Check accommodation options",
      details: "Compare Airbnb vs hotel for the dates. Need to decide before June 15.",
      suggested_by: "User",
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
