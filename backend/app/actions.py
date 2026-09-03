"""Bounded actions: flag, throttle, audit"""
from datetime import datetime
from typing import List, Dict
from .models import Detection, ActionType, AuditEntry
from . import database as db
from .config import HIGH_CONFIDENCE, MEDIUM_CONFIDENCE


def take_action(detection: Detection) -> Dict:
    """Execute bounded action based on detection confidence"""
    action = {
        'detection_id': detection.id,
        'cluster_id': detection.cluster_id,
        'action_type': detection.action_type.value,
        'confidence': detection.confidence,
        'timestamp': datetime.now().isoformat(),
        'details': {}
    }
    
    if detection.action_type == ActionType.HOLD_PAYOUT:
        action['details'] = {
            'message': 'Payout held pending review',
            'reason': 'High-confidence fraud ring detected',
            'escalation': 'AUTO',
            'review_required': True,
            'next_step': 'Merchant reviewer will examine evidence within 24 hours'
        }
    
    elif detection.action_type == ActionType.FLAG_AND_VERIFY:
        action['details'] = {
            'message': 'Accounts flagged, verification required',
            'reason': 'Suspected fraud ring, additional verification needed',
            'escalation': 'AUTO',
            'review_required': True,
            'next_step': 'Customers in cluster will be asked for additional verification'
        }
    
    elif detection.action_type == ActionType.LOG_ONLY:
        action['details'] = {
            'message': 'Logged for monitoring',
            'reason': 'Low-confidence anomaly detected',
            'escalation': 'NONE',
            'review_required': False,
            'next_step': 'Will be included in daily monitoring report'
        }
    
    # Create audit entry
    audit_entry = AuditEntry(
        id=f"AUD-{detection.id}",
        detection_id=detection.id,
        cluster_id=detection.cluster_id,
        action_type=detection.action_type,
        confidence=detection.confidence,
        evidence=detection.evidence,
        timestamp=datetime.now(),
        reviewer_notes=None
    )
    db.insert_audit_entry(audit_entry)
    
    return action


def execute_actions(detections: List[Detection]) -> List[Dict]:
    """Execute actions for all detections"""
    actions = []
    for detection in detections:
        action = take_action(detection)
        actions.append(action)
    return actions
