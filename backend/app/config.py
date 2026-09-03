"""Ring Sentinel Configuration"""
import os
from pathlib import Path

# Database
DB_PATH = os.getenv("RING_SENTINEL_DB", str(Path(__file__).parent.parent.parent / "data" / "ring_sentinel.db"))

# Data Generation
DEFAULT_LEGIT_CUSTOMERS = 500
DEFAULT_FRAUD_RINGS = 10
DEFAULT_RING_SIZE_MIN = 4
DEFAULT_RING_SIZE_MAX = 8

# Detection Thresholds
MIN_CLUSTER_SIZE = 3          # Minimum customers to consider a ring
SHARED_ATTRIBUTE_WEIGHT = {
    "SHARED_DEVICE": 3.0,     # Strong signal
    "SHARED_IP": 2.0,         # Medium signal
    "SHARED_PM": 4.0,         # Very strong signal (same card/UPI)
    "TEMPORAL": 1.0,          # Weak signal alone
}
MIN_EDGE_WEIGHT = 2.0         # Minimum weight for significant edges

# Action Thresholds (tuned for recall)
HIGH_CONFIDENCE = 0.85        # Auto-hold payouts
MEDIUM_CONFIDENCE = 0.65      # Auto-flag + verify
LOW_CONFIDENCE = 0.3          # Log only

# Cost Model (for evaluation)
FP_COST_PER_INSTANCE = 500    # ₹500 friction per false positive
FN_COST_PER_RING = 50000      # ₹50,000 loss per missed ring

# Training
TRAIN_TEST_SPLIT = 0.7        # 70% train, 30% test

# Server
API_HOST = "0.0.0.0"
API_PORT = 8000
