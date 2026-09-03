#!/usr/bin/env python
"""Ring Sentinel - Pipeline Test Script

This script tests the full detection pipeline end-to-end:
1. Generate synthetic data
2. Build transaction graph
3. Train detection model
4. Run fraud detection
5. Execute bounded actions
6. Evaluate performance
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.generator import generate_dataset
from app import graph_builder
from app.detector import detector
from app.actions import execute_actions
from app.evaluator import evaluate_performance, format_cost_analysis
from app.database import init_db, get_all_detections, get_all_rings


def main():
    print("=" * 60)
    print("[RING] Ring Sentinel - Pipeline Test")
    print("=" * 60)
    print()

    # Step 1: Initialize database
    print("Step 1: Initializing database...")
    init_db()
    print("  [OK] Database initialized")
    print()

    # Step 2: Generate synthetic dataset
    print("Step 2: Generating synthetic dataset...")
    stats = generate_dataset(num_legit=500, num_rings=10)
    print(f"  [OK] Generated {stats['total_customers']} customers")
    print(f"     - {stats['legit_customers']} legitimate")
    print(f"     - {stats['fraud_customers']} fraud ring members")
    print(f"     - {stats['total_transactions']} transactions")
    print(f"     - {stats['fraud_rings']} fraud rings")
    print()

    # Step 3: Build transaction graph
    print("Step 3: Building transaction graph...")
    G = graph_builder.build_graph()
    print(f"  [OK] Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    print()

    # Step 4: Train detection model
    print("Step 4: Training detection model...")
    detector.train(G, stats.get('rings', []))
    print("  [OK] Model trained")
    print()

    # Step 5: Run fraud detection
    print("Step 5: Running fraud detection...")
    detections = detector.detect(G)
    print(f"  [OK] Found {len(detections)} suspect rings")
    print()

    # Step 6: Execute bounded actions
    print("Step 6: Executing bounded actions...")
    actions = execute_actions(detections)
    print(f"  [OK] Executed {len(actions)} actions")
    print()

    # Step 7: Show top detections
    print("=" * 60)
    print("TOP DETECTIONS")
    print("=" * 60)
    for i, d in enumerate(detections[:5], 1):
        print(f"\n{i}. {d.cluster_id}")
        print(f"   Confidence: {d.confidence:.2%}")
        print(f"   Action: {d.action_type.value}")
        print(f"   Evidence:")
        for e in d.evidence[:3]:
            print(f"     - {e}")
    print()

    # Step 8: Evaluate performance
    print("=" * 60)
    print("EVALUATION METRICS")
    print("=" * 60)
    from app import graph_builder as gb
    G_eval = gb.build_graph()
    candidates = detector.find_candidate_rings(G_eval)
    
    ground_truth = {}
    family_cluster_ids = []
    for det in detections:
        cluster_idx = int(det.cluster_id.split('-')[1])
        if cluster_idx < len(candidates):
            cluster = candidates[cluster_idx]
            customer_nodes = [n for n in cluster if G_eval.nodes[n].get('type') == 'customer']
            fraud_count = sum(1 for n in customer_nodes if G_eval.nodes[n].get('is_fraud', False))
            family_count = sum(1 for n in customer_nodes 
                            if G_eval.nodes[n].get('id', '').startswith('CUST-') 
                            and 20000 <= int(G_eval.nodes[n]['id'].split('-')[1]) < 29999)
            ground_truth[det.cluster_id] = fraud_count > family_count
            if family_count > 0 and fraud_count == 0:
                family_cluster_ids.append(det.cluster_id)
    
    cluster_customer_map = {d.cluster_id: [] for d in detections}
    
    metrics = evaluate_performance(detections, ground_truth, cluster_customer_map)
    cost_analysis = format_cost_analysis(metrics)
    
    print(f"  Precision: {metrics.precision:.1%}")
    print(f"  Recall: {metrics.recall:.1%}")
    print(f"  F1 Score: {metrics.f1:.1%}")
    print(f"  False Positive Rate: {metrics.false_positive_rate:.1%}")
    print(f"  False Negative Rate: {metrics.false_negative_rate:.1%}")
    print()
    print(f"  True Positives: {metrics.true_positives}")
    print(f"  False Positives: {metrics.false_positives}")
    print(f"  True Negatives: {metrics.true_negatives}")
    print(f"  False Negatives: {metrics.false_negatives}")
    print()
    fp_cost = str(metrics.total_fp_cost).replace('.', ',')
    fn_cost = str(metrics.total_fn_cost).replace('.', ',')
    print(f"  FP Cost: Rs. {fp_cost}")
    print(f"  FN Cost: Rs. {fn_cost}")
    print(f"  Net Savings: Rs. {str(metrics.net_savings).replace('.', ',')}")
    print()

    # Step 9: Graceful failure case
    print("=" * 60)
    print("GRACEFUL FAILURE CASE")
    print("=" * 60)
    from app.evaluator import generate_failure_case
    failure_case = generate_failure_case(detections, ground_truth, family_cluster_ids)
    print(f"  Scenario: {failure_case.get('scenario', 'N/A')}")
    print(f"  Confidence: {failure_case.get('confidence', 0):.2%}")
    print(f"  Action: {failure_case.get('action', 'N/A')}")
    print(f"  Why downgraded: {failure_case.get('why_downgraded', 'N/A')}")
    print(f"  System response: {failure_case.get('system_response', 'N/A')}")
    print(f"  Demo value: {failure_case.get('demo_value', 'N/A')}")
    print()

    print("=" * 60)
    print("[DONE] PIPELINE TEST COMPLETE")
    print("=" * 60)
    print()
    print("To start the server:")
    print("  cd backend && python run.py")
    print()
    print("Then open http://localhost:8000/dashboard")


if __name__ == "__main__":
    main()
