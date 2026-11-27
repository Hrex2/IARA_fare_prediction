from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles

from . import research as r
from .quotes import observation

@asynccontextmanager
async def lifespan(_app):
    r.catalog()
    r.metrics()
    r.model()
    yield


app = FastAPI(title="IARA Flight Fare Research", lifespan=lifespan)
Partition = Literal["interpolation", "extrapolation"]


@app.get("/api/config")
def config():
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    catalog = r.catalog()
    return {"today": today, "researchDate": r.BOOKING, "horizon": r.HORIZON,
            "defaultDeparture": today + timedelta(days=12),
            "cities": sorted(set(catalog.Source) | set(catalog.Destination)),
            "cabins": sorted(catalog.Class.unique()), "metrics": r.metrics(), "features": r.FEATURES}


def search_data(origin, destination, cabin, searched, departure, view):
    try:
        options = r.estimate(origin, destination, cabin, searched, departure)
        days = r.calendar(origin, destination, cabin, searched, departure, view) if view != "day" else []
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    return {"options": options, "days": days, "daysLeft": (departure - searched).days}


@app.get("/api/fares")
def fares(origin: str, destination: str, cabin: str, searched: date, departure: date,
          view: Literal["day", "week", "month"] = "day"):
    return search_data(origin, destination, cabin, searched, departure, view)


@app.get("/api/observation")
def quote(origin: str, destination: str, cabin: str, searched: date, departure: date, option: int = 0):
    options = search_data(origin, destination, cabin, searched, departure, "day")["options"]
    if not 0 <= option < len(options):
        return None
    return observation(origin, destination, departure, cabin, options[option])


@app.get("/api/examples")
def examples(response: Response, partition: Partition = "interpolation", random: bool = False,
             query: str = ""):
    response.headers["Cache-Control"] = "no-store"
    data = r.records(partition)
    if query:
        fields = data.row_id.astype(str) + " " + data.Source + " " + data.Destination + " " + data.Flight_code
        data = data[fields.str.contains(query.strip(), case=False, regex=False)]
    selection = data.sample(n=1) if random and len(data) else data.head(25)
    return [r.test_details(row) for row in selection.itertuples()]


@app.post("/api/examples/{row_id}/reveal")
def reveal(row_id: int, partition: Partition = "interpolation"):
    data = r.records(partition)
    example = data[data.row_id == row_id]
    if example.empty:
        raise HTTPException(404, "Held-out example unavailable.")
    model_fare = float(r.predict(example)[0])
    recorded = float(example.actual_fare.iloc[0])
    return {"prediction": model_fare, "recorded": recorded, "difference": model_fare - recorded}


dist = Path(__file__).resolve().parents[1] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
