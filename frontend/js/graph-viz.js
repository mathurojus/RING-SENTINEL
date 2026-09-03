/**
 * Ring Sentinel - Graph Visualizer v3
 * Engine: force-graph
 */

class GraphVisualizer {
  constructor(mountId) {
    this.mountEl = document.getElementById(mountId);
    this.graph = null;
    this.filter = "all";
    this._rawData = { nodes: [], links: [] };
    this._initDone = false;
    this._hoveredNode = null;
    this._selectedNode = null;
    this._time = 0;
    this._tooltip = null;
    this._animFrame = null;
    this._connectedIds = new Set();
  }

  _createTooltip() {
    if (this._tooltip) return;
    var tip = document.createElement("div");
    tip.className = "graph-tooltip";
    tip.style.cssText = "position:fixed;pointer-events:none;z-index:9999;display:none;background:#fff;border:1px solid #E2E6EC;border-radius:6px;padding:10px 14px;box-shadow:0 4px 20px rgba(0,0,0,0.12);font-family:'IBM Plex Mono',monospace;font-size:11px;max-width:260px;line-height:1.5;color:#0E1726;";
    document.body.appendChild(tip);
    this._tooltip = tip;
  }

  _showTooltip(node) {
    if (!this._tooltip || !node) return;
    var html = '<b>' + node.id + '</b><br>';
    if (node.is_fraud) { html += '<span style="color:#FF3553">FLAGGED FRAUD</span>'; }
    else { html += '<span style="color:#0D94FB">Verified Customer</span>'; }
    if (node.ring_id) html += '<br>Ring: ' + node.ring_id;
    if (node.cluster_id) html += '<br>Cluster: ' + node.cluster_id;
    if (node.type) html += '<br>Type: ' + node.type;
    var n = this._getNeighborCount(node.id);
    html += '<br>Connections: ' + n;
    this._tooltip.innerHTML = html;
    this._tooltip.style.display = 'block';
  }

  _moveTooltip(evt) {
    if (!this._tooltip || !evt) return;
    this._tooltip.style.left = (evt.clientX + 14) + "px";
    this._tooltip.style.top = (evt.clientY - 10) + "px";
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = "none";
  }

  _getNeighborCount(nodeId) {
    if (!this.graph) return 0;
    var links = this.graph.graphData().links;
    var count = 0;
    for (var i = 0; i < links.length; i++) {
      var s = typeof links[i].source === "object" ? links[i].source.id : links[i].source;
      var t = typeof links[i].target === "object" ? links[i].target.id : links[i].target;
      if (s === nodeId || t === nodeId) count++;
    }
    return count;
  }

  _getConnectedIds(nodeId) {
    if (!this.graph) return new Set();
    var links = this.graph.graphData().links;
    var ids = new Set([nodeId]);
    for (var i = 0; i < links.length; i++) {
      var s = typeof links[i].source === "object" ? links[i].source.id : links[i].source;
      var t = typeof links[i].target === "object" ? links[i].target.id : links[i].target;
      if (s === nodeId) ids.add(t);
      if (t === nodeId) ids.add(s);
    }
    return ids;
  }

  _initGraph() {
    if (this._initDone || !this.mountEl) return;
    var w = this.mountEl.clientWidth || 900;
    var h = this.mountEl.clientHeight || 500;
    var self = this;
    this._createTooltip();
    this.graph = ForceGraph()(this.mountEl)
      .width(w).height(h).backgroundColor("transparent")
      .linkDirectionalParticles(function(link) {
        var t = (link.edge_type || "").toLowerCase();
        if (t.indexOf("device") >= 0 || t.indexOf("ip") >= 0 || t.indexOf("pm") >= 0 || t.indexOf("payment") >= 0) return 2;
        if (link.weight >= 3) return 1;
        return 0;
      })
      .linkDirectionalParticleColor(function(link) {
        var t = (link.edge_type || "").toLowerCase();
        if (t.indexOf("pm") >= 0 || t.indexOf("payment") >= 0) return "#FF3553";
        return "#0D94FB";
      })
      .linkDirectionalParticleWidth(2.0)
      .linkDirectionalParticleSpeed(0.006)
      .linkWidth(function(link) { return Math.min(3.5, (link.weight || 1) * 0.5); })
      .linkLineDash(function(link) {
        var t = (link.edge_type || "").toLowerCase();
        if (t.indexOf("temporal") >= 0) return [6, 4];
        return null;
      })
      .linkCanvasObject(function(link, ctx, gs) {
        if (!link.source || !link.target) return;
        var sx = link.source.x, sy = link.source.y;
        var tx = link.target.x, ty = link.target.y;
        if (!isFinite(sx) || !isFinite(tx)) return;
        var t = (link.edge_type || "").toLowerCase();
        var lw = Math.min(3.5, (link.weight || 1) * 0.5);
        var alpha = Math.min(0.7, 0.15 + (link.weight || 1) * 0.07);
        ctx.save();
        if (link.weight >= 4) {
          ctx.shadowColor = (t.indexOf("pm") >= 0 || t.indexOf("payment") >= 0) ? "rgba(255,53,83,0.3)" : "rgba(13,148,251,0.3)";
          ctx.shadowBlur = 8;
        }
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
        if (t.indexOf("pm") >= 0 || t.indexOf("payment") >= 0) {
          ctx.strokeStyle = "rgba(255,53,83," + alpha + ")";
        } else if (t.indexOf("temporal") >= 0) {
          ctx.setLineDash([8, 5]);
          ctx.lineDashOffset = -self._time * 0.5;
          ctx.strokeStyle = "rgba(13,148,251," + (alpha * 0.6) + ")";
        } else {
          ctx.strokeStyle = "rgba(13,148,251," + alpha + ")";
        }
        ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
      })
      .linkCanvasObjectMode(function() { return "replace"; })

      .nodeCanvasObject(function(node, ctx, gs) {
        if (!isFinite(node.x) || !isFinite(node.y)) return;
        var r = node.is_fraud ? 8 : 4.5;
        var hov = (self._hoveredNode === node);
        var dimmed = self._selectedNode && self._connectedIds.size > 0 && !self._connectedIds.has(node.id) && self._selectedNode !== node;
        ctx.save();
        if (dimmed) ctx.globalAlpha = 0.15;
        var dx = node.x + Math.sin(self._time * 0.002 + node.x * 0.1) * 0.8;
        var dy = node.y + Math.cos(self._time * 0.0017 + node.y * 0.1) * 0.6;
        if (node.is_fraud) {
          var p1 = (Math.sin(self._time * 0.004 + node.x) + 1) / 2;
          var pr1 = r + 6 + p1 * 6;
          var g1 = ctx.createRadialGradient(dx, dy, r, dx, dy, pr1);
          g1.addColorStop(0, "rgba(255,53,83," + (0.25 - p1 * 0.18) + ")");
          g1.addColorStop(1, "rgba(255,53,83,0)");
          ctx.beginPath(); ctx.arc(dx, dy, pr1, 0, 2 * Math.PI); ctx.fillStyle = g1; ctx.fill();
          var p2 = (Math.sin(self._time * 0.003 + node.x * 2) + 1) / 2;
          var pr2 = r + 10 + p2 * 8;
          var g2 = ctx.createRadialGradient(dx, dy, r + 4, dx, dy, pr2);
          g2.addColorStop(0, "rgba(255,53,83," + (p2 * 0.12) + ")");
          g2.addColorStop(1, "rgba(255,53,83,0)");
          ctx.beginPath(); ctx.arc(dx, dy, pr2, 0, 2 * Math.PI); ctx.fillStyle = g2; ctx.fill();
          ctx.shadowColor = hov ? "rgba(255,53,83,0.5)" : "rgba(255,53,83,0.3)";
          ctx.shadowBlur = hov ? 20 : 14;
          var cg = ctx.createRadialGradient(dx - 1, dy - 1, 0, dx, dy, r);
          cg.addColorStop(0, hov ? "#FF8A9A" : "#FF6B82");
          cg.addColorStop(1, "#E8203C");
          ctx.beginPath(); ctx.arc(dx, dy, hov ? r + 2 : r, 0, 2 * Math.PI); ctx.fillStyle = cg; ctx.fill();
        } else {
          var br = 1 + Math.sin(self._time * 0.0025 + node.y * 0.15) * 0.08;
          var dr = r * br;
          ctx.shadowColor = hov ? "rgba(13,148,251,0.5)" : "rgba(13,148,251,0.2)";
          ctx.shadowBlur = hov ? 16 : 8;
          var cg2 = ctx.createRadialGradient(dx - 0.5, dy - 0.5, 0, dx, dy, dr);
          cg2.addColorStop(0, hov ? "#5CC0FF" : "#3DAEFF");
          cg2.addColorStop(1, "#0D84E8");
          ctx.beginPath(); ctx.arc(dx, dy, dr, 0, 2 * Math.PI); ctx.fillStyle = cg2; ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(dx, dy, (hov ? r + 2 : r) + 0.5, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255," + (hov ? 0.95 : 0.7) + ")";
        ctx.lineWidth = hov ? 2.5 : 1.5; ctx.stroke();
        if (node.is_fraud && gs >= 0.5) {
          var lb = node.id.replace("CUST-", "");
          ctx.font = "600 " + Math.max(7, 9/gs) + "px 'IBM Plex Mono',monospace";
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#0E1726";
          ctx.fillText(lb, dx, dy - r - 8);
        }
        if (hov && gs >= 0.3) {
          ctx.font = "600 " + Math.max(8, 10/gs) + "px 'IBM Plex Mono',monospace";
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#0E1726";
          ctx.fillText(node.id, dx, dy - r - 10);
        }
        ctx.restore();
      })
      .nodeCanvasObjectMode(function() { return "replace"; })

      .onNodeClick(function(node) {
        if (self._selectedNode === node) {
          self._selectedNode = null; self._connectedIds = new Set();
        } else {
          self._selectedNode = node; self._connectedIds = self._getConnectedIds(node.id);
          if (self.graph) { self.graph.centerAt(node.x, node.y, 400); self.graph.zoom(2, 400); }
        }
        if (window.openEntityDrawer) window.openEntityDrawer(node);
      })
      .onNodeHover(function(node) {
        self._hoveredNode = node;
        if (self.mountEl) self.mountEl.style.cursor = node ? "pointer" : "default";
        if (node) self._showTooltip(node); else self._hideTooltip();
      })
      .onBackgroundClick(function() {
        self._selectedNode = null; self._connectedIds = new Set(); self._hideTooltip();
      })
      .onZoom(function() { self._hideTooltip(); })
      .d3AlphaDecay(0.022).d3VelocityDecay(0.35).cooldownTicks(200);
    this._initDone = true;
    this.graph.d3Force("charge").strength(function(n) { return n.is_fraud ? -220 : -50; });
    this.graph.d3Force("link").distance(function(l) {
      var t = (l.edge_type || "").toLowerCase();
      if (t.indexOf("device") >= 0) return 35;
      if (t.indexOf("pm") >= 0 || t.indexOf("payment") >= 0) return 40;
      if (t.indexOf("ip") >= 0) return 50;
      return 60;
    });
    this.mountEl.addEventListener("mousemove", function(e) { self._moveTooltip(e); });
    var animate = function() { self._time++; requestAnimationFrame(animate); };
    animate();
    window.addEventListener("resize", function() {
      if (!self.graph || !self.mountEl) return;
      self.graph.width(self.mountEl.clientWidth).height(self.mountEl.clientHeight);
    });
  }

  update(graphData) {
    if (!graphData) return; this._initGraph();
    var loader = document.getElementById("graph-loader");
    if (loader) loader.style.display = "none";
    if (this.mountEl) this.mountEl.classList.add("loaded");
    var rawNodes = graphData.nodes || [];
    var rawEdges = graphData.edges || [];
    var displayNodes = rawNodes.filter(function(n) { return n.type === "customer" || !n.type; });
    if (this.filter === "fraud") displayNodes = displayNodes.filter(function(n) { return n.is_fraud; });
    else if (this.filter === "clusters") displayNodes = displayNodes.filter(function(n) { return n.is_fraud || n.ring_id; });
    var visibleIds = new Set(displayNodes.map(function(n) { return n.id; }));
    var displayLinks = rawEdges.filter(function(e) {
      var s = typeof e.source === "object" ? e.source.id : e.source;
      var t = typeof e.target === "object" ? e.target.id : e.target;
      return visibleIds.has(s) && visibleIds.has(t) && s !== t;
    }).map(function(e) {
      return { source: typeof e.source === "object" ? e.source.id : e.source, target: typeof e.target === "object" ? e.target.id : e.target, edge_type: e.type || e.edge_type || "shared_attribute", weight: e.weight || 1, is_fraud_link: !!(e.is_fraud_link) };
    });
    this._rawData = graphData;
    var meta = document.getElementById("graph-meta");
    if (meta) meta.textContent = displayNodes.length + " nodes · " + displayLinks.length + " edges";
    if (this.graph) this.graph.graphData({ nodes: displayNodes, links: displayLinks });
  }

  zoomIn() { if (!this.graph) return; var z = this.graph.zoom(); this.graph.zoom(z.k * 1.4, 300); }
  zoomOut() { if (!this.graph) return; var z = this.graph.zoom(); this.graph.zoom(z.k * 0.7, 300); }
  center() { if (!this.graph) return; this._selectedNode = null; this._connectedIds = new Set(); this.graph.zoomToFit(400, 40); }
  spotlightCluster(cid) {
    if (!this.graph) return;
    var ns = this.graph.graphData().nodes, ls = this.graph.graphData().links, cn = new Set();
    ns.forEach(function(n) { if (n.ring_id === cid || n.cluster_id === cid) cn.add(n.id); });
    ls.forEach(function(l) {
      var s = typeof l.source === "object" ? l.source.id : l.source;
      var t = typeof l.target === "object" ? l.target.id : l.target;
      if (cn.has(s)) cn.add(t); if (cn.has(t)) cn.add(s);
    });
    this._selectedNode = null; this._connectedIds = cn;
    this.graph.nodeColor(function(n) { return cn.size > 0 && !cn.has(n.id) ? "rgba(200,205,213,0.3)" : (n.is_fraud ? "#FF3553" : "#0D94FB"); });
    this.graph.linkColor(function(l) {
      var s = typeof l.source === "object" ? l.source.id : l.source;
      var t = typeof l.target === "object" ? l.target.id : l.target;
      if (cn.has(s) && cn.has(t)) return "rgba(13,148,251,0.5)";
      return "rgba(200,205,213,0.1)";
    });
  }
  resize() { if (!this.graph || !this.mountEl) return; this.graph.width(this.mountEl.clientWidth).height(this.mountEl.clientHeight); }
}

window.GraphVisualizer = GraphVisualizer;
