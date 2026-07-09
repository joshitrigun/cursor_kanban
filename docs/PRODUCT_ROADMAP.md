# Travel Product Roadmap

This roadmap moves the app from a travel-themed Kanban board toward a family travel planning assistant. The product goal is to help a group turn scattered ideas into a confident, bookable, day-by-day trip plan.

## Product Positioning

The app should be optimized for three jobs:

- Collect trip ideas from the family without losing context.
- Turn ideas into a realistic itinerary with timing, location, cost, and booking confidence.
- Use AI to identify gaps, conflicts, tradeoffs, and next best actions.

The Kanban board remains useful for planning, but the itinerary should become the primary experience. Travel users think in days, reservations, budgets, and decisions more than columns.

## Target Users

- Family trip planner: owns the schedule, budget, and bookings.
- Family contributor: suggests restaurants, activities, and constraints.
- On-trip user: needs the current day plan quickly on mobile.

## Product Principles

- Trip-first, board-supported: default to the day itinerary, keep Kanban for organization and backlog management.
- Confidence over completeness: show what is booked, missing, risky, or undecided.
- AI proposes, users approve: AI should suggest structured changes that can be reviewed before they alter the plan.
- Mobile execution matters: the app should be useful while walking, driving, or deciding what to do next.
- Keep the MVP simple: prefer structured fields and focused views over broad integrations.

## MVP Plus: Next 2-4 Weeks

Goal: make the existing app feel like a credible travel planner for stakeholder demos.

### 1. Typed Travel Cards

Add a required card type so the product can reason about each item.

Types:

- Lodging
- Transport
- Activity
- Food
- Reservation
- Reminder
- Backup

User value:

- Easier scanning and filtering.
- Better trip readiness calculations.
- More reliable AI edits and summaries.

Acceptance criteria:

- Every card displays a type chip.
- Quick-add assigns a best-effort type from URL metadata or user text.
- Existing cards are migrated or sanitized into a valid default type.
- Tests cover card rendering and backend validation for card type.

### 2. Booking And Decision Status

Standardize travel-native statuses across the UI.

Statuses:

- Idea
- Researching
- Shortlisted
- Booked
- Confirmed
- Skipped

User value:

- Makes trip readiness visible.
- Distinguishes inspiration from committed plan.
- Helps the family see what still needs decisions.

Acceptance criteria:

- Cards show status consistently in board and day views.
- Trip Readiness uses booked/confirmed counts.
- Skipped cards remain searchable but do not count toward itinerary readiness.

### 3. Stronger Day Itinerary View

Make the day view the default authenticated landing experience.

Enhancements:

- Morning, afternoon, evening, and anytime sections.
- Missing meal and missing transport indicators.
- Packed-day warning based on card count and time density.
- Finalized-day state that is visually clear but still reversible.

User value:

- The first screen answers, "What is the plan?"
- Stakeholders can understand the trip without learning the board model.

Acceptance criteria:

- First authenticated load opens the most relevant day, not All Days.
- Empty states suggest concrete next actions.
- Mobile layout keeps day switching and quick add within thumb reach.

### 4. Trip Readiness Dashboard

Expand readiness from a few essentials into a useful action list.

Readiness sections:

- Lodging
- Transport
- Key activities
- Meals
- Documents
- Packing/weather
- Emergency info
- Budget

User value:

- Gives the planner a short list of what is still unresolved.
- Makes the app useful even before every day is scheduled.

Acceptance criteria:

- Readiness items are derived from card data where possible.
- Manual checklist items are supported for non-card tasks.
- Dashboard highlights the top three next actions.

### 5. AI Gap Summary

Upgrade AI from command execution to planning analysis.

Prompts to support:

- "What still needs to be booked?"
- "Which day is overloaded?"
- "What decisions are blocking this trip?"
- "Create a rainy-day backup plan."
- "Find lunch gaps and suggest fixes."

User value:

- AI becomes a planning partner, not just a card editor.

Acceptance criteria:

- AI can return a read-only summary without changing the board.
- AI can return proposed board changes separately from the assistant message.
- Proposed changes are clearly marked before application.

## V2: Planning Intelligence

Goal: help users make better tradeoffs around time, location, budget, and preferences.

### 1. Budget Awareness

Fields:

- Estimated cost
- Paid/booked cost
- Free/paid indicator
- Cost notes

Views:

- Trip total estimate.
- Per-day totals.
- Booked vs. unbooked cost.
- High-cost items requiring decision.

Success metric:

- Users can answer "Are we within budget?" without leaving the app.

### 2. Decision Queue

Turn Ideas Inbox into a structured decision queue.

Groups:

- Food
- Activities
- Logistics
- World Cup
- Kid-friendly
- Rainy day

Actions:

- Assign to day
- Shortlist
- Mark as backup
- Skip
- Ask AI to compare

Success metric:

- Ideas move from inbox to scheduled, skipped, or backup states instead of lingering indefinitely.

### 3. Preferences And Votes

Add lightweight family signals.

Signals:

- Must-do
- Nice-to-have
- Not interested
- Person-specific vote or note

Success metric:

- The planner can see which ideas have consensus and which need discussion.

### 4. Map-Aware Planning

Start simple before full map integrations.

Fields:

- Address
- Neighborhood/city
- Approximate travel time
- Transport mode

Warnings:

- Far apart items on the same day.
- Tight transitions between timed activities.
- Missing transport between cities.

Success metric:

- Users can catch obvious location mistakes before the trip.

### 5. AI Proposed Changes Panel

AI should present itinerary edits as a reviewable change set.

Capabilities:

- Show added, moved, edited, and skipped cards.
- Apply all changes.
- Reject all changes.
- Apply selected changes.

Success metric:

- Users trust AI enough to ask for itinerary rebalancing because changes are inspectable.

## V3: Travel Operating System

Goal: support real trip execution and richer collaboration.

### 1. Current-Day Mobile Mode

Features:

- Today-focused itinerary.
- Next reservation or next activity.
- Address, map link, time, and confirmation details.
- Offline-friendly cached view.

### 2. Import Reservations

Supported inputs:

- Booking confirmation emails pasted into AI chat.
- Hotel, restaurant, and activity URLs.
- Calendar event text.

Extracted fields:

- Date and time
- Location
- Confirmation number
- Cancellation notes
- Cost

### 3. Collaboration History

Features:

- Recent changes feed.
- Suggested-by attribution.
- Decision owner.
- Comments or notes per card.

### 4. Reusable Trip Templates

Examples:

- Weekend city break.
- Family ski trip.
- Road trip.
- Theme park vacation.
- International trip checklist.

## Measurement Plan

Track these product metrics once analytics exist:

- Activation: user creates or imports at least five trip items.
- Planning progress: percentage of days with at least one confirmed anchor item.
- Readiness: number of unresolved readiness gaps.
- AI usefulness: percentage of AI suggestions applied or partially applied.
- Collaboration: number of suggested-by users represented in the plan.
- Execution: mobile current-day view opens during trip dates.

## Recommended Execution Order

1. Add typed travel cards and standard status handling.
2. Make itinerary day view the default authenticated experience.
3. Expand Trip Readiness and top next actions.
4. Add cost fields and per-day/trip budget summary.
5. Build AI gap summaries and proposed changes review.
6. Turn Ideas Inbox into a decision queue.
7. Add lightweight map-aware warnings.
8. Add current-day mobile mode.

## Near-Term Engineering Notes

- Keep board JSON as the source of truth for now, but formalize card field validation in backend tests.
- Avoid introducing normalized card tables until there is a clear query or collaboration need.
- Keep AI responses structured and versioned so proposed changes can be reviewed safely.
- Add migrations or sanitizers whenever card fields become required.
- Keep Docker/browser smoke validation in the release checklist because production export issues have already surfaced there.
