"""Pydantic models for Ring Sentinel"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class TransactionType(str, Enum):
    PURCHASE = "purchase"
    REFUND = "refund"
    SIGNUP_BONUS = "signup_bonus"


class TransactionStatus(str, Enum):
    COMPLETED = "completed"
    REFUNDED = "refunded"
    FLAGGED = "flagged"
    HELD = "held"


class ActionType(str, Enum):
    HOLD_PAYOUT = "HOLD_PAYOUT"
    FLAG_AND_VERIFY = "FLAG_AND_VERIFY"
    LOG_ONLY = "LOG_ONLY"


class Customer(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    created_at: datetime
    ip_hash: str
    device_fingerprint: str
    is_fraud: bool = False


class PaymentMethod(BaseModel):
    id: str
    type: str  # "card" | "upi"
    fingerprint: str
    customer_id: str
    is_fraud: bool = False


class Transaction(BaseModel):
    id: str
    customer_id: str
    payment_method_id: str
    amount: float
    type: TransactionType
    timestamp: datetime
    status: TransactionStatus = TransactionStatus.COMPLETED


class GraphNode(BaseModel):
    id: str
    type: str  # "customer" | "payment_method" | "device" | "ip"
    label: str
    properties: dict = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "OWNS" | "USES" | "SHARED_DEVICE" | "SHARED_IP" | "SHARED_PM" | "TEMPORAL"
    weight: float = 1.0


class ClusterFeatures(BaseModel):
    cluster_id: str
    customer_ids: List[str]
    shared_device_count: int = 0
    shared_ip_count: int = 0
    shared_pm_count: int = 0
    temporal_edges: int = 0
    cluster_size: int = 0
    avg_refund_ratio: float = 0.0
    avg_transaction_velocity: float = 0.0
    total_amount: float = 0.0
    density: float = 0.0
    avg_degree: float = 0.0
    signup_time_span: float = 0.0
    transaction_time_span: float = 0.0


class Detection(BaseModel):
    id: str
    cluster_id: str
    confidence: float
    action_type: ActionType
    explanation: dict
    evidence: List[str]
    timestamp: datetime
    reviewed: bool = False
    pattern_type: str = "Anomaly Detected"
    pattern_desc: str = ""


class AuditEntry(BaseModel):
    id: str
    detection_id: str
    cluster_id: str
    action_type: ActionType
    confidence: float
    evidence: List[str]
    timestamp: datetime
    reviewer_notes: Optional[str] = None


class EvaluationMetrics(BaseModel):
    precision: float
    recall: float
    f1: float
    false_positive_rate: float
    false_negative_rate: float
    total_fp_cost: float
    total_fn_cost: float
    net_savings: float
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int


class DatasetStats(BaseModel):
    total_customers: int
    legit_customers: int
    fraud_customers: int
    total_transactions: int
    total_payment_methods: int
    fraud_rings: int
    avg_ring_size: float
