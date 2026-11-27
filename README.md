# IARA Flight Fare Research

IARA compares model estimates for domestic routes across India and demonstrates the original Stage 3 L7 model on held-out records. The frontend uses React, TypeScript, Vite and CSS Modules. FastAPI runs the archived Python pipeline. The day-sky airplane artwork comes from the supplied mockup.

## Local setup

Use Python 3.12 and Node.js 22 or later. Run these commands in PowerShell from the project root.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm.cmd ci
```

For development, start the API in one terminal and Vite in another. Open [the development app](http://127.0.0.1:5173).

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

To serve the frontend build and API on [port 8000](http://127.0.0.1:8000), stop the development API, build the frontend, then start FastAPI again.

```powershell
npm.cmd run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## Model and archived evidence

The confirmed app model is the fixed Stage 3 L7 Random Forest from `03_Validation_and_Information_Availability.ipynb`. The inference entry point is `backend/research.py::predict`, which calls the saved `L7_rf.joblib` pipeline with this feature order:

1. `Class`
2. `Source`
3. `Destination`
4. `Days_left`
5. `Journey_day`
6. `Duration_in_hours`
7. `Airline`

The archived pipeline uses one-hot encoding with unknown categories ignored, passes the two numeric features through, and returns INR directly. Prediction uses one inference worker for stable tree accumulation order. The parity tests allow an absolute tolerance of ₹0.00000001 for float differences. The API retains model precision and the UI formats currency to two decimals. Row IDs, flight codes, dates and recorded fares are excluded from the model input. The held-out date and flight code are shown as metadata.

The repository includes [the Stage 3 L7 runtime bundle](artifacts/iara-stage3-l7.zip), which a fresh clone places at `artifacts/iara-stage3-l7.zip`. No separate model or dataset download is needed. Its eight members are byte-for-byte copies from the supplied `IARA_stage3_results.zip` (SHA-256 `3694d58137c036d90fb098bbfdd12821e458313d9d78691ae48bc5c8838ea15b`). The bundle contains the model, benchmark, two research manifests, and the L7 validation, calibration, interpolation, and extrapolation exports. To use the original archive, set `IARA_STAGE3_ARCHIVE` to its absolute path in the FastAPI process environment. Load only a trusted archive because joblib deserialization can execute code.

The dataset originates from [Airfare ML: Predicting Flight Fares on Kaggle](https://www.kaggle.com/datasets/yashdharme36/airfare-ml-predicting-flight-fares). The full research notebooks and ZIPs remain separate from the GitHub import. They cover the earlier retrospective benchmark, alternate feature levels, risk and gain models, CatBoost, adaptive policies, EaseMyTrip replication, and cross-dataset comparisons. IARA reports metrics from the selected Stage 3 checkpoint:

| Held-out partition | Examples | MAE (INR) | RMSE (INR) | R² | MAPE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Interpolation, 1–40 days | 35,227 | 3,786.93 | 6,341.30 | 0.9061 | 19.03% |
| Extrapolation, 41–50 days | 88,802 | 2,942.50 | 4,898.24 | 0.9338 | 18.00% |

The archive also contains WAPE, median absolute error, and bias. The interpolation and extrapolation partitions are group-disjoint retrospective evaluations. The source dataset was observed on a single date, 15 January 2023.

## Search scope

- Search uses archived validation, calibration and interpolation flight records. Supported combinations depend on historical coverage across Ahmedabad, Bangalore, Chennai, Delhi, Hyderabad, Kolkata and Mumbai, and across Economy, Premium Economy, Business and First. Search preserves direction and cabin.
- Current-date search uses the date in India at app load. It supplies airline and duration from historical route/cabin/weekday profiles and labels these options as historical references with the archived flight code where present. Their future availability is unknown. Historical replay uses the recorded departure date from the 15 January 2023 snapshot.
- `Days_left` is departure date minus the fixed search date, in calendar days. `Journey_day` is the departure weekday. Search is limited to the fitted 1–40 day horizon. The 41–50 day holdout is available in Research.
- Week and Month use a Monday-to-Sunday week and calendar month respectively, clipped to the supported horizon. Each chart cell and its detail list use the same estimator and option catalog.
- The interactive route map is a schematic across the seven supported cities.

## Google Flights

The default price check opens Google Flights. Observed price and the price difference are empty unless an exact match is returned. A provider may be connected by setting these server environment variables.

| Variable | Purpose |
| --- | --- |
| `IARA_GOOGLE_FLIGHTS_QUOTE_URL` | URL of a normalized provider endpoint |
| `IARA_GOOGLE_FLIGHTS_QUOTE_TOKEN` | Optional bearer token kept on the server |
| `IARA_GOOGLE_FLIGHTS_FARE_BASIS` | Comparable fare basis verified against the original dataset and provider |

The adapter calls the provider with airport codes `origin` and `destination`, ISO `date`, research `cabin`, normalized `flight` code, `currency=INR`, and `fare_basis`. The provider must verify the complete itinerary, including any legs, and return the same fields plus `source: "Google Flights"`, `exact_itinerary: true`, a positive numeric `amount`, and a timezone-aware ISO `observed_at`. Where the provider cannot verify the match, it must return an unavailable result. An airline-level match cannot supply a price. Credentials belong in the FastAPI process environment.

## Missing artifacts and checks

No model artifacts are missing for the implemented app. The raw training CSV and the earlier corrected notebook's exported app bundles were absent from the workspace. Neither is required for Stage 3 inference or held-out evaluation. A Google Flights quote provider, credentials, and verified fare-basis metadata were also absent, so live observed fare matching requires configuration.

Run these commands with port 8000 available. The browser test starts the built app through FastAPI.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm.cmd run build
npx.cmd playwright install chromium
$env:Path = (Resolve-Path .\.venv\Scripts).Path + ';' + $env:Path
npm.cmd run test:browser
```
