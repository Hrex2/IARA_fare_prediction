"""Inference and reference catalog for the supplied Stage 3 L7 run."""
import io
import os
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

import joblib
import pandas as pd

DEFAULT_ARCHIVE = Path(__file__).resolve().parents[1] / "artifacts" / "iara-stage3-l7.zip"
ARCHIVE = Path(os.getenv("IARA_STAGE3_ARCHIVE", DEFAULT_ARCHIVE))
FEATURES = ["Class", "Source", "Destination", "Days_left", "Journey_day", "Duration_in_hours", "Airline"]
BOOKING = date(2023, 1, 15)
HORIZON = 40
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
PARTITIONS = ("interpolation", "extrapolation")


@lru_cache(maxsize=1)
def model():
    with ZipFile(ARCHIVE) as archive:
        pipeline = joblib.load(io.BytesIO(archive.read("L7_rf.joblib")))
    # Preserve tree accumulation order across requests, including calendar minima.
    pipeline.named_steps["regressor"].n_jobs = 1
    return pipeline


@lru_cache(maxsize=4)
def records(partition):
    with ZipFile(ARCHIVE) as archive, archive.open(f"L7_{partition}.csv.gz") as member:
        return pd.read_csv(member, compression="gzip", keep_default_na=False, float_precision="round_trip")


def predict(frame):
    return model().predict(frame.loc[:, FEATURES])


@lru_cache(maxsize=1)
def catalog():
    columns = FEATURES + ["Date_of_journey", "Flight_code"]
    frames = [records(partition)[columns] for partition in ("validation", "calibration", "interpolation")]
    return pd.concat(frames, ignore_index=True).drop_duplicates()


@lru_cache(maxsize=128)
def profiles(origin, destination, cabin):
    return catalog().loc[lambda data: (data.Source == origin) & (data.Destination == destination) & (data.Class == cabin)]


def estimate(origin, destination, cabin, searched, departure):
    lead = (departure - searched).days
    if lead < 1 or lead > HORIZON:
        raise ValueError("Choose a departure 1 to 40 days after the search date.")
    profiles_for_route = profiles(origin, destination, cabin)
    if profiles_for_route.empty:
        raise LookupError("No historical options support this route and cabin.")
    weekday = WEEKDAYS[departure.weekday()]
    if searched == BOOKING:
        matches = profiles_for_route[profiles_for_route.Date_of_journey == departure.isoformat()]
    else:
        matches = profiles_for_route[profiles_for_route.Journey_day == weekday]
    matches = matches.drop_duplicates(["Airline", "Flight_code", "Duration_in_hours"]).copy()
    matches["Days_left"] = lead
    if matches.empty:
        return []
    matches["estimate"] = predict(matches)
    return [
        {"airline": row.Airline, "flight": row.Flight_code or None, "duration": row.Duration_in_hours,
         "fare": row.estimate, "referenceDate": row.Date_of_journey}
        for row in matches.sort_values(["estimate", "Airline", "Flight_code", "Duration_in_hours"]).itertuples()
    ]


def calendar(origin, destination, cabin, searched, departure, view):
    if not 1 <= (departure - searched).days <= HORIZON:
        raise ValueError("Choose a departure 1 to 40 days after the search date.")
    if view == "week":
        first = departure - timedelta(days=departure.weekday())
        last = first + timedelta(days=6)
    else:
        first = departure.replace(day=1)
        last = (first.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    first = max(first, searched + timedelta(days=1))
    last = min(last, searched + timedelta(days=HORIZON))
    result = []
    for offset in range((last - first).days + 1):
        day = first + timedelta(days=offset)
        options = estimate(origin, destination, cabin, searched, day)
        result.append({"date": day.isoformat(), "fare": options[0]["fare"] if options else None})
    return result


@lru_cache(maxsize=1)
def metrics():
    with ZipFile(ARCHIVE) as archive, archive.open("benchmark.csv") as member:
        data = pd.read_csv(member)
    return data.loc[(data.level == "L7") & data.partition.isin(PARTITIONS)].to_dict("records")


def test_details(row):
    return {"id": int(row.row_id), "origin": row.Source, "destination": row.Destination, "cabin": row.Class,
            "departure": row.Date_of_journey, "flight": row.Flight_code, "airline": row.Airline,
            "duration": float(row.Duration_in_hours), "days": int(row.Days_left)}
