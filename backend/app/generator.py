"""Synthetic data generator with fraud ring injection"""
import random
import hashlib
from datetime import datetime, timedelta
from typing import List, Tuple
from .models import Customer, PaymentMethod, Transaction, TransactionType
from . import database as db

FIRST_NAMES = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna",
    "Ishaan", "Shaurya", "Atharv", "Diya", "Ananya", "Priya", "Kavya",
    "Aanya", "Aadhya", "Navya", "Prisha", "Riya", "Anvi", "Rahul",
    "Amit", "Vikram", "Sanjay", "Deepak", "Rohan", "Karan", "Nikhil",
    "Pooja", "Neha", "Sneha", "Divya", "Meera", "Kavita", "Sunita",
    "Rajesh", "Suresh", "Mahesh", "Ramesh", "Ganesh", "Hitesh"]
LAST_NAMES = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy",
    "Nair", "Iyer", "Mishra", "Pandey", "Tiwari", "Joshi", "Das",
    "Banerjee", "Mukherjee", "Chatterjee", "Ghosh", "Roy", "Sinha",
    "Malhotra", "Kapoor", "Chopra", "Mehta", "Shah", "Rao", "Krishnan"]

def _hash(text): return hashlib.sha256(text.encode()).hexdigest()[:16]
def _random_ip(): return f"{random.randint(1,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
def _random_device(): return _hash(f"device-{random.randint(10000,99999)}")
def _random_uoi():
    providers = ["paytm","okicici","oksbi","ybl","axl","ibl"]
    return f"{random.randint(10000,99999)}@{random.choice(providers)}"
def _random_card_fingerprint(): return _hash(f"card-{random.randint(100000,999999)}")
def _random_phone(): return f"+91{random.randint(6000000000,9999999999)}"
def _random_email(name):
    domains = ["gmail.com","yahoo.com","outlook.com"]
    clean = name.lower().replace(" ",".")
    return f"{clean}{random.randint(1,999)}@{random.choice(domains)}"

def _create_legit_customer(index, base_time):
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    return Customer(id=f"CUST-{index:04d}", name=f"{first} {last}",
        email=_random_email(first+last), phone=_random_phone(),
        created_at=base_time+timedelta(days=random.randint(0,90),hours=random.randint(0,23),minutes=random.randint(0,59)),
        ip_hash=_hash(_random_ip()), device_fingerprint=_random_device(), is_fraud=False)

def _create_legit_transaction(customer, pm, base_time, index):
    txn_type = random.choices([TransactionType.PURCHASE,TransactionType.REFUND],weights=[0.9,0.1])[0]
    return Transaction(id=f"TXN-{index:06d}", customer_id=customer.id,
        payment_method_id=pm.id, amount=round(random.uniform(100,5000),2),
        type=txn_type, timestamp=customer.created_at+timedelta(days=random.randint(0,30),hours=random.randint(0,23)),
        status="completed")

def _create_fraud_ring(ring_index, ring_size, base_time, patterns, start_counter=100000):
    ring_id = f"RING-{ring_index:03d}"
    shared_device = _random_device()
    shared_ip = _hash(_random_ip())
    shared_upi = _random_uoi()
    shared_card = _random_card_fingerprint()
    ring_start = base_time + timedelta(days=random.randint(0, 30))
    customers, payment_methods, transactions = [], [], []
    txn_counter = start_counter + ring_index * 1000
    for i in range(ring_size):
        member_index = 10000 + ring_index * 100 + i
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        device = shared_device if "shared_device" in patterns else _random_device()
        ip = shared_ip if "shared_ip" in patterns else _hash(_random_ip())
        signup_time = ring_start + timedelta(seconds=i * random.randint(5, 25))
        customer = Customer(id=f"CUST-{member_index:04d}", name=f"{first} {last}",
            email=_random_email(first+last), phone=_random_phone(),
            created_at=signup_time, ip_hash=ip, device_fingerprint=device, is_fraud=True)
        customers.append(customer)
        pm_type = "upi" if "shared_pm" in patterns else random.choice(["card","upi"])
        pm_fp = shared_upi if (pm_type=="upi" and "shared_pm" in patterns) else shared_card if (pm_type=="card" and "shared_pm" in patterns) else _random_card_fingerprint() if pm_type=="card" else _random_uoi()
        pm = PaymentMethod(id=f"PM-{member_index:04d}", type=pm_type, fingerprint=pm_fp, customer_id=customer.id, is_fraud=True)
        payment_methods.append(pm)
        if "bonus_farming" in patterns:
            purchase = Transaction(id=f"TXN-{txn_counter:06d}", customer_id=customer.id,
                payment_method_id=pm.id, amount=999.0, type=TransactionType.PURCHASE,
                timestamp=signup_time+timedelta(minutes=random.randint(1,10)), status="completed")
            transactions.append(purchase)
            txn_counter += 1
            refund = Transaction(id=f"TXN-{txn_counter:06d}", customer_id=customer.id,
                payment_method_id=pm.id, amount=999.0, type=TransactionType.REFUND,
                timestamp=purchase.timestamp+timedelta(minutes=random.randint(5,30)), status="refunded")
            transactions.append(refund)
            txn_counter += 1
        if "circular_refund" in patterns and i < ring_size - 1:
            ct = Transaction(id=f"TXN-{txn_counter:06d}", customer_id=customer.id,
                payment_method_id=pm.id, amount=random.uniform(500,2000), type=TransactionType.PURCHASE,
                timestamp=signup_time+timedelta(hours=random.randint(1,6)), status="completed")
            transactions.append(ct)
            txn_counter += 1
        if "correlated_timing" in patterns:
            for j in range(random.randint(1,3)):
                tt = Transaction(id=f"TXN-{txn_counter:06d}", customer_id=customer.id,
                    payment_method_id=pm.id, amount=random.uniform(100,1000),
                    type=random.choice([TransactionType.PURCHASE,TransactionType.REFUND]),
                    timestamp=ring_start+timedelta(seconds=random.randint(0,300)), status="completed")
                transactions.append(tt)
                txn_counter += 1
    return customers, payment_methods, transactions, {"id":ring_id,"patterns":patterns,"member_count":ring_size,"customer_ids":[c.id for c in customers]}


def _create_legitimate_family(family_index, base_time, txn_counter_start):
    """Create a legitimate family sharing one device.
    
    This is the key edge case: a family of 4-6 people sharing a household
    device (family tablet, shared phone). They look similar to fraud rings
    on the surface (shared device) but differ in:
    - Spread-out signup times (days/weeks apart, not burst)
    - Each member has their own payment methods
    - Low refund rate (normal shopping behavior)
    - Normal transaction amounts and timing
    - No coordinated patterns
    """
    family_id = f"FAM-{family_index:03d}"
    family_size = random.randint(4, 6)
    shared_device = _random_device()  # Family tablet/phone
    
    # Family members sign up spread over 30-90 days (NOT burst)
    family_start = base_time + timedelta(days=random.randint(10, 60))
    
    customers = []
    payment_methods = []
    transactions = []
    txn_counter = txn_counter_start
    
    family_roles = ["father", "mother", "son", "daughter", "grandfather", "grandmother"]
    
    for i in range(family_size):
        member_index = 20000 + family_index * 100 + i
        role = family_roles[i] if i < len(family_roles) else f"member{i}"
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        
        # Spread signup over days/weeks (NOT seconds like fraud rings)
        signup_time = family_start + timedelta(days=random.randint(0, 30),
                                                hours=random.randint(0, 23))
        
        # Each family member has their OWN unique IP (different phones/devices)
        # But shares the family device (tablet, shared computer)
        customer = Customer(
            id=f"CUST-{member_index:04d}",
            name=f"{first} {last}",
            email=_random_email(first + last),
            phone=_random_phone(),
            created_at=signup_time,
            ip_hash=_hash(_random_ip()),  # Unique IP per person
            device_fingerprint=shared_device,  # Shared family device
            is_fraud=False
        )
        customers.append(customer)
        
        # Each member has their OWN payment methods (not shared)
        pm_type = random.choice(["card", "upi"])
        pm = PaymentMethod(
            id=f"PM-{member_index:04d}",
            type=pm_type,
            fingerprint=_random_card_fingerprint() if pm_type == "card" else _random_uoi(),
            customer_id=customer.id,
            is_fraud=False
        )
        payment_methods.append(pm)
        
        # Normal transaction behavior: 2-6 purchases, 0-1 refunds
        # Low refund rate (0-20%), normal amounts
        num_purchases = random.randint(2, 6)
        num_refunds = random.choices([0, 1], weights=[0.8, 0.2])[0]
        
        for j in range(num_purchases):
            txn_counter += 1
            purchase = Transaction(
                id=f"TXN-{txn_counter:06d}",
                customer_id=customer.id,
                payment_method_id=pm.id,
                amount=round(random.uniform(200, 3000), 2),
                type=TransactionType.PURCHASE,
                timestamp=signup_time + timedelta(days=random.randint(1, 60),
                                                   hours=random.randint(0, 23)),
                status="completed"
            )
            transactions.append(purchase)
        
        for j in range(num_refunds):
            txn_counter += 1
            refund = Transaction(
                id=f"TXN-{txn_counter:06d}",
                customer_id=customer.id,
                payment_method_id=pm.id,
                amount=round(random.uniform(200, 1500), 2),
                type=TransactionType.REFUND,
                timestamp=signup_time + timedelta(days=random.randint(5, 30),
                                                   hours=random.randint(0, 23)),
                status="refunded"
            )
            transactions.append(refund)
    
    return customers, payment_methods, transactions, {
        "id": family_id,
        "patterns": ["shared_device"],
        "member_count": family_size,
        "customer_ids": [c.id for c in customers],
        "is_fraud": False,
        "scenario": "Legitimate family sharing a household device"
    }


def generate_dataset(num_legit=500, num_rings=10, ring_size_min=4, ring_size_max=8, seed=42):
    random.seed(seed)
    db.clear_all()
    db.init_db()
    base_time = datetime(2025, 1, 1)
    txn_counter = 0
    for i in range(num_legit):
        customer = _create_legit_customer(i, base_time)
        db.insert_customer(customer)
        num_pms = random.choices([1, 2], weights=[0.7, 0.3])[0]
        customer_pms = []
        for j in range(num_pms):
            pm = PaymentMethod(id=f"PM-{i:04d}-{j}", type=random.choice(["card","upi"]),
                fingerprint=_random_card_fingerprint() if random.random()>0.5 else _random_uoi(),
                customer_id=customer.id, is_fraud=False)
            customer_pms.append(pm)
            db.insert_payment_method(pm)
        num_txns = random.randint(1, 5)
        for j in range(num_txns):
            txn_counter += 1
            pm = random.choice(customer_pms)
            txn = _create_legit_transaction(customer, pm, base_time, txn_counter)
            db.insert_transaction(txn)
    # Inject legitimate families (edge case for graceful failure testing)
    all_family_info = []
    num_families = 3  # 3 families with shared devices
    for fam_idx in range(num_families):
        fc, fpm, ftx, fi = _create_legitimate_family(fam_idx, base_time, txn_counter)
        for c in fc: db.insert_customer(c)
        for pm in fpm: db.insert_payment_method(pm)
        for txn in ftx: db.insert_transaction(txn)
        all_family_info.append(fi)
        txn_counter += len(ftx)

    all_ring_info = []
    ring_patterns = [[
        "shared_device","bonus_farming"],
        ["shared_device","shared_ip","correlated_timing"],
        ["shared_pm","bonus_farming"],
        ["shared_device","shared_pm","circular_refund"],
        ["shared_ip","correlated_timing","bonus_farming"],
        ["shared_device","shared_ip","shared_pm","correlated_timing"]]
    for ring_idx in range(num_rings):
        ring_size = random.randint(ring_size_min, ring_size_max)
        patterns = random.choice(ring_patterns)
        rc, rpm, rtx, ri = _create_fraud_ring(ring_idx, ring_size, base_time, patterns)
        for c in rc: db.insert_customer(c)
        for pm in rpm: db.insert_payment_method(pm)
        for txn in rtx: db.insert_transaction(txn)
        db.insert_ring(ri["id"], ",".join(patterns), ring_size)
        all_ring_info.append(ri)
        txn_counter += len(rtx)
    stats = db.get_dataset_stats()
    stats["rings"] = all_ring_info
    stats["families"] = all_family_info
    return stats


def generate_noisy_dataset(num_legit=500, num_rings=10, ring_size_min=4, ring_size_max=8, seed=42, noise_level=0.08):
    """Generate dataset with intentional noise for realistic evaluation.
    
    Adds:
    - Legit customers who share devices (creating borderline clusters)
    - Fraud customers with unique attributes (creating false negatives)
    - Mixed clusters that are partially fraud, partially legit
    - This gives the confusion matrix non-trivial FP/FN/TN numbers
    """
    # Generate base dataset
    base_stats = generate_dataset(num_legit, num_rings, ring_size_min, ring_size_max, seed)
    
    random.seed(seed + 1000)
    customers = db.get_all_customers()
    
    # Noise type 1: Create legit customers sharing devices with fraud rings
    # These create false-positive-ish borderline clusters
    fraud_customers = [c for c in customers if c.is_fraud]
    legit_customers = [c for c in customers if not c.is_fraud and not c.id.startswith('FAM-') and int(c.id.split('-')[1]) < 10000]
    
    num_device_contaminations = max(1, int(len(fraud_customers) * noise_level * 2))
    contaminated = 0
    for lc in random.sample(legit_customers, min(num_device_contaminations, len(legit_customers))):
        if contaminated >= num_device_contaminations:
            break
        # Find a fraud customer's device and assign it to this legit customer
        target_fc = random.choice(fraud_customers)
        conn = db.get_connection()
        conn.execute("UPDATE customers SET device_fingerprint = ? WHERE id = ?",
                     (target_fc.device_fingerprint, lc.id))
        conn.commit()
        conn.close()
        contaminated += 1
    
    # Noise type 2: Create a mixed cluster (part fraud, part legit)
    # Add 3 legit customers with shared device AND fast signup
    mixed_start_idx = 30000
    base_time = datetime(2025, 1, 1)
    shared_mixed_device = _hash(f"mixed-device-{random.randint(10000,99999)}")
    
    # Find a fraud ring to mix with
    if fraud_customers:
        reference_fc = fraud_customers[0]
        ring_start = reference_fc.created_at
        
        for i in range(3):
            idx = mixed_start_idx + i
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            # These legit customers share the fraud device + sign up quickly
            # But they have normal refund patterns -> should be borderline
            customer = Customer(
                id=f"CUST-{idx:04d}", name=f"{first} {last}",
                email=_random_email(first+last), phone=_random_phone(),
                created_at=ring_start + timedelta(seconds=random.randint(10, 90)),
                ip_hash=_hash(_random_ip()),
                device_fingerprint=shared_mixed_device,  # shares with fraud
                is_fraud=False
            )
            db.insert_customer(customer)
            
            pm = PaymentMethod(
                id=f"PM-{idx:04d}", type="upi",
                fingerprint=_random_uoi(),
                customer_id=customer.id, is_fraud=False
            )
            db.insert_payment_method(pm)
            
            # Normal purchase pattern (not bonus farming)
            for j in range(random.randint(2, 4)):
                txn = Transaction(
                    id=f"TXN-{1900000 + idx * 10 + j:06d}", customer_id=customer.id,
                    payment_method_id=pm.id,
                    amount=round(random.uniform(200, 2000), 2),
                    type=TransactionType.PURCHASE,
                    timestamp=customer.created_at + timedelta(days=random.randint(1, 15), hours=random.randint(0, 23)),
                    status="completed"
                )
                db.insert_transaction(txn)
    
    stats = db.get_dataset_stats()
    stats['rings'] = base_stats.get('rings', [])
    stats['families'] = base_stats.get('families', [])
    stats['noise_added'] = contaminated + 3
    return stats
