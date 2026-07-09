import { computeReadiness, diffBoards, getVoteSummary, moveCard, type BoardData, type Card, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("computeReadiness", () => {
  const makeCard = (overrides: Partial<Card>): Card => ({
    id: "c1",
    title: "",
    details: "",
    ...overrides,
  });

  it("returns 0 covered when no cards exist", () => {
    const { coveredCount, nextActions } = computeReadiness([]);
    expect(coveredCount).toBe(0);
    expect(nextActions).toHaveLength(3);
  });

  it("marks lodging covered when a booked lodging card exists", () => {
    const cards = [makeCard({ id: "c1", type: "lodging", status: "booked" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Lodging")?.ready).toBe(true);
  });

  it("does not count a skipped lodging card", () => {
    const cards = [makeCard({ id: "c1", type: "lodging", status: "skipped" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Lodging")?.ready).toBe(false);
  });

  it("marks transport covered when a confirmed transport card exists", () => {
    const cards = [makeCard({ id: "c1", type: "transport", status: "confirmed" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Transport")?.ready).toBe(true);
  });

  it("marks key activities covered when a shortlisted activity card exists", () => {
    const cards = [makeCard({ id: "c1", type: "activity", status: "shortlisted" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Key activities")?.ready).toBe(true);
  });

  it("marks key activities not covered when only an idea activity exists", () => {
    const cards = [makeCard({ id: "c1", type: "activity", status: "idea" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Key activities")?.ready).toBe(false);
  });

  it("marks meals covered when any food card exists regardless of status", () => {
    const cards = [makeCard({ id: "c1", type: "food", status: "idea" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Meals")?.ready).toBe(true);
  });

  it("marks budget covered when a card has estimated_cost > 0", () => {
    const cards = [makeCard({ id: "c1", estimated_cost: 150 })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Budget")?.ready).toBe(true);
  });

  it("does not mark budget covered when estimated_cost is 0", () => {
    const cards = [makeCard({ id: "c1", estimated_cost: 0 })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Budget")?.ready).toBe(false);
  });

  it("computes tripTotal as the sum of estimated_cost across active cards", () => {
    const cards = [
      makeCard({ id: "c1", estimated_cost: 100, status: "booked" }),
      makeCard({ id: "c2", estimated_cost: 50, status: "idea" }),
      makeCard({ id: "c3", estimated_cost: 200, status: "skipped" }),
    ];
    const { tripTotal } = computeReadiness(cards);
    expect(tripTotal).toBe(150); // skipped card excluded
  });

  it("computes bookedTotal from booked and confirmed cards only", () => {
    const cards = [
      makeCard({ id: "c1", estimated_cost: 100, status: "booked" }),
      makeCard({ id: "c2", estimated_cost: 80, status: "confirmed" }),
      makeCard({ id: "c3", estimated_cost: 40, status: "idea" }),
    ];
    const { bookedTotal } = computeReadiness(cards);
    expect(bookedTotal).toBe(180);
  });

  it("returns tripTotal 0 and bookedTotal 0 when no costs are set", () => {
    const { tripTotal, bookedTotal } = computeReadiness([makeCard({ id: "c1" })]);
    expect(tripTotal).toBe(0);
    expect(bookedTotal).toBe(0);
  });

  it("marks budget covered when a card mentions budget in title", () => {
    const cards = [makeCard({ id: "c1", title: "Estimate trip budget", type: "reminder", status: "idea" })];
    const { items } = computeReadiness(cards);
    expect(items.find((i) => i.label === "Budget")?.ready).toBe(true);
  });

  it("returns the top 3 unmet actions as nextActions", () => {
    const { nextActions } = computeReadiness([]);
    expect(nextActions).toHaveLength(3);
    expect(nextActions[0]).toBe("Confirm lodging");
    expect(nextActions[1]).toBe("Add transport plan");
    expect(nextActions[2]).toBe("Shortlist at least one activity");
  });

  it("returns fewer than 3 next actions when most items are covered", () => {
    const cards = [
      makeCard({ id: "c1", type: "lodging", status: "booked" }),
      makeCard({ id: "c2", type: "transport", status: "booked" }),
      makeCard({ id: "c3", type: "activity", status: "shortlisted" }),
      makeCard({ id: "c4", type: "food", status: "idea" }),
      makeCard({ id: "c5", type: "reservation", status: "booked" }),
      makeCard({ id: "c6", type: "reminder", title: "pack passport", status: "idea" }),
      makeCard({ id: "c7", title: "emergency contact list", status: "idea" }),
      makeCard({ id: "c8", title: "budget estimate", status: "idea" }),
    ];
    const { nextActions, coveredCount } = computeReadiness(cards);
    expect(coveredCount).toBe(8);
    expect(nextActions).toHaveLength(0);
  });
});

describe("diffBoards", () => {
  const base: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["c1", "c2"] },
      { id: "col-b", title: "B", cardIds: ["c3"] },
    ],
    cards: {
      "c1": { id: "c1", title: "Card 1", details: "Details 1" },
      "c2": { id: "c2", title: "Card 2", details: "Details 2" },
      "c3": { id: "c3", title: "Card 3", details: "Details 3" },
    },
  };

  it("returns empty diff when boards are identical", () => {
    const diff = diffBoards(base, base);
    expect(diff.added).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
    expect(diff.moved).toHaveLength(0);
  });

  it("detects a new card as added", () => {
    const proposed: BoardData = {
      ...base,
      columns: [{ ...base.columns[0], cardIds: ["c1", "c2", "c4"] }, base.columns[1]],
      cards: { ...base.cards, "c4": { id: "c4", title: "New Card", details: "" } },
    };
    const diff = diffBoards(base, proposed);
    expect(diff.added).toEqual(["New Card"]);
  });

  it("detects a title change as updated", () => {
    const proposed: BoardData = {
      ...base,
      cards: { ...base.cards, "c1": { id: "c1", title: "Renamed", details: "Details 1" } },
    };
    const diff = diffBoards(base, proposed);
    expect(diff.updated).toContain("Renamed");
    expect(diff.moved).toHaveLength(0);
  });

  it("detects a card moved to a different column", () => {
    const proposed: BoardData = {
      ...base,
      columns: [
        { ...base.columns[0], cardIds: ["c1"] },
        { ...base.columns[1], cardIds: ["c3", "c2"] },
      ],
    };
    const diff = diffBoards(base, proposed);
    expect(diff.moved).toContain("Card 2");
    expect(diff.added).toHaveLength(0);
  });
});

describe("getVoteSummary", () => {
  it("returns all zeros when no votes exist", () => {
    const card: Card = { id: "c1", title: "", details: "" };
    expect(getVoteSummary(card)).toEqual({ mustDo: 0, niceToHave: 0, skip: 0, total: 0 });
  });

  it("counts must-do votes", () => {
    const card: Card = { id: "c1", title: "", details: "", votes: { dad: "must-do", mom: "must-do", trija: "nice-to-have" } };
    const vs = getVoteSummary(card);
    expect(vs.mustDo).toBe(2);
    expect(vs.niceToHave).toBe(1);
    expect(vs.total).toBe(3);
  });

  it("counts skip votes", () => {
    const card: Card = { id: "c1", title: "", details: "", votes: { dad: "skip", mom: "skip" } };
    expect(getVoteSummary(card).skip).toBe(2);
  });
});
