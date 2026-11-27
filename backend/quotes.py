"""Optional normalized Google Flights observation adapter."""
import os
import re
from datetime import datetime
from math import isfinite

import httpx

AIRPORTS = {"Delhi": "DEL", "Mumbai": "BOM", "Bangalore": "BLR", "Hyderabad": "HYD",
            "Chennai": "MAA", "Kolkata": "CCU", "Ahmedabad": "AMD"}


def provider_configured():
    return bool(os.getenv("IARA_GOOGLE_FLIGHTS_QUOTE_URL") and os.getenv("IARA_GOOGLE_FLIGHTS_FARE_BASIS"))


def observation(origin, destination, departure, cabin, option):
    url = os.getenv("IARA_GOOGLE_FLIGHTS_QUOTE_URL")
    basis = os.getenv("IARA_GOOGLE_FLIGHTS_FARE_BASIS")
    if not url or not basis or not option or not option["flight"] or origin not in AIRPORTS or destination not in AIRPORTS:
        return None
    flight = re.sub(r"[\s-]", "", option["flight"]).upper()
    if not re.fullmatch(r"[A-Z0-9]{2}\d+[A-Z]?", flight):
        return None
    expected = {"origin": AIRPORTS[origin], "destination": AIRPORTS[destination], "date": departure.isoformat(),
                "cabin": cabin, "flight": flight, "currency": "INR", "fare_basis": basis}
    token = os.getenv("IARA_GOOGLE_FLIGHTS_QUOTE_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        response = httpx.get(url, params=expected, headers=headers, timeout=4)
        response.raise_for_status()
        quote = response.json()
        if (quote["source"] != "Google Flights" or quote["exact_itinerary"] is not True
                or any(quote.get(key) != value for key, value in expected.items())):
            return None
        stamp = datetime.fromisoformat(quote["observed_at"])
        amount = quote["amount"]
        if stamp.utcoffset() is not None and type(amount) in (int, float) and isfinite(amount) and amount > 0:
            return {"fare": amount, "source": quote["source"], "observedAt": stamp.isoformat()}
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
        return None
    return None
