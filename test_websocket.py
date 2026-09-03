#!/usr/bin/env python
"""WebSocket test client for Ring Sentinel streaming"""

import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

try:
    import websockets
except ImportError:
    print("Installing websockets...")
    os.system("pip install websockets -q")
    import websockets


async def test_streaming():
    uri = "ws://localhost:8000/ws/stream"
    
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        # Send config
        config = {
            "num_legit": 20,
            "num_rings": 2,
            "delay_ms": 10,
            "seed": 42
        }
        await ws.send(json.dumps(config))
        print(f"Sent config: {config}")
        
        # Receive messages
        event_counts = {}
        total_events = 0
        
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=30)
                data = json.loads(msg)
                event_type = data.get('type', 'unknown')
                event_counts[event_type] = event_counts.get(event_type, 0) + 1
                total_events += 1
                
                if event_type == 'stream_start':
                    print(f"  [{event_type}] {data.get('message', '')}")
                elif event_type == 'customer':
                    c = data.get('data', {})
                    fraud_tag = " [FRAUD]" if c.get('is_fraud') else ""
                    print(f"  [{event_type}] {c.get('id', '?')}: {c.get('name', '?')}{fraud_tag}")
                elif event_type == 'ring_start':
                    r = data.get('data', {})
                    print(f"  [{event_type}] {r.get('ring_id', '?')}: {r.get('patterns', [])}")
                elif event_type == 'detection':
                    d = data.get('data', {})
                    print(f"  [{event_type}] {d.get('cluster_id', '?')}: {d.get('confidence', 0):.2f} -> {d.get('action_type', '?')}")
                elif event_type == 'stream_complete':
                    s = data.get('data', {})
                    print(f"  [{event_type}] {s.get('total_customers', 0)} customers, {s.get('total_transactions', 0)} txns, {s.get('total_detections', 0)} detections")
                elif event_type == 'error':
                    print(f"  [{event_type}] {data.get('message', '?')}")
                    break
                
                if event_type == 'stream_complete':
                    break
                    
            except asyncio.TimeoutError:
                print("Timeout waiting for message")
                break
        
        print(f"\nSummary: {total_events} events received")
        for etype, count in sorted(event_counts.items()):
            print(f"  {etype}: {count}")


if __name__ == "__main__":
    asyncio.run(test_streaming())
