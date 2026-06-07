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
- [ ] Move or relabel Quick-Add so it clearly adds ideas to Unscheduled.