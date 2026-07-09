import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatSidebar, type ChatMessage } from "@/components/ChatSidebar";

describe("ChatSidebar", () => {
  it("shows empty state when there are no messages", () => {
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/ask the assistant/i)).toBeInTheDocument();
  });

  it("renders user and assistant messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    render(
      <ChatSidebar
        messages={messages}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("shows a proposal panel with apply and reject buttons when a diff is provided", () => {
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
        pendingProposalDiff={{ added: ["New Hotel"], updated: [], moved: ["Gondola"] }}
        onApplyProposal={vi.fn()}
        onRejectProposal={vi.fn()}
      />
    );

    expect(screen.getByTestId("proposal-panel")).toBeInTheDocument();
    expect(screen.getByText("Proposed Changes")).toBeInTheDocument();
    expect(screen.getByText("1 card added")).toBeInTheDocument();
    expect(screen.getByText("1 card moved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("calls onApplyProposal when Apply is clicked", async () => {
    const onApply = vi.fn();
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
        pendingProposalDiff={{ added: ["New Card"], updated: [], moved: [] }}
        onApplyProposal={onApply}
        onRejectProposal={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("calls onRejectProposal when Reject is clicked", async () => {
    const onReject = vi.fn();
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
        pendingProposalDiff={{ added: [], updated: ["Hotel"], moved: [] }}
        onApplyProposal={vi.fn()}
        onRejectProposal={onReject}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("renders a planning analysis badge for summary-only assistant messages", () => {
    render(
      <ChatSidebar
        messages={[
          { role: "assistant", content: "Day 3 is overloaded with 7 items.", summaryOnly: true },
        ]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Planning analysis")).toBeInTheDocument();
    expect(screen.getByText("Day 3 is overloaded with 7 items.")).toBeInTheDocument();
  });

  it("does not show a planning analysis badge for regular assistant messages", () => {
    render(
      <ChatSidebar
        messages={[{ role: "assistant", content: "Card moved.", summaryOnly: false }]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText("Planning analysis")).not.toBeInTheDocument();
  });

  it("calls onSendMessage with the typed message on submit", async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={onSendMessage}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await userEvent.type(screen.getByTestId("chat-input"), "Rename the first column");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSendMessage).toHaveBeenCalledWith("Rename the first column");
  });

  it("disables input and button while loading", () => {
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={true}
        errorMessage={null}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId("chat-input")).toBeDisabled();
    expect(screen.getByRole("button", { name: /thinking/i })).toBeDisabled();
  });

  it("shows an error message when provided", () => {
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage="Unable to reach the AI."
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Unable to reach the AI.")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <ChatSidebar
        messages={[]}
        onSendMessage={vi.fn()}
        isLoading={false}
        errorMessage={null}
        isOpen={true}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /close chat/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
