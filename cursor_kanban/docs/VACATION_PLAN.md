# Product Plan: AI-Powered Family Vacation Planner (MVP)

## 0. Strategic Decision: Separate App vs. Repurposed PM App

This vacation planner will be built as a **repurposing of the existing PM app**, not a separate codebase. The existing FastAPI backend, SQLite persistence, Docker setup, and NextJS frontend are all reused. The changes are additive: new column labels, additional card fields, multi-user auth, a trip context record, and AI enrichment on card creation.

---

## 1. Product Vision & Positioning

The **AI-Powered Family Vacation Planner** turns a generic project management tool into a collaborative, shared sandbox for trip planning. It replaces disjointed group chats and spreadsheets with a single visual board where any family member can drop a link, and the AI automatically structures it into a useful card.

**Deployment:** The frontend is deployed to Vercel. The FastAPI backend (Docker container) is deployed to Railway with a persistent volume for SQLite. Family members access the app via the public Vercel URL. Each family member has their own named account -- this is what makes identity tracking meaningful.

| Layer | Host | Notes |
|---|---|---|
| NextJS frontend | Vercel | Deployed from GitHub; calls backend via `NEXT_PUBLIC_API_URL` env var |
| FastAPI backend | Railway | Docker container; persistent volume mounts the SQLite file |
| SQLite database | Railway volume | No migration needed; existing schema extended |
| OpenRouter API key | Railway env var | Set as `OPENROUTER_API_KEY` in Railway service settings |

---

## 2. Target Personas & Core Pain Points

| Persona | Role | Primary pain point |
|---|---|---|
| Lead Organizer | Books flights, tracks deadlines, makes final calls | Chasing family for input; no single source of truth |
| Casual Contributor | Wants to suggest activities and food, not manage logistics | Planning tools feel like work; ideas get buried in group chats |

### Value Propositions
1. **Centralization:** One board replaces the group chat link pile.
2. **Low-friction input:** Paste a URL, done. The AI handles title, summary, and categorization.
3. **Context-aware AI:** The assistant knows the current board state and can answer planning questions directly ("What do we still need for Day 3?").

---

## 3. Scope & Feature Prioritization (MoSCoW Matrix)

### Must Have (MVP Core)
* **Trip Context Record:** A single `trips` record storing the destination, start date, and end date. This is the anchor the AI needs for gap detection and date-aware responses.
* **Named Family Member Accounts:** Multiple user accounts with hashed passwords and a `display_name` (e.g., "Mom", "Dad", "Sarah"). A shared single account removes all value from identity tracking -- named accounts are required for `suggested_by` to be meaningful.
* **Visual Status Board:** Kanban columns mapped to trip planning phases: `Ideas`, `To Research`, `Booked & Locked`.
* **Quick-Add Input:** A single URL/text field at the top of the board. Submitting it creates a card attributed to the logged-in family member.

### Should Have (High Priority)
* **Day-by-Day Timeline View:** A secondary view organising `Booked & Locked` cards by their assigned trip date (Day 1, Day 2, etc.).
* **Booking Deadline Badges:** A `deadline` field on cards with a visual indicator when the date is within 48 hours or has passed (e.g., "Cancel by June 15 for full refund").
* **Activity Feed:** A compact reverse-chronological log of recent board changes visible in the sidebar (e.g., "Dad added a flight link 2 hours ago").

### Could Have (AI Enhancements)
* **AI Card Auto-Structuring:** When a URL is submitted via Quick-Add, the backend sends it to OpenRouter. The LLM attempts to infer a title, 1-2 sentence summary, and category tag (Lodging, Food, Activity, Transport) from the URL and any `og:` meta tags fetched server-side. Note: full scraping is not used -- many travel sites block it. The LLM works from URL structure and available open-graph metadata only.
* **Contextual Chat Companion:** The existing AI chat sidebar is extended with board and trip context injected into the system prompt. This enables natural-language queries like "What nights are we missing accommodation for?" or "Summarise everything Sarah has suggested."

### Won't Have (Explicitly Out of Scope)
* **Payment splitting or cost tracking:** Out of scope for this app.
* **Real-time collaborative editing:** Refresh-on-load is sufficient. No WebSockets or live cursors.
* **Mobile app:** The web UI accessed on a phone browser is sufficient for the MVP.

---

## 4. Data Model Changes (Delta from Existing Schema)

The existing schema has `users`, `boards`, `columns`, and `cards`. The following changes are needed:

#### New: Trips Table
Stores the context the AI needs for date-aware reasoning.
* `id`: INTEGER (Primary Key)
* `name`: TEXT (e.g., "Summer 2026 Beach Trip")
* `destination`: TEXT (e.g., "Outer Banks, NC")
* `start_date`: DATE
* `end_date`: DATE
* `created_by`: INTEGER (Foreign Key -> `users.id`)

#### Modified: Cards Table (additions only)
* `content_url`: TEXT (nullable -- the source link if added via Quick-Add)
* `ai_title`: TEXT (nullable -- AI-generated title from URL enrichment)
* `ai_summary`: TEXT (nullable -- AI-generated 1-2 sentence description)
* `ai_tag`: TEXT (nullable -- one of: `Lodging`, `Food`, `Activity`, `Transport`)
* `suggested_by`: INTEGER (Foreign Key -> `users.id`)
* `trip_date`: DATE (nullable -- assigned day in the itinerary)
* `deadline`: DATE (nullable -- booking cancellation or expiry date)

#### Modified: Users Table
* Add `display_name`: TEXT (the friendly name shown on cards, e.g., "Mom")
* Passwords must be hashed with bcrypt -- no plaintext storage

---

## 5. End-to-End User Flows

### Flow A: Quick-Add Link Dump
1. A family member copies a link (Airbnb, restaurant, activity) on their phone or laptop.
2. They open the app, paste the URL into the Quick-Add bar, and submit.
3. A card is created immediately in the `Ideas` column, attributed to their account.
4. In the background, the backend fetches available `og:` meta tags from the URL and sends them with the URL to OpenRouter.
5. The AI returns a title, summary, and category tag; the card is updated in place.

### Flow B: AI Gap Detection via Chat
1. The Lead Organizer opens the AI Chat Sidebar and asks: "What nights do we still need accommodation for?"
2. The backend injects the trip's `start_date`, `end_date`, and all `booked` cards with a `trip_date` into the system prompt.
3. The AI compares booked dates against the trip date range and identifies uncovered nights.
4. The AI responds with specific gaps and references any relevant cards already in `To Research` that could fill them.

---

## 6. Implementation Milestones

Milestones are ordered by dependency.

* [ ] **Milestone 1 -- Data model:** Add `trips` table; extend `cards` with `content_url`, `ai_title`, `ai_summary`, `ai_tag`, `suggested_by`, `trip_date`, `deadline`; add `display_name` to `users`; enforce bcrypt hashing on all passwords.
* [ ] **Milestone 2 -- Multi-user auth:** Update seed logic to create named family member accounts. Update login/session routes. Remove hardcoded single-user assumption.
* [ ] **Milestone 3 -- Frontend updates:** Rename board columns to trip planning phases. Add Quick-Add input bar. Display `suggested_by` display name on each card. Switch API calls to use `NEXT_PUBLIC_API_URL` environment variable instead of relative paths.
* [ ] **Milestone 4 -- Backend CORS:** Configure FastAPI to allow requests from the Vercel frontend domain.
* [ ] **Milestone 5 -- AI card enrichment:** Add a background task that fires on Quick-Add submission, fetches `og:` metadata, calls OpenRouter, and patches the card with AI-generated fields.
* [ ] **Milestone 6 -- Context-aware chat:** Inject trip context (dates, destination) and current board state into the AI chat system prompt so the sidebar can answer planning questions.
* [ ] **Milestone 7 -- Deployment:** Deploy backend Docker container to Railway with persistent SQLite volume and environment variables. Deploy NextJS frontend to Vercel pointed at the Railway backend URL.
