# Ring Sentinel — Run Doc

## How to Reproduce Artifacts

No build artifacts needed — the frontend is static HTML/CSS/JS served by the Python backend.

Install Python dependencies:
```bash
cd backend
pip install -r requirements.txt
```

## How to Run the Server

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Dashboard: http://localhost:8000/dashboard

### Usage Flow
1. Click **Generate Data** to create synthetic transactions with fraud rings
2. Click **Run Detection** to analyze the graph and find fraud rings
3. Browse tabs: Overview (graph), Detections, Timeline, Economics, Audit Log

### Key Files
- `backend/app/main.py` — FastAPI server with all endpoints
- `backend/app/database.py` — SQLite with WAL mode
- `backend/app/generator.py` — Synthetic data + fraud ring injection
- `backend/app/graph_builder.py` — NetworkX graph construction
- `backend/app/detector.py` — Two-stage detection (community + ML)
- `frontend/` — Static dashboard (HTML/CSS/JS with D3.js and force-graph)
