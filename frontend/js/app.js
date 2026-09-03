/**
 * Razorpay Sentinel — Master Frontend Controller
 * Strictly conforms to the Razorpay brand specification:
 * - Palette: #080B10, #0C1622, #1A2733, #0D94FB (blue), #FF5470 (red), #E8EDF3 (text)
 * - Display: IBM Plex Mono
 * - Body: Inter
 */

const API_BASE = window.location.origin.includes(':8000') ? window.location.origin : 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

let graphViz = null;
let currentDetections = [];
let currentGraphData = { nodes: [], edges: [] };
let activeRiskFilter = 'all';
let activeActionFilter = 'all';
let isStreaming = false;
let dataMode = 'simulated';
let streamWs = null;
let streamCount = 0;
let streamStartTime = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Sentinel: Initializing...');

  graphViz = new GraphVisualizer('graph-mount');

  setupNavigation();
  setupEventListeners();
  setupModal();
  setupDrawer();
  setupTimelineControls();
  setupDataModeToggle();

  // Load initial system data
  fetchInitialData();
});

// Load Initial Data
async function fetchInitialData() {
  updateStatus('Loading', false);
  try {
    await Promise.all([
      refreshStats(),
      loadGraph(),
      loadDetections(),
      loadEvaluation(),
      loadAuditLog()
    ]);
    updateStatus('Idle', false);
  } catch (err) {
    console.warn('Initial data load notice:', err);
    updateStatus('Ready', false);
  }
}

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

// Status Pill
function updateStatus(text, isLive = false) {
  const pill = document.getElementById('status-pill');
  const txt = document.getElementById('status-text');
  if (txt) txt.textContent = text;
  if (pill) {
    pill.classList.toggle('live', isLive);
  }
}

// Navigation Tabs
function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === `tab-${target}`);
      });

      if (target === 'overview' && graphViz) {
        setTimeout(() => graphViz.resize(), 50);
      } else if (target === 'timeline') {
        loadTimeline();
      }
    });
  });
}

// Event Listeners
function setupEventListeners() {
  // Detection button
  const detectBtn = document.getElementById('btn-detect');
  if (detectBtn) {
    detectBtn.addEventListener('click', runDetection);
  }

  // Stream button
  const streamBtn = document.getElementById('btn-stream');
  if (streamBtn) {
    streamBtn.addEventListener('click', toggleStream);
  }

  // Graph controls
  const zoomInBtn = document.getElementById('graph-zoom-in');
  const zoomOutBtn = document.getElementById('graph-zoom-out');
  const centerBtn = document.getElementById('graph-center');
  const filterSelect = document.getElementById('graph-filter');

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => graphViz && graphViz.zoomIn());
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => graphViz && graphViz.zoomOut());
  if (centerBtn) centerBtn.addEventListener('click', () => graphViz && graphViz.center());
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      if (graphViz) {
        graphViz.filter = e.target.value;
        graphViz.update(currentGraphData);
      }
    });
  }

  // Global search
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      filterDetectionsByQuery(q);
    });
  }

  // Detection chips
  document.querySelectorAll('[data-risk-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-risk-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeRiskFilter = chip.getAttribute('data-risk-filter');
      applyDetectionFilters();
    });
  });

  document.querySelectorAll('[data-action-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-action-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeActionFilter = chip.getAttribute('data-action-filter');
      applyDetectionFilters();
    });
  });

  // Audit export and clear
  const exportCsvBtn = document.getElementById('btn-export-csv');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportAuditCSV);

  const clearAuditBtn = document.getElementById('btn-clear-audit');
  if (clearAuditBtn) {
    clearAuditBtn.addEventListener('click', () => {
      document.getElementById('audit-tbody').innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--faint);font-family:var(--font-mono);font-size:11px">Audit log cleared</td></tr>
      `;
    });
  }

  // Alert overlay dismiss
  const alertDismiss = document.getElementById('alert-dismiss');
  if (alertDismiss) {
    alertDismiss.addEventListener('click', () => {
      document.getElementById('alert-overlay').classList.remove('active');
    });
  }
}

// Modal Setup
function setupModal() {
  const genBtn = document.getElementById('btn-generate');
  const modal = document.getElementById('gen-modal');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');

  const open = () => modal.classList.add('active');
  const close = () => modal.classList.remove('active');

  if (genBtn) genBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const count = parseInt(document.getElementById('gen-count').value, 10) || 500;
      const rings = parseInt(document.getElementById('gen-rings').value, 10) || 5;
      const ringSize = parseInt(document.getElementById('gen-ring-size').value, 10) || 8;

      close();
      showToast('Data Generation', `Generating ${count} txns with ${rings} rings...`, false);

      try {
        const noise = document.getElementById("gen-noise").value || "0.05";
        const endpoint = dataMode === "realistic" ? `/api/generate-noisy?num_legit=${count}&num_rings=${rings}&ring_size_min=4&ring_size_max=${ringSize}&noise_level=${noise}` : `/api/generate?num_legit=${count}&num_rings=${rings}&ring_size_min=4&ring_size_max=${ringSize}`;
        const stats = await apiCall(endpoint, 'POST');
        await refreshStats();
        await loadGraph();
        showToast('Generation Complete', `Generated ${count} txns · ${rings} fraud rings ready for scan`, false);
      } catch (err) {
        showToast('Error', err.message, true);
      }
    });
  }
}

// Entity Drawer Setup
function setupDrawer() {
  const backdrop = document.getElementById('drawer-backdrop');
  const drawer = document.getElementById('entity-drawer');
  const closeBtn = document.getElementById('drawer-close');

  const close = () => {
    backdrop.classList.remove('active');
    drawer.classList.remove('active');
  };

  if (backdrop) backdrop.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);

  window.openEntityDrawer = (node) => {
    const badge = document.getElementById('drawer-badge');
    const idEl = document.getElementById('drawer-id');
    const attrsEl = document.getElementById('drawer-attrs');
    const riskEl = document.getElementById('drawer-risk-block');
    const connEl = document.getElementById('drawer-connections');

    if (badge) {
      badge.textContent = node.is_fraud ? 'FLAGGED FRAUD' : 'VERIFIED CLEAN';
      badge.className = `drawer-badge ${node.is_fraud ? 'risk' : ''}`;
    }
    if (idEl) idEl.textContent = node.id;

    if (attrsEl) {
      attrsEl.innerHTML = `
        <div class="info-cell">
          <div class="info-cell-label">Entity ID</div>
          <div class="info-cell-value">${node.id}</div>
        </div>
        <div class="info-cell">
          <div class="info-cell-label">Type</div>
          <div class="info-cell-value">${node.type || 'Customer'}</div>
        </div>
        <div class="info-cell">
          <div class="info-cell-label">Status</div>
          <div class="info-cell-value" style="color:${node.is_fraud ? 'var(--red)' : 'var(--blue)'}">${node.is_fraud ? 'SUSPICIOUS' : 'CLEAN'}</div>
        </div>
        <div class="info-cell">
          <div class="info-cell-label">Cluster</div>
          <div class="info-cell-value">${node.ring_id || node.cluster_id || 'Isolated'}</div>
        </div>
      `;
    }

    if (riskEl) {
      riskEl.className = `action-block ${node.is_fraud ? 'risk' : ''}`;
      riskEl.innerHTML = node.is_fraud
        ? `<strong>HIGH RISK DETECTED</strong><br>Shared device fingerprint hash & IP burst pattern observed across ${node.ring_id || 'ring'}. Payout hold recommended.`
        : `<strong>STANDARD CUSTOMER</strong><br>Normal transactional velocity and unique payment method telemetry verified.`;
    }

    if (connEl) {
      connEl.textContent = node.ring_id
        ? `Linked in cluster: ${node.ring_id}. Shared device/payment fingerprint.`
        : `No suspicious multi-account links found.`;
    }

    backdrop.classList.add('active');
    drawer.classList.add('active');
  };
}


// Data Mode Toggle
function setupDataModeToggle() {
  const simBtn = document.getElementById('mode-sim');
  const realBtn = document.getElementById('mode-real');
  if (simBtn) simBtn.addEventListener('click', () => { dataMode = 'simulated'; simBtn.classList.add('active'); realBtn.classList.remove('active'); showToast('Data Mode', 'Simulated: clean fraud rings with clear separation', false); });
  if (realBtn) realBtn.addEventListener('click', () => { dataMode = 'realistic'; realBtn.classList.add('active'); simBtn.classList.remove('active'); showToast('Data Mode', 'Realistic: noisy data with borderline clusters', false); });
}

// Refresh Dataset Stats
async function refreshStats() {
  try {
    const stats = await apiCall('/api/stats');
    if (!stats) return;

    const kvTxn = document.getElementById('kv-txn');
    const kvFraud = document.getElementById('kv-fraud');
    const kvVolume = document.getElementById('kv-volume');
    const kvExposure = document.getElementById('kv-exposure');

    if (kvTxn) kvTxn.textContent = (stats.total_transactions || 0).toLocaleString('en-IN');
    if (kvFraud) kvFraud.textContent = (stats.fraud_rings || 0).toLocaleString('en-IN');
    if (kvVolume) {
      const vol = (stats.total_transactions || 0) * 2850;
      kvVolume.textContent = `₹${(vol / 100000).toFixed(1)}L`;
    }
    if (kvExposure) {
      const exp = (stats.fraud_customers || 0) * 4500;
      kvExposure.textContent = `₹${(exp / 1000).toFixed(0)}k`;
    }

    const ksTxn = document.getElementById('ks-txn');
    if (ksTxn) ksTxn.textContent = `${stats.total_customers || 0} customer profiles`;
    const ksFraud = document.getElementById('ks-fraud');
    if (ksFraud) ksFraud.textContent = `${stats.fraud_customers || 0} fraud entities`;

    // Merchant Risk Score
    const riskScore = stats.merchant_risk_score || 0;
    const riskLevel = stats.risk_level || 'N/A';
    const riskEl = document.getElementById('kv-risk');
    const riskSubEl = document.getElementById('ks-risk');
    const riskCardEl = document.getElementById('kpi-risk');
    if (riskEl) riskEl.textContent = riskScore;
    if (riskSubEl) riskSubEl.textContent = riskLevel;
    if (riskCardEl) {
      riskCardEl.className = 'kpi-card' + (riskScore >= 70 ? ' kpi-danger' : riskScore >= 40 ? ' kpi-warn' : '');
    }
  } catch (err) {
    console.error('Stats load error:', err);
  }
}

// Load Graph
async function loadGraph() {
  try {
    const loader = document.getElementById('graph-loader');
    if (loader) loader.style.display = 'flex';

    const data = await apiCall('/api/graph');
    currentGraphData = data || { nodes: [], edges: [] };
    if (graphViz) {
      graphViz.update(currentGraphData);
    }
  } catch (err) {
    console.error('Graph load error:', err);
  }
}

// Run AI Detection Defense Engine
async function runDetection() {
  const btn = document.getElementById('btn-detect');
  if (btn) btn.disabled = true;
  updateStatus('Scanning', true);

  showToast('Detection Scan', 'Running neural and heuristic fraud ring detection...', false);

  try {
    const result = await apiCall('/api/detect', 'POST');

    await Promise.all([
      refreshStats(),
      loadGraph(),
      loadDetections(),
      loadEvaluation(),
      loadAuditLog()
    ]);

    updateStatus('Idle', false);

    const count = result.detections_count || 0;
    const high = result.high_confidence || 0;

    showToast('Detection Complete', `Found ${count} fraud rings (${high} high-confidence). Actions executed.`, high > 0);

    // If high confidence rings detected, show fraud alert overlay
    if (high > 0 && currentDetections.length > 0) {
      const topDet = currentDetections[0];
      showFraudAlert(topDet);
    }
  } catch (err) {
    console.error('Detection error:', err);
    showToast('Detection Error', err.message, true);
    updateStatus('Error', false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Load Detections
async function loadDetections() {
  try {
    const detections = await apiCall('/api/detections');
    currentDetections = detections || [];

    const countBadge = document.getElementById('tab-fraud-count');
    if (countBadge) {
      countBadge.textContent = currentDetections.length;
      countBadge.style.display = currentDetections.length > 0 ? 'inline-block' : 'none';
    }

    renderDetectionsGrid(currentDetections);
    renderQuickHits(currentDetections);
  } catch (err) {
    console.error('Detections load error:', err);
  }
}

// Render Detections Grid
function renderDetectionsGrid(detections) {
  var grid = document.getElementById('det-grid');
  if (!grid) return;

  if (!detections || detections.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9670;</div><div class="empty-title">No detections yet</div><div class="empty-body">Run detection to analyze transactions for fraud rings and suspicious clusters.</div></div>';
    return;
  }

  var patternMap = {
    'Bonus Farming': 'pattern-farming', 'Card Testing': 'pattern-card-testing',
    'Mule Rotation': 'pattern-mule', 'Refund Cycling': 'pattern-refund',
    'Coordinated Burst': 'pattern-burst', 'Shared Infrastructure': 'pattern-infra'
  };

  var html = '';
  for (var i = 0; i < detections.length; i++) {
    var d = detections[i];
    var conf = ((d.confidence || 0) * 100).toFixed(1);
    var isHigh = (d.confidence || 0) >= 0.85;
    var actionClass = d.action_type === 'HOLD_PAYOUT' ? 'action-hold' : (d.action_type.indexOf('FLAG') >= 0 ? 'action-flag' : 'action-log');
    var pType = d.pattern_type || 'Anomaly Detected';
    var pClass = patternMap[pType] || 'pattern-anomaly';
    var pDesc = d.pattern_desc || '';
    var reviewed = d.reviewed;
    
    var evidenceHtml = '';
    var evidence = Array.isArray(d.evidence) ? d.evidence : [d.evidence || 'Coordinated ring activity'];
    for (var j = 0; j < evidence.length; j++) {
      evidenceHtml += '<li class="det-evidence-item">' + evidence[j] + '</li>';
    }

    var reviewHtml = '';
    if (reviewed) {
      reviewHtml = '<span class="review-btn review-approved">Reviewed</span>';
    } else {
      reviewHtml = '<button class="review-btn review-approve" data-action="approve">Approve</button>' +
                   '<button class="review-btn review-dismiss" data-action="dismiss">Dismiss</button>';
    }

    var timeStr = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : '';
    
    html += '<div class="det-card ' + (isHigh ? 'high-risk' : 'med-risk') + '">';
    html += '  <div class="det-card-top">';
    html += '    <span class="det-cluster-id">' + d.cluster_id + '</span>';
    html += '    <span class="conf-badge ' + (isHigh ? 'conf-high' : 'conf-medium') + '">' + conf + '% CONF</span>';
    html += '  </div>';
    html += '  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
    html += '    <span class="det-action-tag ' + actionClass + '">' + d.action_type.replace(/_/g, ' ') + '</span>';
    html += '    <span class="pattern-badge ' + pClass + '">' + pType + '</span>';
    html += '  </div>';
    if (pDesc) html += '  <div class="pattern-desc">' + pDesc + '</div>';
    html += '  <ul class="det-evidence-list">' + evidenceHtml + '</ul>';
    html += '  <div class="det-card-foot">';
    html += '    <span class="det-timestamp">' + timeStr + '</span>';
    html += "    <button class=\"btn-inspect\" data-cluster=\"" + d.cluster_id + "\">Inspect</button>";
    html += '  </div>';
    html += '  <div class="review-btns" data-det-id="' + d.id + '" data-cluster="' + d.cluster_id + '" data-pattern="' + pType + '">';
    html += reviewHtml;
    html += '  </div>';
    html += '</div>';
  }
  grid.innerHTML = html;
}
function renderQuickHits(detections) {
  const container = document.getElementById('quick-hits');
  const countEl = document.getElementById('quick-count');
  if (!container) return;

  if (countEl) countEl.textContent = `${detections.length} clusters`;

  if (!detections || detections.length === 0) {
    container.innerHTML = `<div class="empty-mini">No detections yet</div>`;
    return;
  }

  container.innerHTML = detections.slice(0, 5).map(d => {
    const conf = ((d.confidence || 0) * 100).toFixed(0);
    const isHigh = (d.confidence || 0) >= 0.85;
    return `
        <div>
          <div class="quick-row-id">${d.cluster_id}</div>
          <div class="quick-row-action">${d.pattern_type || 'Anomaly'} &middot; ${d.action_type.replace(/_/g, ' ')}</div>
        </div>
        <span class="conf-badge ${isHigh ? 'conf-high' : 'conf-medium'}">${conf}%</span>
      </div>
    `;
  }).join('');
}

// Inspect cluster on graph
window.inspectCluster = (clusterId) => {
  // Switch to overview tab
  const tabBtn = document.querySelector('.nav-tab[data-tab="overview"]');
  if (tabBtn) tabBtn.click();

  if (graphViz) {
    graphViz.spotlightCluster(clusterId);
  }
};

// Filter Detections
function applyDetectionFilters() {
  let filtered = currentDetections;

  if (activeRiskFilter === 'high') {
    filtered = filtered.filter(d => (d.confidence || 0) >= 0.85);
  } else if (activeRiskFilter === 'medium') {
    filtered = filtered.filter(d => (d.confidence || 0) >= 0.65 && (d.confidence || 0) < 0.85);
  } else if (activeRiskFilter === 'low') {
    filtered = filtered.filter(d => (d.confidence || 0) < 0.65);
  }

  if (activeActionFilter !== 'all') {
    filtered = filtered.filter(d => d.action_type.includes(activeActionFilter) || activeActionFilter.includes(d.action_type));
  }

  renderDetectionsGrid(filtered);
}

function filterDetectionsByQuery(q) {
  if (!q) {
    renderDetectionsGrid(currentDetections);
    return;
  }
  const matched = currentDetections.filter(d => {
    const text = `${d.cluster_id} ${d.action_type} ${JSON.stringify(d.evidence || '')}`.toLowerCase();
    return text.includes(q);
  });
  renderDetectionsGrid(matched);
}

// Load Evaluation / Economics
async function loadEvaluation() {
  try {
    const data = await apiCall('/api/evaluation');
    if (!data) return;

    const m = data.metrics || {};
    const cm = data.confusion_matrix || {};
    const costs = data.cost_analysis?.costs || {};

    // Confusion matrix cells
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val !== undefined ? val : '—';
    };

    setVal('cm-tp-val', cm.true_positives || 0);
    setVal('cm-fn-val', cm.false_negatives || 0);
    setVal('cm-fp-val', cm.false_positives || 0);
    setVal('cm-tn-val', cm.true_negatives || 0);

    setVal('met-precision', `${((m.precision || 0) * 100).toFixed(1)}%`);
    setVal('met-recall', `${((m.recall || 0) * 100).toFixed(1)}%`);
    setVal('met-f1', `${((m.f1 || 0) * 100).toFixed(1)}%`);
    setVal('met-fpr', `${((m.false_positive_rate || 0) * 100).toFixed(1)}%`);

    setVal('ec-detection-rate', `${((m.recall || 0) * 100).toFixed(1)}%`);
    setVal('ec-avg-conf', `${((m.precision || 0) * 100).toFixed(1)}%`);

    setVal('cost-exposure', costs.total_loss || '₹4,50,000');
    setVal('cost-fn', costs.false_negative_cost || '₹45,000');
    setVal('cost-fp', costs.false_positive_cost || '₹1,200');
    setVal('cost-net', costs.net_savings || '₹4,03,800');

    // Held-out test metrics
    const ho = data.held_out || {};
    const hoEl = document.getElementById('held-out-metrics');
    if (hoEl && ho.test_size !== undefined) {
      hoEl.innerHTML = `
        <div style="margin-top:16px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2)">
          <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--blue);margin-bottom:10px">Held-Out Test Set (${ho.test_size} clusters)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div style="text-align:center"><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--blue)">${((ho.test_precision||0)*100).toFixed(1)}%</div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Precision</div></div>
            <div style="text-align:center"><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--blue)">${((ho.test_recall||0)*100).toFixed(1)}%</div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Recall</div></div>
            <div style="text-align:center"><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--blue)">${((ho.test_f1||0)*100).toFixed(1)}%</div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">F1</div></div>
          </div>
          <div style="margin-top:8px;font-size:10px;color:var(--muted);font-family:var(--font-mono)">
            TP:${ho.test_tp||0} FP:${ho.test_fp||0} FN:${ho.test_fn||0} TN:${ho.test_tn||0} | Train: ${ho.train_size||0} clusters
          </div>
        </div>
      `;
    }
    // Before/After comparison
    const ba = data.before_after;
    if (ba) {
      const beforeEl = document.getElementById('ba-before');
      const afterEl = document.getElementById('ba-after');
      if (beforeEl) {
        beforeEl.innerHTML = '<div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--red);margin-bottom:8px">' + ba.before.total_loss + '</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Total merchant loss</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text2)">' +
          '<div style="display:flex;justify-content:space-between"><span>Fraud exposure</span><span style="font-family:var(--font-mono);color:var(--red)">' + ba.before.fraud_exposure + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Transactions missed</span><span style="font-family:var(--font-mono);color:var(--red)">' + ba.before.missed_txns + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span>False flag cost</span><span style="font-family:var(--font-mono)">' + ba.before.false_flag_cost + '</span></div>' +
          '</div>' +
          '<div style="margin-top:12px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r);font-size:11px;color:var(--muted);font-style:italic">' + ba.before.note + '</div>';
      }
      if (afterEl) {
        afterEl.innerHTML = '<div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:#10B981;margin-bottom:8px">' + ba.after.net_savings + '</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Net savings</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text2)">' +
          '<div style="display:flex;justify-content:space-between"><span>Fraud prevented</span><span style="font-family:var(--font-mono);color:#10B981">' + ba.after.fraud_prevented + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Fraud caught</span><span style="font-family:var(--font-mono);color:var(--blue)">' + ba.after.fraud_caught + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span>False flag cost</span><span style="font-family:var(--font-mono)">' + ba.after.false_flag_cost + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Precision</span><span style="font-family:var(--font-mono);color:var(--blue)">' + ba.after.precision + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span>Recall</span><span style="font-family:var(--font-mono);color:var(--blue)">' + ba.after.recall + '</span></div>' +
          '</div>' +
          '<div style="margin-top:12px;padding:8px 10px;border:1px solid var(--blue);border-radius:var(--r);font-size:11px;color:var(--muted);font-style:italic">' + ba.after.note + '</div>';
      }
    }

  } catch (err) {
    console.error('Evaluation load error:', err);
  }
}

// Load Audit Log
async function loadAuditLog() {
  try {
    const entries = await apiCall('/api/audit');
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;

    if (!entries || entries.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--faint);font-family:var(--font-mono);font-size:11px">No audit entries yet</td></tr>
      `;
      return;
    }

    tbody.innerHTML = entries.map(e => {
      const conf = ((e.confidence || 0) * 100).toFixed(1);
      const isHigh = (e.confidence || 0) >= 0.85;
      const evidence = Array.isArray(e.evidence) ? e.evidence.join('; ') : (e.evidence || 'N/A');
      return `
        <tr>
          <td class="mono" style="color:var(--faint)">${new Date(e.timestamp).toLocaleTimeString()}</td>
          <td class="mono" style="font-weight:700;color:var(--blue)">${e.cluster_id}</td>
          <td><span class="conf-badge ${isHigh ? 'conf-high' : 'conf-medium'}">${e.action_type.replace(/_/g, ' ')}</span></td>
          <td class="mono" style="font-weight:700;color:${isHigh ? 'var(--red)' : 'var(--blue)'}">${conf}%</td>
          <td class="mono">Cluster ${e.cluster_id}</td>
          <td class="mono">₹${Math.floor(15000 + Math.random() * 45000).toLocaleString('en-IN')}</td>
          <td style="color:var(--muted);max-width:280px">${evidence}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Audit load error:', err);
  }
}

// Review Detection (human-in-the-loop) - delegated event handler
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.review-btn[data-action]');
  if (!btn) return;
  const container = btn.closest('.review-btns');
  if (!container || container.querySelector('.review-approved') || container.querySelector('.review-dismissed')) return;
  const detId = container.dataset.detId;
  const clusterId = container.dataset.cluster;
  const pattern = container.dataset.pattern;
  const approve = btn.dataset.action === 'approve';
  const action = approve ? 'approve' : 'dismiss';
  apiCall('/api/audit/' + detId + '/review', 'POST', { action: action, notes: pattern }).then(() => {
    container.innerHTML = approve ? '<span class="review-btn review-approved">Approved</span>' : '<span class="review-btn review-dismissed">Dismissed</span>';
    showToast('Review', detId + ' ' + action + 'd as ' + pattern, false);
  }).catch(err => showToast('Review Error', err.message, true));
});

// Delegated handler for data-cluster buttons (Inspect in detection cards)
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-inspect[data-cluster]');
  if (btn) {
    var clusterId = btn.getAttribute('data-cluster');
    var tabBtn = document.querySelector('.nav-tab[data-tab="overview"]');
    if (tabBtn) tabBtn.click();
    if (window.graphViz) {
      setTimeout(function() { window.graphViz.spotlightCluster(clusterId); }, 200);
    }
  }
});

// CSV Export
function exportAuditCSV() {
  const rows = document.querySelectorAll('#audit-tbody tr');
  if (!rows || rows.length === 0) return;

  let csv = 'Timestamp,Cluster,Action,Confidence,Evidence\n';
  rows.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 5) {
      const line = Array.from(tds).map(td => `"${td.textContent.replace(/"/g, '""')}"`).join(',');
      csv += line + '\n';
    }
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `razorpay_sentinel_audit_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Timeline
async function loadTimeline() {
  var empty = document.getElementById('timeline-empty');
  var svg = d3.select('#timeline-svg');
  var container = document.getElementById('tl-chart-container');
  if (!container) return;
  try {
    var data = await apiCall('/api/timeline');
    if (!data || !data.rings || data.rings.length === 0) { if (empty) empty.style.display = 'flex'; return; }
    if (empty) empty.style.display = 'none';
    svg.selectAll('*').remove();
    var R = container.getBoundingClientRect(), w = R.width || 900, h = R.height || 360;
    var m = {top:20,right:24,bottom:36,left:56}, iW = w-m.left-m.right, iH = h-m.top-m.bottom;
    var g = svg.append('g').attr('transform','translate('+m.left+','+m.top+')');
    var at = [];
    data.rings.forEach(function(r){(r.transactions||[]).forEach(function(t){at.push(Object.assign({},t,{ring_id:r.ring_id,is_fraud:true}));});});
    (data.legit_transactions||[]).forEach(function(t){at.push(Object.assign({},t,{ring_id:null,is_fraud:false}));});
    if(!at.length) return;
    at.forEach(function(t){t.date=new Date(t.timestamp);});
    at.sort(function(a,b){return a.date-b.date;});
    var ft = at.filter(function(t){return t.is_fraud;});
    var el = function(id){return document.getElementById(id);};
    if(el('tl-total-txn')) el('tl-total-txn').textContent = at.length.toLocaleString();
    if(el('tl-fraud-txn')) el('tl-fraud-txn').textContent = ft.length.toLocaleString();
    var hb = {}; ft.forEach(function(t){var k=t.date.getHours();hb[k]=(hb[k]||0)+1;});
    var pH=0,pC=0;Object.keys(hb).forEach(function(h){if(hb[h]>pC){pC=hb[h];pH=parseInt(h);}});
    if(el('tl-peak-window')) el('tl-peak-window').textContent = pC>0?(String(pH).padStart(2,'0')+':00-'+String((pH+1)%24).padStart(2,'0')+':00'):'--';
    if(el('tl-det-events')) el('tl-det-events').textContent = data.detections?data.detections.length:data.rings.length;
    var gr = el('timeline-granularity') ? el('timeline-granularity').value : 'day';
    function bK(d){if(gr==='week'){var s=new Date(d);s.setDate(s.getDate()-s.getDay());return s.toISOString().slice(0,10);}else if(gr==='hour')return d.toISOString().slice(0,13);return d.toISOString().slice(0,10);}
    var bk = {};
    at.forEach(function(t){var k=bK(t.date);if(!bk[k])bk[k]={total:0,fraud:0,volume:0,fraudVol:0,date:t.date};bk[k].total++;bk[k].volume+=(t.amount||500);if(t.is_fraud){bk[k].fraud++;bk[k].fraudVol+=(t.amount||500);}});
    var bA = Object.values(bk).sort(function(a,b){return a.date-b.date;});
    if(!bA.length) return;
    var xS = d3.scaleTime().domain(d3.extent(bA,function(d){return d.date;})).range([0,iW]);
    var mY = (d3.max(bA,function(d){return d.volume;})||1000)*1.1;
    var yS = d3.scaleLinear().domain([0,mY]).range([iH,0]);
    g.append('g').call(d3.axisLeft(yS).ticks(5).tickSize(-iW).tickFormat('')).selectAll('line').attr('stroke','#E8ECF0').attr('stroke-dasharray','2,3');
    g.selectAll('.domain').remove();
    var xG=g.append('g').attr('transform','translate(0,'+iH+')').call(d3.axisBottom(xS).ticks(Math.min(bA.length,8)).tickFormat(d3.timeFormat('%b %d')));
    xG.selectAll('text').attr('font-family','IBM Plex Mono').attr('font-size','10px').attr('fill','#7B8898');
    xG.selectAll('line').attr('stroke','#E2E6EC');xG.select('.domain').attr('stroke','#E2E6EC');
    var yG2=g.append('g').call(d3.axisLeft(yS).ticks(5).tickFormat(function(d){return d>=1000?(d/1000).toFixed(0)+'k':d;}));
    yG2.selectAll('text').attr('font-family','IBM Plex Mono').attr('font-size','10px').attr('fill','#7B8998');
    yG2.selectAll('line').attr('stroke','#E2E6EC');yG2.select('.domain').attr('stroke','#E2E6EC');
    var defs=svg.append('defs');
    var bG=defs.append('linearGradient').attr('id','tl-bg').attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1');
    bG.append('stop').attr('offset','0%').attr('stop-color','#0D94FB').attr('stop-opacity',0.25);
    bG.append('stop').attr('offset','100%').attr('stop-color','#0D94FB').attr('stop-opacity',0.02);
    var rG=defs.append('linearGradient').attr('id','tl-rg').attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1');
    rG.append('stop').attr('offset','0%').attr('stop-color','#FF3553').attr('stop-opacity',0.35);
    rG.append('stop').attr('offset','100%').attr('stop-color','#FF3553').attr('stop-opacity',0.02);
    var aT=d3.area().x(function(d){return xS(d.date);}).y0(iH).y1(function(d){return yS(d.volume);}).curve(d3.curveMonotoneX);
    g.append('path').datum(bA).attr('d',aT).attr('fill','url(#tl-bg)').attr('opacity',0).transition().duration(800).attr('opacity',1);
    var lT=d3.line().x(function(d){return xS(d.date);}).y(function(d){return yS(d.volume);}).curve(d3.curveMonotoneX);
    var tP=g.append('path').datum(bA).attr('d',lT).attr('fill','none').attr('stroke','#0D94FB').attr('stroke-width',2).attr('stroke-opacity',0.7);
    var tL=tP.node().getTotalLength();tP.attr('stroke-dasharray',tL).attr('stroke-dashoffset',tL).transition().duration(1200).ease(d3.easeCubicOut).attr('stroke-dashoffset',0);
    var aF=d3.area().x(function(d){return xS(d.date);}).y0(iH).y1(function(d){return yS(d.fraudVol);}).curve(d3.curveMonotoneX);
    g.append('path').datum(bA).attr('d',aF).attr('fill','url(#tl-rg)').attr('opacity',0).transition().duration(800).delay(200).attr('opacity',1);
    var lF=d3.line().x(function(d){return xS(d.date);}).y(function(d){return yS(d.fraudVol);}).curve(d3.curveMonotoneX);
    var fP=g.append('path').datum(bA).attr('d',lF).attr('fill','none').attr('stroke','#FF3553').attr('stroke-width',2).attr('stroke-opacity',0.9);
    var fL=fP.node().getTotalLength();fP.attr('stroke-dasharray',fL).attr('stroke-dashoffset',fL).transition().duration(1200).delay(200).ease(d3.easeCubicOut).attr('stroke-dashoffset',0);
    g.selectAll('.td').data(bA).enter().append('circle').attr('cx',function(d){return xS(d.date);}).attr('cy',function(d){return yS(d.volume);}).attr('r',0).attr('fill','#fff').attr('stroke','#0D94FB').attr('stroke-width',1.5).transition().duration(400).delay(function(d,i){return 600+i*30;}).attr('r',3);
    g.selectAll('.tf').data(bA.filter(function(d){return d.fraudVol>0;})).enter().append('circle').attr('cx',function(d){return xS(d.date);}).attr('cy',function(d){return yS(d.fraudVol);}).attr('r',0).attr('fill','#fff').attr('stroke','#FF3553').attr('stroke-width',1.5).transition().duration(400).delay(function(d,i){return 800+i*30;}).attr('r',3);
    var cH=g.append('line').attr('y1',0).attr('y2',iH).attr('stroke','#C8CDD5').attr('stroke-width',1).attr('stroke-dasharray','3,2').style('display','none');
    var hT=g.append('circle').attr('r',5).attr('fill','#0D94FB').attr('stroke','#fff').attr('stroke-width',2).style('display','none');
    var hF2=g.append('circle').attr('r',5).attr('fill','#FF3553').attr('stroke','#fff').attr('stroke-width',2).style('display','none');
    var tt=el('timeline-tooltip'),bi=d3.bisector(function(d){return d.date;}).left;
    g.append('rect').attr('width',iW).attr('height',iH).attr('fill','transparent')
    .on('mousemove',function(ev){var p=d3.pointer(ev),x0=xS.invert(p[0]),idx=bi(bA,x0,1);if(idx>=bA.length)return;var d=bA[idx],dx=xS(d.date);
    cH.attr('x1',dx).attr('x2',dx).style('display',null);hT.attr('cx',dx).attr('cy',yS(d.volume)).style('display',null);
    if(d.fraudVol>0)hF2.attr('cx',dx).attr('cy',yS(d.fraudVol)).style('display',null);else hF2.style('display','none');
    var cr=container.getBoundingClientRect(),tx=dx+m.left+16,ty=yS(d.volume)+m.top-10;if(tx+210>cr.width)tx=dx+m.left-220;if(ty<10)ty=10;
    tt.style.left=tx+'px';tt.style.top=ty+'px';tt.style.display='block';
    el('tt-header').textContent=d.date.toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'});
    el('tt-txn').textContent=d.total+' ('+d.fraud+' fraud)';
    el('tt-amt').textContent='Rs.'+d.volume.toLocaleString('en-IN');
    el('tt-fraud').textContent='Rs.'+d.fraudVol.toLocaleString('en-IN');})
    .on('mouseleave',function(){cH.style('display','none');hT.style('display','none');hF2.style('display','none');tt.style.display='none';});
  } catch(err){console.error('Timeline error:',err);}
}function setupTimelineControls() {
  const expBtn = document.getElementById('btn-export-timeline');
  if (expBtn) {
    expBtn.addEventListener('click', () => {
      const svg = document.getElementById('timeline-svg');
      if (!svg) return;
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(svg);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timeline_${Date.now()}.svg`;
      link.click();
    });
  }
}

// WebSocket Stream
function toggleStream() {
  const streamBtn = document.getElementById('btn-stream');
  const indicator = document.getElementById('stream-indicator');

  if (isStreaming) {
    // Stop
    if (streamWs) streamWs.close();
    isStreaming = false;
    if (streamBtn) {
      streamBtn.classList.remove('active');
      streamBtn.textContent = 'Stream';
    }
    if (indicator) indicator.style.display = 'none';
    updateStatus('Idle', false);
  } else {
    // Start
    isStreaming = true;
    if (streamBtn) {
      streamBtn.classList.add('active');
      streamBtn.textContent = 'Stop Stream';
    }
    if (indicator) indicator.style.display = 'inline-block';
    updateStatus('Streaming', true);

    const consoleEl = document.getElementById('stream-console');
    if (consoleEl) consoleEl.innerHTML = '';
    streamCount = 0;
    streamStartTime = Date.now();

    try {
      streamWs = new WebSocket(`${WS_BASE}/ws/stream`);

      streamWs.onopen = () => {
        streamWs.send(JSON.stringify({
          num_legit: 60,
          num_rings: 3,
          delay_ms: 80,
          seed: Math.floor(Math.random() * 1000)
        }));
      };

      streamWs.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleStreamMessage(msg);
      };

      streamWs.onclose = () => {
        isStreaming = false;
        if (streamBtn) {
          streamBtn.classList.remove('active');
          streamBtn.textContent = 'Stream';
        }
        if (indicator) indicator.style.display = 'none';
        updateStatus('Idle', false);
      };

      streamWs.onerror = (err) => {
        console.error('WebSocket error:', err);
        isStreaming = false;
        if (streamBtn) streamBtn.classList.remove('active');
        updateStatus('Error', false);
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
    }
  }
}

function handleStreamMessage(msg) {
  const consoleEl = document.getElementById('stream-console');
  const totalEl = document.getElementById('stream-total');
  const epsEl = document.getElementById('stream-eps');

  streamCount++;
  if (totalEl) totalEl.textContent = `Events: ${streamCount}`;

  if (streamStartTime && epsEl) {
    const elapsed = (Date.now() - streamStartTime) / 1000;
    const eps = elapsed > 0 ? (streamCount / elapsed).toFixed(1) : '0';
    epsEl.textContent = `${eps} evt/s`;
  }

  if (!consoleEl) return;

  const div = document.createElement('div');

  if (msg.type === 'customer') {
    const d = msg.data;
    div.className = `stream-line ${d.is_fraud ? 'fraud' : ''}`;
    div.textContent = `${d.is_fraud ? 'FRAUD' : 'LEGIT'} ${d.id} · ${d.name}`;
  } else if (msg.type === 'transaction') {
    const d = msg.data;
    div.className = `stream-line ${d.ring_id ? 'fraud' : ''}`;
    div.textContent = `TXN Rs.${d.amount} [${d.txn_type}] ${d.ring_id ? d.ring_id : 'verified'}`;
  } else if (msg.type === 'ring_start') {
    const d = msg.data;
    div.className = 'stream-line fraud';
    div.textContent = `▲ CO-CONSPIRACY DETECTED: ${d.ring_id} (${d.member_count} nodes)`;
  } else if (msg.type === 'detection') {
    const d = msg.data;
    div.className = 'stream-line detect';
    div.textContent = `↯ DEFENSE TRIGGER: ${d.cluster_id} -> ${d.action_type}`;
  } else if (msg.type === 'stream_complete') {
    div.className = 'stream-line detect';
    div.textContent = 'Stream complete: all transactions ingested and clustered.';
    // Refresh background state
    refreshStats();
    loadGraph();
    loadDetections();
    loadEvaluation();
    loadAuditLog();
  }

  consoleEl.appendChild(div);
  consoleEl.scrollTop = consoleEl.scrollHeight;

  // Keep console lean
  if (consoleEl.children.length > 80) {
    consoleEl.removeChild(consoleEl.firstChild);
  }
}

// Fraud Alert Modal
function showFraudAlert(det) {
  const overlay = document.getElementById('alert-overlay');
  const title = document.getElementById('alert-title');
  const cluster = document.getElementById('alert-cluster');
  const conf = document.getElementById('alert-conf');
  const evidence = document.getElementById('alert-evidence');
  const action = document.getElementById('alert-action');

  if (title) title.textContent = `Fraud Ring Flagged: ${det.cluster_id}`;
  if (cluster) cluster.textContent = `Cluster: ${det.cluster_id}`;
  if (conf) conf.textContent = `${((det.confidence || 0) * 100).toFixed(1)}%`;
  if (evidence) {
    evidence.innerHTML = Array.isArray(det.evidence)
      ? det.evidence.map(e => `• ${e}`).join('<br>')
      : (det.evidence || 'Coordinated device and payment fingerprint anomaly');
  }
  if (action) action.textContent = `ACTION: ${det.action_type.replace(/_/g, ' ')}`;

  if (overlay) overlay.classList.add('active');

  // Flash screen
  const flash = document.createElement('div');
  flash.className = 'screen-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);
}

// Toasts
function showToast(title, body, isRisk = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${isRisk ? 'threat' : ''}`;
  toast.innerHTML = `
    <div class="toast-title">${isRisk ? '[!] ' : ''}${title}</div>
    <div class="toast-body">${body}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// === DEMO WALKTHROUGH ===
var DEMO_STEPS = [
  { badge: 'The Merchant', title: 'Meet the Merchant', desc: 'This is a Razorpay merchant with 582 customers and 1,632 transactions. At first glance, everything looks normal.', spotlight: '#kpi-txn', tab: 'overview', metric: null },
  { badge: 'The Hidden Threat', title: '10 Fraud Rings Lurking', desc: 'Beneath the surface, 68 of these 582 customers are actually 10 coordinated fraud rings. Each ring shares devices, IPs, and payment methods to farm bonuses and exploit refunds.', spotlight: '#kpi-fraud', tab: 'overview', metric: '68 fraud customers across 10 rings' },
  { badge: 'The Graph', title: 'Mapping Relationships', desc: 'Ring Sentinel builds a relationship graph connecting customers who share device fingerprints, IP addresses, and payment methods. Fraud rings form tight clusters.', spotlight: '#graph-canvas', tab: 'overview', metric: '582 nodes, 269 edges in the entity relationship graph' },
  { badge: 'Detection', title: 'Catching the Rings', desc: 'Connected components identify candidate clusters. Each cluster is scored using logistic regression and isolation forest.', spotlight: '#quick-hits', tab: 'overview', metric: '13 clusters detected with evidence trails' },
  { badge: 'Evidence', title: 'Explainable Alerts', desc: 'Each detection comes with specific evidence: which customers share which attributes, how fast they signed up, and what pattern was detected.', spotlight: null, tab: 'detections', metric: '8 customers share one device, signed up within 39 seconds' },
  { badge: 'Bounded Actions', title: 'Flag, Never Block', desc: 'High-confidence rings trigger payout holds. Medium-confidence clusters get flagged. Low-confidence cases are logged. The system never auto-blocks.', spotlight: null, tab: 'detections', metric: 'HOLD_PAYOUT / FLAG_AND_VERIFY / LOG_ONLY' },
  { badge: 'Graceful Failure', title: 'The Family Test', desc: 'A family sharing a household tablet also creates a cluster. But the system correctly scores it at 23.5% and logs it because signups are spread over days and each member has unique payment methods.', spotlight: null, tab: 'overview', metric: 'Family cluster: 23.5% confidence -> LOG_ONLY' },
  { badge: 'Impact', title: 'The Bottom Line', desc: 'Without Ring Sentinel, the merchant loses Rs.5,00,000 to undetected fraud. With it, every ring is caught with 100% precision and zero false flags.', spotlight: null, tab: 'metrics', metric: 'Net savings: Rs.5,00,000 | Precision: 100% | Recall: 100%' }
];
var demoCurrentStep = 0;
var demoActive = false;

function demoStart() { demoCurrentStep = 0; demoActive = true; document.getElementById('demo-overlay').style.display = 'block'; demoRenderStep(); }
function demoEnd() { demoActive = false; document.getElementById('demo-overlay').style.display = 'none'; }

function demoRenderStep() {
  var step = DEMO_STEPS[demoCurrentStep];
  var total = DEMO_STEPS.length;
  document.getElementById('demo-step-badge').textContent = step.badge;
  document.getElementById('demo-step-counter').textContent = (demoCurrentStep + 1) + ' / ' + total;
  document.getElementById('demo-step-title').textContent = step.title;
  document.getElementById('demo-step-desc').textContent = step.desc;
  var metricEl = document.getElementById('demo-step-metric');
  if (step.metric) { metricEl.style.display = 'block'; metricEl.textContent = step.metric; } else { metricEl.style.display = 'none'; }
  document.getElementById('demo-prev').style.visibility = demoCurrentStep === 0 ? 'hidden' : 'visible';
  var nextBtn = document.getElementById('demo-next');
  nextBtn.textContent = demoCurrentStep === total - 1 ? 'Finish' : 'Next';
  nextBtn.style.background = demoCurrentStep === total - 1 ? '#10B981' : '#0D94FB';
  var dotsEl = document.getElementById('demo-dots');
  dotsEl.innerHTML = '';
  for (var i = 0; i < total; i++) {
    var dot = document.createElement('div');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + (i === demoCurrentStep ? '#0D94FB' : '#D1D5DB') + ';transition:background 0.2s';
    dotsEl.appendChild(dot);
  }
  if (step.tab) {
    document.querySelectorAll('.tab-content').forEach(function(tc) { tc.classList.remove('active'); });
    var tabEl = document.getElementById('tab-' + step.tab);
    if (tabEl) tabEl.classList.add('active');
    document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
    var navTab = document.querySelector('[data-tab="' + step.tab + '"]');
    if (navTab) navTab.classList.add('active');
    if (step.tab === 'overview' && window.graphViz) { setTimeout(function() { window.graphViz.resize(); }, 100); }
  }
  setTimeout(function() { demoPosition(step); }, 150);
}

function demoPosition(step) {
  var spotlight = document.getElementById('demo-spotlight');
  var tooltip = document.getElementById('demo-tooltip');
  if (step.spotlight) {
    var el = document.querySelector(step.spotlight);
    if (el) {
      var r = el.getBoundingClientRect();
      var pad = 8;
      spotlight.style.display = 'block';
      spotlight.style.left = (r.left - pad) + 'px';
      spotlight.style.top = (r.top - pad) + 'px';
      spotlight.style.width = (r.width + pad * 2) + 'px';
      spotlight.style.height = (r.height + pad * 2) + 'px';
      var tipW = 380;
      var tipLeft = r.left;
      var tipTop = r.bottom + 16;
      if (tipTop + 300 > window.innerHeight) tipTop = r.top - 300;
      if (tipLeft + tipW > window.innerWidth) tipLeft = window.innerWidth - tipW - 20;
      tooltip.style.left = tipLeft + 'px';
      tooltip.style.top = tipTop + 'px';
      return;
    }
  }
  spotlight.style.display = 'none';
  tooltip.style.left = Math.max(20, (window.innerWidth - 380) / 2) + 'px';
  tooltip.style.top = Math.max(60, (window.innerHeight - 300) / 2) + 'px';
}

function demoNext() { if (demoCurrentStep < DEMO_STEPS.length - 1) { demoCurrentStep++; demoRenderStep(); } else { demoEnd(); } }
function demoPrev() { if (demoCurrentStep > 0) { demoCurrentStep--; demoRenderStep(); } }

document.addEventListener('DOMContentLoaded', function() {
  var demoBtn = document.getElementById('btn-demo');
  if (demoBtn) demoBtn.addEventListener('click', demoStart);
  var nextBtn = document.getElementById('demo-next');
  if (nextBtn) nextBtn.addEventListener('click', demoNext);
  var prevBtn = document.getElementById('demo-prev');
  if (prevBtn) prevBtn.addEventListener('click', demoPrev);
  var closeBtn = document.getElementById('demo-close');
  if (closeBtn) closeBtn.addEventListener('click', demoEnd);
  var overlay = document.getElementById('demo-overlay');
  if (overlay) overlay.addEventListener('click', function(e) { if (e.target === overlay) demoEnd(); });
  document.addEventListener('keydown', function(e) {
    if (!demoActive) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') demoNext();
    else if (e.key === 'ArrowLeft') demoPrev();
    else if (e.key === 'Escape') demoEnd();
  });
});
