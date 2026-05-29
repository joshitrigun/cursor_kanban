import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { initialData } from "@/lib/kanban";

type MockFetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

const mockFetch = vi.fn<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<MockFetchResponse>
>();

describe("AppShell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    mockFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the login form when the session is unauthenticated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: false, username: null }),
    });

    render(<AppShell />);

    expect(await screen.findByTestId("login-form")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
  });

  it("logs in successfully and renders the board", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, username: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ board: initialData, boardVersion: 1, schemaVersion: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      });

    render(<AppShell />);

    await screen.findByTestId("login-form");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/signed in as user/i)).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/login",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/board",
      expect.objectContaining({ credentials: "same-origin" })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      "/api/chat-history",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("shows an error for invalid credentials", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, username: null }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          authenticated: false,
          message: "Invalid username or password.",
        }),
      });

    render(<AppShell />);

    await screen.findByTestId("login-form");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(
      await screen.findByText("Invalid username or password.")
    ).toBeInTheDocument();
  });

  it("loads the persisted board for an authenticated session", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ board: initialData, boardVersion: 1, schemaVersion: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      });

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByText(/signed in as user/i)).toBeInTheDocument();
    });
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("sends a chat message and renders the assistant reply", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ board: initialData, boardVersion: 1, schemaVersion: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assistantMessage: "The board looks good.",
          boardUpdated: false,
          board: initialData,
          boardVersion: 1,
          schemaVersion: 1,
        }),
      });

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByTestId("chat-input"), "How is the board?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("The board looks good.")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("waits for a pending board save before sending an AI chat request", async () => {
    let resolveBoardSave: ((value: MockFetchResponse) => void) | undefined;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ board: initialData, boardVersion: 1, schemaVersion: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      })
      .mockImplementationOnce(
        () =>
          new Promise<MockFetchResponse>((resolve) => {
            resolveBoardSave = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assistantMessage: "Done.",
          boardUpdated: false,
          board: initialData,
          boardVersion: 2,
          schemaVersion: 1,
        }),
      });

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByText(/signed in as user/i)).toBeInTheDocument();
    });

    await userEvent.clear(screen.getAllByLabelText(/column title/i)[0]);
    await userEvent.type(screen.getAllByLabelText(/column title/i)[0], "Ready");

    await userEvent.type(screen.getByTestId("chat-input"), "Summarize the board.");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/ai/chat",
      expect.objectContaining({ method: "POST" })
    );

    resolveBoardSave?.({
      ok: true,
      json: async () => ({
        board: {
          ...initialData,
          columns: [
            { ...initialData.columns[0], title: "Ready" },
            ...initialData.columns.slice(1),
          ],
        },
        boardVersion: 2,
        schemaVersion: 1,
      }),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/ai/chat",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("clears chat messages after logout", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ board: initialData, boardVersion: 1, schemaVersion: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assistantMessage: "The board looks good.",
          boardUpdated: false,
          board: initialData,
          boardVersion: 1,
          schemaVersion: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByTestId("chat-input"), "How is the board?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("The board looks good.")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByTestId("login-form")).toBeInTheDocument();
    });
    expect(screen.queryByText("The board looks good.")).not.toBeInTheDocument();
  });

  it("loads persisted chat history for an authenticated session", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ board: initialData, boardVersion: 1, schemaVersion: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            { role: "user", content: "Summarize the board." },
            { role: "assistant", content: "Board is in good shape." },
          ],
        }),
      });

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByText("Summarize the board.")).toBeInTheDocument();
    });
    expect(screen.getByText("Board is in good shape.")).toBeInTheDocument();
  });
});