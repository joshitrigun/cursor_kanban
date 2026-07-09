import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];
const showAllDays = async () => {
  await userEvent.click(screen.getByRole("button", { name: /all days/i }));
};

describe("KanbanBoard", () => {
  it("opens on the first day itinerary", () => {
    render(<KanbanBoard />);
    expect(screen.getByRole("heading", { name: /day 1/i })).toBeInTheDocument();
  });

  it("renders unscheduled plus six day columns", async () => {
    render(<KanbanBoard />);
    await showAllDays();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(7);
  });

  it("shows a travel type chip on cards", async () => {
    render(<KanbanBoard />);
    await showAllDays();
    expect(screen.getAllByText("Activity").length).toBeGreaterThan(0);
  });

  it("updates a card status from the board", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);
    await showAllDays();

    await user.selectOptions(
      screen.getByLabelText("Status for Destination ideas"),
      "shortlisted"
    );

    expect(screen.getByLabelText("Status for Destination ideas")).toHaveValue("shortlisted");
    expect(within(screen.getByTestId("card-card-1")).getAllByText("Shortlisted").length).toBeGreaterThan(0);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    await showAllDays();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    await showAllDays();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("shows day itinerary sections and gap cues", async () => {
    render(<KanbanBoard />);

    await userEvent.click(screen.getByRole("button", { name: /day 2/i }));

    expect(screen.getByRole("heading", { name: "Morning" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Afternoon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evening" })).toBeInTheDocument();
    expect(screen.getAllByText("Meals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Travel").length).toBeGreaterThan(0);
    expect(screen.getByText("Pace")).toBeInTheDocument();
  });

  it("shows a cost input on cards in the board view", async () => {
    render(<KanbanBoard />);
    await showAllDays();
    expect(screen.getByLabelText("Estimated cost for Destination ideas")).toBeInTheDocument();
  });

  it("shows cost breakdown in readiness when cards have estimated_cost", async () => {
    const boardWithCost = {
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": { ...initialData.cards["card-1"], estimated_cost: 200, status: "booked" as const },
      },
    };
    render(<KanbanBoard board={boardWithCost} />);
    expect(screen.getByTestId("cost-breakdown")).toBeInTheDocument();
    expect(screen.getByText("$200 booked")).toBeInTheDocument();
  });

  it("shows the ideas inbox decision queue with group headers and quick actions", async () => {
    render(<KanbanBoard />);
    // Ideas Inbox tab is the last column button
    await userEvent.click(screen.getByRole("button", { name: /ideas inbox/i }));

    expect(screen.getByTestId("ideas-inbox-queue")).toBeInTheDocument();
    // initialData cards are type "activity" — should show Activities group
    expect(screen.getByText("Activities")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /shortlist/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /skip/i }).length).toBeGreaterThan(0);
  });

  it("shows a multi-city warning when Whistler and Vancouver items share a day", () => {
    const whistlerVancouverBoard = {
      ...initialData,
      columns: [initialData.columns[0], { ...initialData.columns[1], cardIds: ["mc-1", "mc-2"] }, ...initialData.columns.slice(2)],
      cards: {
        ...initialData.cards,
        "mc-1": { id: "mc-1", title: "Whistler lunch", details: "", location: "Whistler Village", type: "food" as const },
        "mc-2": { id: "mc-2", title: "Vancouver dinner", details: "", location: "Vancouver downtown", type: "food" as const },
      },
    };
    render(<KanbanBoard board={whistlerVancouverBoard} />);
    expect(screen.getByText("Multi-city day")).toBeInTheDocument();
  });

  it("shows the readiness dashboard with 8 items and next actions", () => {
    render(<KanbanBoard />);
    const section = screen.getByTestId("readiness-section");
    // 8 category labels
    expect(within(section).getByText("Lodging")).toBeInTheDocument();
    expect(within(section).getByText("Transport")).toBeInTheDocument();
    expect(within(section).getByText("Key activities")).toBeInTheDocument();
    expect(within(section).getByText("Meals")).toBeInTheDocument();
    expect(within(section).getByText("Reservations")).toBeInTheDocument();
    expect(within(section).getByText("Documents")).toBeInTheDocument();
    expect(within(section).getByText("Emergency info")).toBeInTheDocument();
    expect(within(section).getByText("Budget")).toBeInTheDocument();
    // next actions section heading
    expect(within(section).getByText("Top next actions")).toBeInTheDocument();
  });

  it("ignores missing card references in the all-days view", async () => {
    render(
      <KanbanBoard
        board={{
          ...initialData,
          columns: [
            {
              ...initialData.columns[0],
              cardIds: [...initialData.columns[0].cardIds, "ghost-card"],
            },
            ...initialData.columns.slice(1),
          ],
        }}
      />
    );

    await showAllDays();

    expect(screen.getAllByTestId(/column-/i)).toHaveLength(7);
    expect(screen.queryByTestId("card-ghost-card")).not.toBeInTheDocument();
  });
});
