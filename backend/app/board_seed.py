from __future__ import annotations

from datetime import date, timedelta

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_SEED_CARDS: dict = {
    "card-unscheduled-1": {
        "id": "card-unscheduled-1",
        "title": "Souvenirs & local shops",
        "details": "Check out local shops at Whistler Village and around Capilano.",
        "suggested_by": "Trija",
        "status": "idea",
    },
    "card-unscheduled-2": {
        "id": "card-unscheduled-2",
        "title": "World Cup fan zone or match watch idea",
        "details": "If a match overlaps the trip, shortlist a Vancouver fan zone, pub, or family-friendly watch spot without making soccer the whole plan.",
        "suggested_by": "Dibesh",
        "status": "idea",
        "ai_tag": "World Cup",
    },
    # Day 1 - June 28
    "card-d1-1": {
        "id": "card-d1-1",
        "title": "Depart home -- 9:00 AM",
        "details": "Leave home at 9:00 AM. Pack snacks for the drive. Sea-to-Sky Highway heading north.",
        "status": "booked",
        "start_time": "09:00",
        "location": "Home",
        "ai_tag": "Transport",
        "trip_date": "2026-06-28",
        "suggested_by": "Dad",
    },
    "card-d1-2": {
        "id": "card-d1-2",
        "title": "Squamish coffee stop -- 10:30 AM",
        "details": "Stop in Squamish around 10:30 AM for coffee and a stretch before continuing north.",
        "status": "booked",
        "start_time": "10:30",
        "location": "Squamish",
        "ai_tag": "Food",
        "trip_date": "2026-06-28",
    },
    "card-d1-3": {
        "id": "card-d1-3",
        "title": "Shannon Falls Provincial Park",
        "details": "Short walk to BC's third highest waterfall at 335m. Free entry, easy trail. Allow 45-60 minutes.",
        "status": "booked",
        "start_time": "11:15",
        "location": "Shannon Falls Provincial Park",
        "ai_tag": "Activity",
        "trip_date": "2026-06-28",
        "content_url": "https://bcparks.ca/shannon-falls-park/",
    },
    "card-d1-4": {
        "id": "card-d1-4",
        "title": "Drive to Whistler -- 45 min from Squamish",
        "details": "Continue north on Sea-to-Sky Highway. 45-minute drive from Squamish to Whistler Village.",
        "status": "booked",
        "start_time": "12:15",
        "location": "Sea-to-Sky Highway",
        "ai_tag": "Transport",
        "trip_date": "2026-06-28",
    },
    "card-d1-5": {
        "id": "card-d1-5",
        "title": "Whistler Village -- Lunch, check-in, farmers market",
        "details": "Arrive Whistler Village: lunch at a patio restaurant, hotel check-in, then the Saturday Farmers Market.",
        "status": "booked",
        "start_time": "13:00",
        "location": "Whistler Village",
        "ai_tag": "Lodging",
        "trip_date": "2026-06-28",
    },
    "card-d1-6": {
        "id": "card-d1-6",
        "title": "Whistler Village dinner spots",
        "details": "Find a good restaurant for dinner in Whistler Village.",
        "suggested_by": "Mom",
        "status": "researching",
        "start_time": "18:30",
        "location": "Whistler Village",
        "ai_tag": "Food",
        "trip_date": "2026-06-28",
    },
    # Day 2 - June 29
    "card-d2-1": {
        "id": "card-d2-1",
        "title": "Peak 2 Peak Gondola -- Morning",
        "details": "Morning ride connecting Whistler and Blackcomb mountain peaks. Pre-booked tickets required.",
        "status": "researching",
        "start_time": "09:30",
        "location": "Whistler Blackcomb",
        "ai_tag": "Activity",
        "trip_date": "2026-06-29",
        "content_url": "https://www.whistlerblackcomb.com/explore-the-resort/on-mountain-activities/peak-2-peak-gondola.aspx",
    },
    "card-d2-2": {
        "id": "card-d2-2",
        "title": "Ziplining with Ziptrek Ecotours",
        "details": "Afternoon ziplining. Tours depart from the base of the Whistler Village gondola.",
        "status": "researching",
        "start_time": "13:30",
        "location": "Whistler Village gondola base",
        "ai_tag": "Activity",
        "trip_date": "2026-06-29",
        "content_url": "https://www.ziptrek.com/whistler/",
    },
    "card-d2-3": {
        "id": "card-d2-3",
        "title": "Capilano Suspension Bridge + drive home",
        "details": "Head south to Capilano Suspension Bridge Park in North Vancouver. Allow 2 hours. Then back to Vancouver.",
        "status": "researching",
        "start_time": "16:30",
        "location": "Capilano Suspension Bridge Park",
        "ai_tag": "Activity",
        "trip_date": "2026-06-29",
        "content_url": "https://www.capbridge.com/",
    },
}


def make_default_board(start_date: str, end_date: str) -> dict:
    """Generate a board with one column per trip day, cards distributed by trip_date."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    num_days = (end - start).days + 1

    columns = [{
        "id": "col-unscheduled",
        "title": "Ideas Inbox",
        "cardIds": [],
    }]
    date_to_col: dict[str, str] = {}
    for i in range(num_days):
        day_date = start + timedelta(days=i)
        col_id = f"col-day-{i + 1}"
        month_str = _MONTHS[day_date.month - 1]
        columns.append({
            "id": col_id,
            "title": f"Day {i + 1} \u00b7 {month_str} {day_date.day}",
            "cardIds": [],
        })
        date_to_col[day_date.isoformat()] = col_id

    default_col_id = "col-unscheduled"
    col_index = {col["id"]: idx for idx, col in enumerate(columns)}

    for card_id, card in _SEED_CARDS.items():
        trip_date = card.get("trip_date")
        col_id = date_to_col.get(trip_date, default_col_id) if trip_date else default_col_id
        columns[col_index[col_id]]["cardIds"].append(card_id)

    return {"columns": columns, "cards": _SEED_CARDS}
