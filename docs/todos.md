# Security Improvement Todos

## Future Hardening

- [ ] Replace the single shared MVP credential with real user records and hashed passwords
- [ ] Add server-side session tracking and revocation instead of relying only on a signed username cookie

## UI/UX Improvement Todos

- [x] Compress the header into a utility-focused top area with trip title, signed-in user, trip stats, and logout.
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

- [x] Make the itinerary the primary experience with day tabs, Morning/Afternoon/Evening sections, travel blocks, meal placeholders, and packed-day warnings.
- [ ] Keep Ideas Inbox as the family idea inbox with category grouping, suggested-by visibility, and quick actions to assign, shortlist, or reject ideas.
- [ ] Add map-aware planning with addresses, route order, day map view, and distance/drive-time warnings between activities.
- [x] Replace project-style statuses with travel statuses: Idea, Researching, Shortlisted, Booked, Confirmed, and Skipped.
- [ ] Add a Trip Readiness panel for flights, hotels, transport, bookings, meals, packing, documents, and emergency information.
- [ ] Add family preference signals such as must-do, nice-to-have, not interested, and per-person votes.
- [ ] Make AI actions reviewable and specific: optimize a day, find lunch nearby, create rainy-day alternatives, rebalance crowded days, and apply proposed itinerary changes.
- [ ] Add decision-required fields on cards: owner, deadline, estimated cost, booking required, and reservation link.
- [ ] Add budget awareness with estimated cost per card, per-day totals, booked vs. unbooked costs, and free/paid filtering.
- [ ] Improve phone planning with a compact day-first layout, sticky day switcher, quick add, and tap-to-expand cards.