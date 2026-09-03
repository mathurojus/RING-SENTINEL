"""Feature engineering for fraud ring detection"""
import networkx as nx
from typing import List, Dict, Any
from datetime import datetime
from . import database as db
from .models import ClusterFeatures


def count_edges_of_type(G: nx.Graph, nodes: set, edge_type: str) -> int:
    """Count edges of a specific type within a set of nodes"""
    count = 0
    for u, v, attrs in G.edges(data=True):
        if u in nodes and v in nodes:
            types = attrs.get('types', [attrs.get('type', '')])
            if edge_type in types:
                count += 1
    return count


def compute_refund_ratio(G: nx.Graph, customer_nodes: List[str]) -> float:
    """Compute average refund ratio for customers in cluster"""
    ratios = []
    for node_id in customer_nodes:
        node_attrs = G.nodes[node_id]
        # Get transactions from payment method nodes connected to this customer
        refund_count = 0
        total_count = 0
        for neighbor in G.neighbors(node_id):
            if G.nodes[neighbor].get('type') == 'payment_method':
                txns = G.nodes[neighbor].get('transactions', [])
                for txn in txns:
                    total_count += 1
                    if txn.get('type') == 'refund':
                        refund_count += 1
        if total_count > 0:
            ratios.append(refund_count / total_count)
    
    return sum(ratios) / len(ratios) if ratios else 0.0


def compute_velocity(G: nx.Graph, customer_nodes: List[str]) -> float:
    """Compute average transaction velocity (transactions per day)"""
    velocities = []
    for node_id in customer_nodes:
        node_attrs = G.nodes[node_id]
        created_at = datetime.fromisoformat(node_attrs.get('created_at', datetime.now().isoformat()))
        
        # Get all transactions for this customer
        txn_count = 0
        first_txn = None
        last_txn = None
        
        for neighbor in G.neighbors(node_id):
            if G.nodes[neighbor].get('type') == 'payment_method':
                txns = G.nodes[neighbor].get('transactions', [])
                for txn in txns:
                    txn_count += 1
                    txn_time = datetime.fromisoformat(txn.get('timestamp', datetime.now().isoformat()))
                    if first_txn is None or txn_time < first_txn:
                        first_txn = txn_time
                    if last_txn is None or txn_time > last_txn:
                        last_txn = txn_time
        
        if txn_count > 1 and first_txn and last_txn:
            days = max((last_txn - first_txn).total_seconds() / 86400, 1)
            velocities.append(txn_count / days)
        elif txn_count == 1:
            velocities.append(1.0)
    
    return sum(velocities) / len(velocities) if velocities else 0.0


def compute_total_amount(G: nx.Graph, customer_nodes: List[str]) -> float:
    """Compute total transaction amount for cluster"""
    total = 0.0
    for node_id in customer_nodes:
        for neighbor in G.neighbors(node_id):
            if G.nodes[neighbor].get('type') == 'payment_method':
                txns = G.nodes[neighbor].get('transactions', [])
                for txn in txns:
                    total += txn.get('amount', 0)
    return total


def compute_signup_span(customer_nodes: List[str], G: nx.Graph) -> float:
    """Compute time span between first and last customer signup in seconds"""
    times = []
    for node_id in customer_nodes:
        node_attrs = G.nodes[node_id]
        created_at = datetime.fromisoformat(node_attrs.get('created_at', datetime.now().isoformat()))
        times.append(created_at)
    
    if len(times) < 2:
        return 0.0
    
    times.sort()
    return (times[-1] - times[0]).total_seconds()


def compute_transaction_span(customer_nodes: List[str], G: nx.Graph) -> float:
    """Compute time span between first and last transaction in seconds"""
    times = []
    for node_id in customer_nodes:
        for neighbor in G.neighbors(node_id):
            if G.nodes[neighbor].get('type') == 'payment_method':
                txns = G.nodes[neighbor].get('transactions', [])
                for txn in txns:
                    txn_time = datetime.fromisoformat(txn.get('timestamp', datetime.now().isoformat()))
                    times.append(txn_time)
    
    if len(times) < 2:
        return 0.0
    
    times.sort()
    return (times[-1] - times[0]).total_seconds()


def compute_cluster_features(G: nx.Graph, cluster: set, cluster_id: str) -> ClusterFeatures:
    """Compute features for a candidate cluster"""
    customer_nodes = [n for n in cluster if G.nodes[n].get('type') == 'customer']
    
    # Build subgraph for density calculation
    H = G.subgraph(cluster)
    
    features = ClusterFeatures(
        cluster_id=cluster_id,
        customer_ids=customer_nodes,
        
        # Shared attribute density
        shared_device_count=count_edges_of_type(G, cluster, 'SHARED_DEVICE'),
        shared_ip_count=count_edges_of_type(G, cluster, 'SHARED_IP'),
        shared_pm_count=count_edges_of_type(G, cluster, 'SHARED_PM'),
        temporal_edges=count_edges_of_type(G, cluster, 'TEMPORAL'),
        
        # Cluster size
        cluster_size=len(customer_nodes),
        
        # Transaction patterns
        avg_refund_ratio=compute_refund_ratio(G, customer_nodes),
        avg_transaction_velocity=compute_velocity(G, customer_nodes),
        total_amount=compute_total_amount(G, customer_nodes),
        
        # Graph metrics
        density=nx.density(H) if len(H) > 1 else 0.0,
        avg_degree=sum(dict(H.degree()).values()) / len(H) if len(H) > 0 else 0.0,
        
        # Timing
        signup_time_span=compute_signup_span(customer_nodes, G),
        transaction_time_span=compute_transaction_span(customer_nodes, G),
    )
    
    return features


def features_to_vector(features: ClusterFeatures) -> List[float]:
    """Convert features to numeric vector for ML model"""
    return [
        features.shared_device_count,
        features.shared_ip_count,
        features.shared_pm_count,
        features.temporal_edges,
        features.cluster_size,
        features.avg_refund_ratio,
        features.avg_transaction_velocity,
        features.total_amount,
        features.density,
        features.avg_degree,
        features.signup_time_span,
        features.transaction_time_span,
    ]


FEATURE_NAMES = [
    'shared_device_count',
    'shared_ip_count',
    'shared_pm_count',
    'temporal_edges',
    'cluster_size',
    'avg_refund_ratio',
    'avg_transaction_velocity',
    'total_amount',
    'density',
    'avg_degree',
    'signup_time_span',
    'transaction_time_span',
]
