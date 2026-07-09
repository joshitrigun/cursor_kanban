# Security Improvement Todos

## Future Hardening

- [ ] Replace the single shared MVP credential with real user records and hashed passwords
- [ ] Add server-side session tracking and revocation instead of relying only on a signed username cookie

## UI/UX Improvement Todos

- [x] Compress the header into a utility-focused top area with trip title, signed-in user, trip stats, and logout.
- [ ] Make the day itinerary the default first impression for stakeholder demos instead of opening on the All Days board.
- [ ] Add a pitch-ready trip overview with days planned, essentials covered, decisions needed, bookings missing, and latest activity.
- [ ] Seed a complete realistic 6-day Vancouver/Whistler demo itinerary so empty days do not read as unfinished during stakeholder review.
- [x] Make the day navigation a sticky tab bar with horizontal scroll, selected state, card counts, and finalized badges.
- [ ] Redesign Kanban cards for faster scanning: status chip, category chip, title, time/location line, truncated details, and footer actions.
- [x] Convert Day Plan into a timeline-style itinerary with time on the left, a vertical timeline, and activity cards aligned to it.
- [x] Add day health summary chips, such as booked count, researching count, no lunch, packed day, and finalized.
- [x] Make Unscheduled visually distinct as an inbox for raw ideas before assigning a day.
- [x] Add useful empty states for empty days with prompts to add breakfast, travel, activity, dinner, ask AI, or drag from Unscheduled.
- [x] Strengthen locked/finalized-day affordances across tabs, day plan, and All Days columns.
- [ ] Add a compact mobile-first itinerary view that defaults to the current/today trip day.
- [x] Move or relabel Quick-Add so it clearly adds ideas to the Ideas Inbox.

## Travel Product Improvement Todos

- [x] Use [docs/PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) as the product sequence for MVP Plus, V2, and V3 work.
- [x] MVP Plus: add typed travel cards with a required type field, UI type chip, quick-add inference, persisted-board sanitization, and tests.
- [x] MVP Plus: normalize travel statuses server-side and let users edit card status from the board.
- [x] MVP Plus: expand Trip Readiness into 8-category dashboard with top next actions, driven by card type/status, with pure-function tests.
- [x] V2: add estimated_cost field to cards, per-day cost in day view, trip total and booked/unbooked breakdown in readiness panel, Budget readiness driven by data.
- [x] V2: AI gap summary — summaryOnly flag in AI response, planning analysis badge in chat sidebar, updated system prompt with explicit analysis guidance.
- [x] V2: AI proposed-changes review panel — backend returns proposedBoard without auto-applying; frontend shows diff (added/updated/moved), Apply saves via PUT /api/board, Reject discards.
- [x] Make the itinerary the primary experience with day tabs, Morning/Afternoon/Evening sections, travel blocks, meal placeholders, and packed-day warnings.
- [ ] Keep Ideas Inbox as the family idea inbox with category grouping, suggested-by visibility, and quick actions to assign, shortlist, or reject ideas.
- [x] Turn Ideas Inbox into a decision queue grouped by Food, Activities, World Cup, Logistics, Kid-friendly, and Rainy day.
- [x] Add map-aware planning with addresses, route order, day map view, and distance/drive-time warnings between activities.
- [x] Replace project-style statuses with travel statuses: Idea, Researching, Shortlisted, Booked, Confirmed, and Skipped.
- [x] Expand the Trip Readiness panel beyond the first essentials to include flights, hotels, transport, bookings, meals, packing, documents, and emergency information.
- [x] Add family preference signals such as must-do, nice-to-have, not interested, and per-person votes.
- [x] Make AI actions reviewable and specific: optimize a day, find lunch nearby, create rainy-day alternatives, rebalance crowded days, and apply proposed itinerary changes.
- [x] Add a visible AI proposed-changes review panel with apply/reject controls for stakeholder demos.
- [x] Add decision-required fields on cards: owner, deadline, estimated cost, booking required, and reservation link.
- [x] Add budget awareness with estimated cost per card, per-day totals, booked vs. unbooked costs, and free/paid filtering.
- [ ] Improve phone planning with a compact day-first layout, sticky day switcher, quick add, and tap-to-expand cards.

## Performance Improvement Todos

- [x] Add lightweight backend response timing headers for API and static responses.
- [x] Add frontend performance marks for app load to board visible, login to board visible, and quick-add to card visible.
- [ ] Combine or streamline initial authenticated loading for session, board, trip, and chat history.
- [ ] Profile React re-renders during drag/drop, day tab switching, quick-add, and AI board updates.
- [ ] Split heavy surfaces with lazy loading, especially AI chat and future map/readiness views.
- [ ] Move toward targeted board mutation endpoints before the board grows beyond MVP scale.
- [ ] Add a repeatable Lighthouse or bundle-size check for production builds.