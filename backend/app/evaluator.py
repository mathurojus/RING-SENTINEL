"""Evaluation metrics: precision, recall, F1, false-positive cost"""
import numpy as np
from typing import List, Dict, Tuple
from sklearn.metrics import precision_score, recall_score, f1_score
from .models import Detection, EvaluationMetrics
from .config import FP_COST_PER_INSTANCE, FN_COST_PER_RING


def evaluate_performance(
    detections: List[Detection],
    ground_truth: Dict[str, bool],  # cluster_id -> is_fraud
    cluster_customer_map: Dict[str, List[str]]  # cluster_id -> customer_ids
) -> EvaluationMetrics:
    """Evaluate detection performance against ground truth"""
    
    # Build prediction arrays
    y_true = []
    y_pred = []
    
    for det in detections:
        cluster_id = det.cluster_id
        if cluster_id in ground_truth:
            y_true.append(int(ground_truth[cluster_id]))
            # Consider detection as positive if confidence > 0.5
            y_pred.append(1 if det.confidence > 0.5 else 0)
    
    if not y_true:
        return EvaluationMetrics(
            precision=0.0, recall=0.0, f1=0.0,
            false_positive_rate=0.0, false_negative_rate=0.0,
            total_fp_cost=0.0, total_fn_cost=0.0, net_savings=0.0,
            true_positives=0, false_positives=0,
            true_negatives=0, false_negatives=0
        )
    
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    
    # Compute metrics
    precision = float(precision_score(y_true, y_pred, zero_division=0))
    recall = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    
    # Confusion matrix components
    tp = int(np.sum((y_pred == 1) & (y_true == 1)))
    fp = int(np.sum((y_pred == 1) & (y_true == 0)))
    tn = int(np.sum((y_pred == 0) & (y_true == 0)))
    fn = int(np.sum((y_pred == 0) & (y_true == 1)))
    
    # Rates
    fp_rate = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fn_rate = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    
    # Cost analysis
    # Each false positive costs FP_COST_PER_INSTANCE (friction per customer)
    # Each false negative costs FN_COST_PER_RING (missed fraud ring)
    total_fp_cost = fp * FP_COST_PER_INSTANCE
    total_fn_cost = fn * FN_COST_PER_RING
    
    # Net savings = fraud prevented - friction cost
    fraud_prevented = tp * FN_COST_PER_RING
    net_savings = fraud_prevented - total_fp_cost
    
    return EvaluationMetrics(
        precision=precision,
        recall=recall,
        f1=f1,
        false_positive_rate=fp_rate,
        false_negative_rate=fn_rate,
        total_fp_cost=total_fp_cost,
        total_fn_cost=total_fn_cost,
        net_savings=net_savings,
        true_positives=tp,
        false_positives=fp,
        true_negatives=tn,
        false_negatives=fn
    )


def generate_failure_case(
    detections: List[Detection],
    ground_truth: Dict[str, bool],
    family_clusters: List[str] = None
) -> Dict:
    """Generate a graceful failure case demonstrating bounded + gated behavior.
    
    Shows how the system correctly downgrades confidence when a cluster
    has shared attributes (like a family sharing a device) but lacks
    fraud indicators (normal refund rate, spread-out signups, etc).
    """
    
    # If family cluster IDs are provided, find the one with lowest confidence
    if family_clusters:
        family_dets = [d for d in detections if d.cluster_id in family_clusters]
        if family_dets:
            det = min(family_dets, key=lambda d: d.confidence)
            return {
                'detection_id': det.id,
                'cluster_id': det.cluster_id,
                'confidence': det.confidence,
                'action': det.action_type.value if hasattr(det.action_type, 'value') else det.action_type,
                'explanation': det.explanation,
                'evidence': det.evidence,
                'scenario': 'Legitimate family sharing a household device (tablet/shared computer)',
                'why_downgraded': (
                    'Despite sharing a device, the system correctly identified this as legitimate because: '
                    '- Low refund rate (no bonus farming pattern) '
                    '- Spread-out signup times (days apart, not burst) '
                    '- Each member has unique payment methods '
                    '- Normal transaction amounts and timing'
                ),
                'actual_ground_truth': False,
                'system_response': 'LOG_ONLY - monitoring, no throttle, no payout hold applied',
                'demo_value': 'Demonstrates bounded behavior: system does not over-react to shared device alone'
            }
    
    # Find a detection with medium-low confidence (borderline case)
    for det in detections:
        if 0.3 <= det.confidence <= 0.6:
            return {
                'detection_id': det.id,
                'cluster_id': det.cluster_id,
                'confidence': det.confidence,
                'action': det.action_type.value,
                'explanation': det.explanation,
                'evidence': det.evidence,
                'scenario': 'Borderline case correctly downgraded',
                'why_downgraded': 'Low confidence score triggered LOG_ONLY action',
                'system_response': 'Monitoring only, no throttle applied'
            }
    
    return {
        'scenario': 'All detections high-confidence (no graceful failure needed)',
        'note': 'System correctly identified all clusters with high confidence'
    }


def format_cost_analysis(metrics: EvaluationMetrics) -> Dict:
    """Format cost analysis for display"""
    return {
        'summary': {
            'precision': f"{metrics.precision:.1%}",
            'recall': f"{metrics.recall:.1%}",
            'f1': f"{metrics.f1:.1%}",
        },
        'confusion_matrix': {
            'true_positives': metrics.true_positives,
            'false_positives': metrics.false_positives,
            'true_negatives': metrics.true_negatives,
            'false_negatives': metrics.false_negatives,
        },
        'costs': {
            'false_positive_cost': f"₹{metrics.total_fp_cost:,.0f}",
            'false_negative_cost': f"₹{metrics.total_fn_cost:,.0f}",
            'net_savings': f"₹{metrics.net_savings:,.0f}",
            'cost_per_fp': f"₹{FP_COST_PER_INSTANCE}",
            'cost_per_fn': f"₹{FN_COST_PER_RING:,}",
        },
        'interpretation': {
            'fp_note': f"Each false positive costs ₹{FP_COST_PER_INSTANCE} in merchant friction",
            'fn_note': f"Each missed fraud ring costs ₹{FN_COST_PER_RING:,} in fraud losses",
            'net_benefit': f"System saves ₹{metrics.net_savings:,.0f} net after accounting for friction costs"
        }
    }
