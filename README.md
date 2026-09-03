#  Ring Sentinel - Coordinated Fraud Ring Detector

**Track 02: AI Risk Manager** | Defense-only fraud detection with honest metrics

Ring Sentinel detects coordinated abuse rings exploiting merchant promos, referrals, and returns. Unlike traditional transaction-level fraud detectors, it analyzes **relationships between entities** (shared devices, IPs, payment methods, timing) to surface coordinated fraud.

## Demo Video

Watch the full walkthrough of Ring Sentinel in action:

[![Ring Sentinel Demo](https://img.shields.io/badge/Watch-Demo_Video-red?style=for-the-badge&logo=youtube)](https://youtu.be/b_N_ok3SzeQ)

The demo covers:
- Generating synthetic transaction data with injected fraud rings
- Entity relationship graph showing coordinated fraud clusters
- Detection pipeline with pattern classification (Shared Infrastructure, Mule Rotation, Bonus Farming)
- Bounded actions (Hold Payout, Flag & Verify, Log Only)
- Evaluation metrics: Precision, Recall, F1, False-Positive Cost
- Adversarial resilience patterns
- Graceful failure handling


## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Ring Sentinel                           │
├─────────────────────────────────────────────────────────────┤
│  Data Layer: Synthetic generator + ground truth injection   │
│      ↓                                                      │
│  Graph Layer: NetworkX graph with weighted edges            │
│      ↓                                                      │
│  Detection Layer: Connected components + ML scoring         │
│      ↓                                                      │
│  Action Layer: Bounded (flag/throttle, never auto-block)    │
│      ↓                                                      │
│  Audit Layer: Full trail with evidence + timestamps         │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
pip install fastapi uvicorn networkx scikit-learn numpy pydantic
```

### 2. Start the Backend Server

```bash
cd backend
python run.py
```

The server starts on `http://localhost:8000`

### 3. Open the Dashboard

Open `frontend/index.html` in your browser, or visit:
- `http://localhost:8000/dashboard`

### 4. Use the Dashboard

1. Click **"Generate Data"** to create synthetic dataset (556 customers, 10 fraud rings)
2. Click **"Run Detection"** to analyze for fraud rings
3. View detections, metrics, and audit trail

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/generate` | Generate synthetic dataset |
| `GET` | `/api/stats` | Get dataset statistics |
| `GET` | `/api/graph` | Get full transaction graph |
| `POST` | `/api/detect` | Run fraud detection |
| `GET` | `/api/detections` | List all detections |
| `GET` | `/api/evaluation` | Get evaluation metrics |
| `GET` | `/api/audit` | Get audit trail |

## Detection Capabilities

- **Shared Device Detection**: Multiple accounts using same device fingerprint
- **Shared IP Detection**: Coordinated accounts from same network
- **Shared Payment Method**: Same card/UPI across multiple accounts
- **Burst Signup Detection**: All ring members created within 120 seconds
- **Bonus Farming Detection**: Purchase + immediate refund pattern
- **Circular Refund Detection**: Money laundering through connected accounts

## ML Pipeline

1. **Community Detection**: Connected components on weighted graph
2. **Feature Engineering**: 12 features per cluster
3. **Logistic Regression**: Explainable classification (when training data available)
4. **Isolation Forest**: Unsupervised anomaly detection
5. **Rule-Based Fallback**: When only one class in training data
6. **Score Fusion**: 70% classifier + 30% anomaly score

## Bounded Actions

| Confidence | Action | Description |
|------------|--------|-------------|
| ≥90% | `HOLD_PAYOUT` | Auto-hold payout, require review |
| ≥70% | `FLAG_AND_VERIFY` | Auto-flag, request verification |
| <70% | `LOG_ONLY` | Log for monitoring |

**Never auto-blocks. Always provides escalation path to human reviewer.**

## Evaluation Metrics

- **Precision**: % of flagged clusters that are actual fraud rings
- **Recall**: % of fraud rings that were detected
- **F1 Score**: Harmonic mean of precision and recall
- **False-Positive Cost**: ₹500 friction per legit customer flagged
- **False-Negative Cost**: ₹50,000 loss per missed fraud ring
- **Net Savings**: Fraud prevented minus friction costs

## Project Structure

```
ring-sentinel/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Package init
│   │   ├── main.py              # FastAPI application
│   │   ├── models.py            # Pydantic models
│   │   ├── database.py          # SQLite operations
│   │   ├── generator.py         # Synthetic data generator
│   │   ├── graph_builder.py     # NetworkX graph construction
│   │   ├── features.py          # Feature engineering
│   │   ├── detector.py          # ML detection engine
│   │   ├── actions.py           # Bounded actions
│   │   └── evaluator.py         # Metrics computation
│   ├── requirements.txt         # Python dependencies
│   └── run.py                   # Entry point
├── frontend/
│   ├── index.html               # Dashboard layout
│   ├── css/style.css            # Dark theme styling
│   └── js/
│       ├── app.js               # Main application logic
│       ├── graph-viz.js         # D3.js force-directed graph
│       ├── metrics.js           # Metrics display
│       └── audit-log.js         # Audit trail viewer
└── README.md
```

## Tech Stack

- **Backend**: Python, FastAPI, NetworkX, scikit-learn
- **Frontend**: Vanilla JS, D3.js, CSS Grid
- **Database**: SQLite (zero-config)
- **ML**: Logistic Regression + Isolation Forest

## Why Graph-Based Detection?

Traditional fraud detectors analyze individual transactions. Ring Sentinel analyzes **relationships**:

- 40 "different" customers sharing 1 device → **Fraud ring**
- All signed up within 90 seconds → **Coordinated attack**
- 100% refund rate → **Bonus farming**

This is what most teams miss — they build transaction-level classifiers, not relationship-level detectors.

## License

MIT
