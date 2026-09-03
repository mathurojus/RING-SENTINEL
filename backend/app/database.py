"""SQLite database for Ring Sentinel"""
import sqlite3
from datetime import datetime
from typing import List, Dict, Any
from pathlib import Path
import json
from .config import DB_PATH
from .models import Customer, PaymentMethod, Transaction, Detection, AuditEntry


def get_connection():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
            phone TEXT NOT NULL, created_at TEXT NOT NULL, ip_hash TEXT NOT NULL,
            device_fingerprint TEXT NOT NULL, is_fraud INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS payment_methods (
            id TEXT PRIMARY KEY, type TEXT NOT NULL, fingerprint TEXT NOT NULL,
            customer_id TEXT NOT NULL, is_fraud INTEGER DEFAULT 0,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY, customer_id TEXT NOT NULL,
            payment_method_id TEXT NOT NULL, amount REAL NOT NULL,
            type TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT DEFAULT "completed",
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
        );
        CREATE TABLE IF NOT EXISTS detections (
            id TEXT PRIMARY KEY, cluster_id TEXT NOT NULL, confidence REAL NOT NULL,
            action_type TEXT NOT NULL, explanation TEXT NOT NULL, evidence TEXT NOT NULL,
            timestamp TEXT NOT NULL, reviewed INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY, detection_id TEXT NOT NULL, cluster_id TEXT NOT NULL,
            action_type TEXT NOT NULL, confidence REAL NOT NULL, evidence TEXT NOT NULL,
            timestamp TEXT NOT NULL, reviewer_notes TEXT,
            FOREIGN KEY (detection_id) REFERENCES detections(id)
        );
        CREATE TABLE IF NOT EXISTS rings (
            id TEXT PRIMARY KEY, pattern TEXT NOT NULL, member_count INTEGER NOT NULL
        );
    """)
    conn.commit()
    conn.close()


def insert_customer(customer):
    conn = get_connection()
    conn.execute("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (customer.id, customer.name, customer.email, customer.phone,
         customer.created_at.isoformat(), customer.ip_hash,
         customer.device_fingerprint, int(customer.is_fraud)))
    conn.commit()
    conn.close()


def _row_to_customer(r):
    return Customer(
        id=r["id"], name=r["name"], email=r["email"], phone=r["phone"],
        created_at=datetime.fromisoformat(r["created_at"]),
        ip_hash=r["ip_hash"], device_fingerprint=r["device_fingerprint"],
        is_fraud=bool(r["is_fraud"])
    )


def get_all_customers():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM customers").fetchall()
    conn.close()
    return [_row_to_customer(r) for r in rows]


def find_customers_with_device(device_fingerprint):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM customers WHERE device_fingerprint = ?",
        (device_fingerprint,)).fetchall()
    conn.close()
    return [_row_to_customer(r) for r in rows]


def find_customers_near_time(created_at, window_seconds=120):
    from datetime import timedelta
    start = created_at - timedelta(seconds=window_seconds)
    end = created_at + timedelta(seconds=window_seconds)
    conn = get_connection()
    rows = conn.execute("SELECT * FROM customers WHERE created_at BETWEEN ? AND ?",
        (start.isoformat(), end.isoformat())).fetchall()
    conn.close()
    return [_row_to_customer(r) for r in rows]


def insert_payment_method(pm):
    conn = get_connection()
    conn.execute("INSERT INTO payment_methods VALUES (?, ?, ?, ?, ?)",
        (pm.id, pm.type, pm.fingerprint, pm.customer_id, int(pm.is_fraud)))
    conn.commit()
    conn.close()


def get_all_payment_methods():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM payment_methods").fetchall()
    conn.close()
    return [PaymentMethod(id=r["id"], type=r["type"], fingerprint=r["fingerprint"],
        customer_id=r["customer_id"], is_fraud=bool(r["is_fraud"])) for r in rows]


def get_payment_methods_for_customer(customer_id):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM payment_methods WHERE customer_id = ?",
        (customer_id,)).fetchall()
    conn.close()
    return [PaymentMethod(id=r["id"], type=r["type"], fingerprint=r["fingerprint"],
        customer_id=r["customer_id"], is_fraud=bool(r["is_fraud"])) for r in rows]


def insert_transaction(txn):
    conn = get_connection()
    t = txn.type.value if hasattr(txn.type, "value") else txn.type
    s = txn.status.value if hasattr(txn.status, "value") else txn.status
    conn.execute("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?)",
        (txn.id, txn.customer_id, txn.payment_method_id, txn.amount,
         t, txn.timestamp.isoformat(), s))
    conn.commit()
    conn.close()


def get_all_transactions():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM transactions").fetchall()
    conn.close()
    return [Transaction(id=r["id"], customer_id=r["customer_id"],
        payment_method_id=r["payment_method_id"], amount=r["amount"],
        type=r["type"], timestamp=datetime.fromisoformat(r["timestamp"]),
        status=r["status"]) for r in rows]


def get_transactions_for_customer(customer_id):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM transactions WHERE customer_id = ?",
        (customer_id,)).fetchall()
    conn.close()
    return [Transaction(id=r["id"], customer_id=r["customer_id"],
        payment_method_id=r["payment_method_id"], amount=r["amount"],
        type=r["type"], timestamp=datetime.fromisoformat(r["timestamp"]),
        status=r["status"]) for r in rows]


def insert_ring(ring_id, pattern, member_count):
    conn = get_connection()
    conn.execute("INSERT INTO rings VALUES (?, ?, ?)", (ring_id, pattern, member_count))
    conn.commit()
    conn.close()


def get_all_rings():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM rings").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_detection(detection):
    conn = get_connection()
    a = detection.action_type.value if hasattr(detection.action_type, "value") else detection.action_type
    explanation_with_pattern = dict(detection.explanation) if isinstance(detection.explanation, dict) else {}
    explanation_with_pattern['pattern_type'] = getattr(detection, 'pattern_type', 'Anomaly Detected')
    explanation_with_pattern['pattern_desc'] = getattr(detection, 'pattern_desc', '')
    conn.execute("INSERT INTO detections VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (detection.id, detection.cluster_id, detection.confidence,
         a, json.dumps(explanation_with_pattern), json.dumps(detection.evidence),
         detection.timestamp.isoformat(), int(detection.reviewed)))
    conn.commit()
    conn.close()


class SimpleDet:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def get_all_detections():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM detections").fetchall()
    conn.close()
    results = []
    for r in rows:
        expl = json.loads(r["explanation"])
        sd = SimpleDet(
            id=r["id"], cluster_id=r["cluster_id"], confidence=r["confidence"],
            action_type=r["action_type"], explanation=expl,
            evidence=json.loads(r["evidence"]),
            timestamp=datetime.fromisoformat(r["timestamp"]),
            reviewed=bool(r["reviewed"]),
            pattern_type=expl.get("pattern_type", "Anomaly Detected"),
            pattern_desc=expl.get("pattern_desc", "")
        )
        results.append(sd)
    return results


def insert_audit_entry(entry):
    conn = get_connection()
    a = entry.action_type.value if hasattr(entry.action_type, "value") else entry.action_type
    conn.execute("INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (entry.id, entry.detection_id, entry.cluster_id,
         a, entry.confidence, json.dumps(entry.evidence),
         entry.timestamp.isoformat(), entry.reviewer_notes))
    conn.commit()
    conn.close()


def get_all_audit_entries():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM audit_log ORDER BY timestamp DESC").fetchall()
    conn.close()
    return [SimpleDet(
        id=r["id"], detection_id=r["detection_id"],
        cluster_id=r["cluster_id"], action_type=r["action_type"],
        confidence=r["confidence"], evidence=json.loads(r["evidence"]),
        timestamp=datetime.fromisoformat(r["timestamp"]),
        reviewer_notes=r["reviewer_notes"]
    ) for r in rows]


def get_dataset_stats():
    conn = get_connection()
    tc = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
    fc = conn.execute("SELECT COUNT(*) FROM customers WHERE is_fraud = 1").fetchone()[0]
    tt = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    tp = conn.execute("SELECT COUNT(*) FROM payment_methods").fetchone()[0]
    tr = conn.execute("SELECT COUNT(*) FROM rings").fetchone()[0]
    ar = conn.execute("SELECT AVG(member_count) FROM rings").fetchone()[0] if tr > 0 else 0
    conn.close()
    
    # Merchant Risk Score (0-100)
    # Factors: fraud ratio, ring density, ring size, transaction exposure
    fraud_ratio = fc / max(tc, 1)
    ring_density = tr / max(tc, 1)
    avg_ring = ar or 0
    
    # Score components (each 0-1)
    c1 = min(fraud_ratio * 10, 1.0)          # fraud customer ratio (10% fraud = max)
    c2 = min(ring_density * 50, 1.0)         # ring density (2% = max)
    c3 = min((avg_ring - 3) / 7, 1.0)       # ring size above 3
    c4 = min(tr / 10, 1.0)                   # number of rings (10 = max)
    
    risk_score = round((c1 * 35 + c2 * 25 + c3 * 15 + c4 * 25) * 100)
    risk_score = max(0, min(100, risk_score))
    
    # Risk level label
    if risk_score >= 70:
        risk_level = "CRITICAL"
    elif risk_score >= 40:
        risk_level = "HIGH"
    elif risk_score >= 20:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    return {
        "total_customers": tc, "legit_customers": tc - fc,
        "fraud_customers": fc, "total_transactions": tt,
        "total_payment_methods": tp, "fraud_rings": tr,
        "avg_ring_size": ar or 0,
        "merchant_risk_score": risk_score,
        "risk_level": risk_level
    }


def clear_all():
    init_db()
    conn = get_connection()
    conn.executescript("""
        DELETE FROM audit_log; DELETE FROM detections; DELETE FROM transactions;
        DELETE FROM payment_methods; DELETE FROM customers; DELETE FROM rings;
    """)
    conn.commit()
    conn.close()
