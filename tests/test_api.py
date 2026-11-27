from datetime import date

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend import quotes, research
from backend.main import app

client = TestClient(app)
SEARCH = {"origin": "Delhi", "destination": "Mumbai", "cabin": "Economy",
          "searched": "2023-01-15", "departure": "2023-01-27"}


@pytest.mark.parametrize("partition", research.PARTITIONS)
def test_full_notebook_parity_and_reported_metrics(partition):
    data = research.records(partition)
    actual = research.predict(data)
    np.testing.assert_allclose(actual, data.predicted_fare, rtol=0, atol=1e-8)
    response = client.get("/api/config").json()
    metric = next(row for row in response["metrics"] if row["partition"] == partition)
    assert metric["records"] == len(data)
    assert metric["MAE"] == pytest.approx(np.abs(actual - data.actual_fare).mean(), abs=1e-8)
    for row in data.iloc[[0, len(data) // 2, -1]].itertuples():
        result = client.post(f"/api/examples/{row.row_id}/reveal", params={"partition": partition}).json()
        assert result["prediction"] == pytest.approx(row.predicted_fare, abs=1e-8, rel=0)
        assert result["recorded"] == row.actual_fare


def test_target_stays_out_of_inference_and_example_payload():
    data = research.records("interpolation").iloc[:10].copy()
    data["actual_fare"] = -123456
    np.testing.assert_array_equal(research.predict(data), research.predict(data[research.FEATURES]))
    assert list(research.model().feature_names_in_) == research.FEATURES
    sample = client.get("/api/examples").json()[0]
    assert not {"actual_fare", "recorded", "prediction", "predicted_fare"} & sample.keys()


@pytest.mark.parametrize("view", ["week", "month"])
def test_each_calendar_price_reproduces_sorted_day_minimum(view):
    response = client.get("/api/fares", params={**SEARCH, "view": view})
    assert response.status_code == 200
    for row in response.json()["days"]:
        result = client.get("/api/fares", params={**SEARCH, "departure": row["date"]}).json()
        lead = (date.fromisoformat(row["date"]) - research.BOOKING).days
        assert result["daysLeft"] == lead
        assert 1 <= lead <= 40
        fares = [option["fare"] for option in result["options"]]
        assert fares == sorted(fares)
        assert row["fare"] == (fares[0] if fares else None)


def test_availability_states(monkeypatch):
    assert client.get("/api/fares", params={**SEARCH, "destination": "Delhi"}).status_code == 404
    assert client.get("/api/fares", params={**SEARCH, "departure": "2023-02-25"}).status_code == 422
    monkeypatch.delenv("IARA_GOOGLE_FLIGHTS_QUOTE_URL", raising=False)
    assert client.get("/api/observation", params=SEARCH).json() is None


def test_observation_accepts_only_exact_matches(monkeypatch):
    monkeypatch.setenv("IARA_GOOGLE_FLIGHTS_QUOTE_URL", "https://example.invalid")
    monkeypatch.setenv("IARA_GOOGLE_FLIGHTS_FARE_BASIS", "one-way-adult-total")
    option = {"flight": "AI-805"}
    called = []

    def provider(url, *, params, headers, timeout):
        called.append(params)
        return quotes.httpx.Response(200, request=quotes.httpx.Request("GET", url),
                                    json={**params, "source": "Google Flights", "exact_itinerary": True,
                                          "amount": 5500, "observed_at": "2026-11-27T09:00:00+05:30"})

    monkeypatch.setattr(quotes.httpx, "get", provider)
    args = ("Delhi", "Mumbai", date(2026, 12, 2), "Economy", option)
    assert quotes.observation(*args)["fare"] == 5500
    assert called[-1]["flight"] == "AI805"

    for key, bad in {"currency": "USD", "cabin": "Business", "fare_basis": "round-trip",
                     "flight": "AI999", "exact_itinerary": False, "observed_at": "2026-11-27"}.items():
        def mismatch(url, *, params, headers, timeout):
            response = provider(url, params=params, headers=headers, timeout=timeout)
            return quotes.httpx.Response(200, request=response.request, json={**response.json(), key: bad})
        monkeypatch.setattr(quotes.httpx, "get", mismatch)
        assert quotes.observation(*args) is None

@pytest.mark.parametrize("view", ["week", "month"])
def test_calendar_estimates_selected_day_once(view, monkeypatch):
    calls = []
    original = research.estimate

    def tracked(*args):
        calls.append(args[-1].isoformat())
        return original(*args)

    monkeypatch.setattr(research, "estimate", tracked)
    response = client.get("/api/fares", params={**SEARCH, "view": view})
    assert response.status_code == 200
    assert calls.count(SEARCH["departure"]) == 1


@pytest.mark.parametrize("replay", [False, True])
def test_skipped_observation_performs_no_inference(monkeypatch, replay):
    monkeypatch.delenv("IARA_GOOGLE_FLIGHTS_QUOTE_URL", raising=False)
    params = {**SEARCH, "searched": "2026-11-01", "departure": "2026-11-12"}
    if replay:
        params = SEARCH
        monkeypatch.setenv("IARA_GOOGLE_FLIGHTS_QUOTE_URL", "https://example.invalid")
        monkeypatch.setenv("IARA_GOOGLE_FLIGHTS_FARE_BASIS", "adult")
    calls = []
    monkeypatch.setattr(research, "estimate", lambda *args: calls.append(args))
    response = client.get("/api/observation", params=params)
    assert response.status_code == 200 and response.json() is None
    assert calls == []
