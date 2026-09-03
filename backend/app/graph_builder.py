"""Graph construction from database"""
import networkx as nx
from typing import Dict, List, Set, Tuple
from . import database as db
from .config import SHARED_ATTRIBUTE_WEIGHT
from datetime import timedelta


def build_graph() -> nx.Graph:
    """Build NetworkX graph from database"""
    G = nx.Graph()
    
    customers = db.get_all_customers()
    payment_methods = db.get_all_payment_methods()
    transactions = db.get_all_transactions()
    
    # Build lookup maps
    pm_by_customer = {}
    for pm in payment_methods:
        pm_by_customer.setdefault(pm.customer_id, []).append(pm)
    
    txns_by_customer = {}
    for txn in transactions:
        txns_by_customer.setdefault(txn.customer_id, []).append(txn)
    
    # Add customer nodes
    for c in customers:
        G.add_node(
            f"C:{c.id}",
            type="customer",
            id=c.id,
            name=c.name,
            is_fraud=c.is_fraud,
            device_fingerprint=c.device_fingerprint,
            ip_hash=c.ip_hash,
            created_at=c.created_at.isoformat()
        )
    
    # Add payment method nodes
    for pm in payment_methods:
        G.add_node(
            f"PM:{pm.id}",
            type="payment_method",
            id=pm.id,
            pm_type=pm.type,
            fingerprint=pm.fingerprint,
            is_fraud=pm.is_fraud
        )
        G.add_edge(
            f"C:{pm.customer_id}",
            f"PM:{pm.id}",
            type="OWNS",
            weight=1.0
        )
    
    # Add transaction edges (customer -> payment method via transaction)
    for txn in transactions:
        if f"PM:{txn.payment_method_id}" in G.nodes:
            # Update PM node with transaction info
            pm_node = G.nodes[f"PM:{txn.payment_method_id}"]
            pm_node.setdefault('transactions', []).append({
                'id': txn.id,
                'amount': txn.amount,
                'type': txn.type,
                'timestamp': txn.timestamp.isoformat()
            })
    
    # --- Add shared attribute edges between customers ---
    # Index by attributes for efficient lookup
    device_index: Dict[str, List[str]] = {}
    ip_index: Dict[str, List[str]] = {}
    pm_fingerprint_index: Dict[str, List[str]] = {}
    time_buckets: Dict[str, List[str]] = {}
    
    for c in customers:
        node_id = f"C:{c.id}"
        
        # Index by device
        device_index.setdefault(c.device_fingerprint, []).append(node_id)
        
        # Index by IP
        ip_index.setdefault(c.ip_hash, []).append(node_id)
        
        # Index by payment method fingerprint
        for pm in pm_by_customer.get(c.id, []):
            pm_fingerprint_index.setdefault(pm.fingerprint, []).append(node_id)
        
        # Time bucket (5-minute windows)
        bucket = c.created_at.replace(second=0, microsecond=0)
        bucket_key = bucket.strftime("%Y-%m-%d %H:%M") + f":{bucket.minute // 5}"
        time_buckets.setdefault(bucket_key, []).append(node_id)
    
    # Add SHARED_DEVICE edges
    for device, nodes in device_index.items():
        if len(nodes) > 1:
            for i in range(len(nodes)):
                for j in range(i + 1, len(nodes)):
                    if G.has_edge(nodes[i], nodes[j]):
                        G[nodes[i]][nodes[j]]['weight'] += SHARED_ATTRIBUTE_WEIGHT['SHARED_DEVICE']
                        G[nodes[i]][nodes[j]]['types'].append('SHARED_DEVICE')
                    else:
                        G.add_edge(
                            nodes[i], nodes[j],
                            type="SHARED_DEVICE",
                            types=["SHARED_DEVICE"],
                            weight=SHARED_ATTRIBUTE_WEIGHT['SHARED_DEVICE']
                        )
    
    # Add SHARED_IP edges
    for ip, nodes in ip_index.items():
        if len(nodes) > 1:
            for i in range(len(nodes)):
                for j in range(i + 1, len(nodes)):
                    if G.has_edge(nodes[i], nodes[j]):
                        G[nodes[i]][nodes[j]]['weight'] += SHARED_ATTRIBUTE_WEIGHT['SHARED_IP']
                        G[nodes[i]][nodes[j]]['types'].append('SHARED_IP')
                    else:
                        G.add_edge(
                            nodes[i], nodes[j],
                            type="SHARED_IP",
                            types=["SHARED_IP"],
                            weight=SHARED_ATTRIBUTE_WEIGHT['SHARED_IP']
                        )
    
    # Add SHARED_PM edges (same card/UPI fingerprint used by different customers)
    for fingerprint, nodes in pm_fingerprint_index.items():
        unique_nodes = list(set(nodes))  # Deduplicate
        if len(unique_nodes) > 1:
            for i in range(len(unique_nodes)):
                for j in range(i + 1, len(unique_nodes)):
                    if G.has_edge(unique_nodes[i], unique_nodes[j]):
                        G[unique_nodes[i]][unique_nodes[j]]['weight'] += SHARED_ATTRIBUTE_WEIGHT['SHARED_PM']
                        G[unique_nodes[i]][unique_nodes[j]]['types'].append('SHARED_PM')
                    else:
                        G.add_edge(
                            unique_nodes[i], unique_nodes[j],
                            type="SHARED_PM",
                            types=["SHARED_PM"],
                            weight=SHARED_ATTRIBUTE_WEIGHT['SHARED_PM']
                        )
    
    # Add TEMPORAL edges (customers created within 120 seconds)
    # Use sorted customers for efficient pairwise check
    sorted_customers = sorted(customers, key=lambda c: c.created_at)
    for i in range(len(sorted_customers)):
        for j in range(i + 1, min(i + 20, len(sorted_customers))):  # Limit window
            ci = sorted_customers[i]
            cj = sorted_customers[j]
            diff = (cj.created_at - ci.created_at).total_seconds()
            if diff > 120:
                break
            ni, nj = f"C:{ci.id}", f"C:{cj.id}"
            if G.has_edge(ni, nj):
                G[ni][nj]['weight'] += SHARED_ATTRIBUTE_WEIGHT['TEMPORAL']
                G[ni][nj]['types'].append('TEMPORAL')
            else:
                G.add_edge(
                    ni, nj,
                    type="TEMPORAL",
                    types=["TEMPORAL"],
                    weight=SHARED_ATTRIBUTE_WEIGHT['TEMPORAL']
                )
    
    return G


def get_graph_data(G: nx.Graph) -> Dict:
    """Convert graph to JSON-serializable format for frontend"""
    nodes = []
    for node_id, attrs in G.nodes(data=True):
        node = {
            'id': node_id,
            'type': attrs.get('type', 'unknown'),
            'label': attrs.get('name', node_id),
            'is_fraud': attrs.get('is_fraud', False),
            'properties': {k: v for k, v in attrs.items()
                          if k not in ('type', 'name', 'is_fraud')}
        }
        nodes.append(node)
    
    edges = []
    for u, v, attrs in G.edges(data=True):
        edge = {
            'source': u,
            'target': v,
            'type': attrs.get('type', 'unknown'),
            'types': attrs.get('types', [attrs.get('type', 'unknown')]),
            'weight': attrs.get('weight', 1.0)
        }
        edges.append(edge)
    
    return {'nodes': nodes, 'edges': edges}
