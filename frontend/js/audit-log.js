/**
 * Razorpay Sentinel — SOC-2 / PCI DSS Compliant Audit Trail Module
 */

class AuditLog {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.entries = [];
    }

    update(entries) {
        this.entries = entries || [];
        if (!this.container) return;

        if (this.entries.length === 0) {
            this.container.innerHTML = `
                <div class="empty-placeholder">
                    <p>No audit events logged yet. Execute defense engine to populate.</p>
                </div>
            `;
            return;
        }

        const rowsHtml = this.entries.map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            const actionClass = this.getActionClass(entry.action_type);
            const conf = ((entry.confidence || 0) * 100).toFixed(1);
            const evidence = Array.isArray(entry.evidence) ? entry.evidence.join('; ') : (entry.evidence || 'N/A');

            return `
                <tr>
                    <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);">${time}</td>
                    <td style="font-family:var(--font-heading);font-weight:700;color:var(--rzp-blue-electric);">${entry.cluster_id || 'N/A'}</td>
                    <td><span class="audit-action-tag ${actionClass}">${entry.action_type}</span></td>
                    <td style="font-family:var(--font-mono);font-weight:700;color:${entry.confidence >= 0.85 ? 'var(--rzp-crimson)' : 'var(--rzp-amber)'};">${conf}%</td>
                    <td style="font-size:0.75rem;color:var(--text-secondary);max-width:320px;">${evidence}</td>
                    <td style="font-size:0.72rem;color:var(--text-muted);">${entry.reviewer_notes || 'Automated Trigger'}</td>
                </tr>
            `;
        }).join('');

        this.container.innerHTML = `
            <table class="audit-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Target Cluster</th>
                        <th>Defense Action</th>
                        <th>Confidence</th>
                        <th>Evidence Breakdown</th>
                        <th>Audit Note</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    }

    getActionClass(actionType) {
        switch (actionType) {
            case 'HOLD_PAYOUT': return 'hold';
            case 'FLAG_AND_VERIFY': return 'flag';
            case 'LOG_ONLY': return 'log';
            default: return 'log';
        }
    }
}

function exportAuditLog() {
    if (!window.auditLog || !window.auditLog.entries || window.auditLog.entries.length === 0) {
        alert('No audit logs available to export.');
        return;
    }

    const headers = ['ID', 'Timestamp', 'Cluster ID', 'Action Type', 'Confidence', 'Evidence', 'Reviewer Notes'];
    const rows = window.auditLog.entries.map(e => [
        `"${e.id || ''}"`,
        `"${e.timestamp || ''}"`,
        `"${e.cluster_id || ''}"`,
        `"${e.action_type || ''}"`,
        `"${((e.confidence || 0) * 100).toFixed(1)}%"`,
        `"${(Array.isArray(e.evidence) ? e.evidence.join('; ') : (e.evidence || '')).replace(/"/g, '""')}"`,
        `"${(e.reviewer_notes || 'Automated').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `razorpay_sentinel_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.AuditLog = AuditLog;
window.exportAuditLog = exportAuditLog;
