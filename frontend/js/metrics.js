/**
 * Razorpay Sentinel — AI Performance & Economic Metrics Display
 * Formats precision, recall, confusion matrix, and cost-benefit ROI analysis.
 */

class MetricsDisplay {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    update(metricsData) {
        if (!this.container) return;
        if (!metricsData) {
            this.container.innerHTML = `
                <div class="empty-placeholder">
                    <p>Run detection to view AI metrics and economic analysis.</p>
                </div>
            `;
            return;
        }

        const m = metricsData.metrics || {};
        const costs = metricsData.cost_analysis?.costs || {};
        const cm = metricsData.confusion_matrix || {};

        const prec = ((m.precision || 0) * 100).toFixed(1);
        const rec = ((m.recall || 0) * 100).toFixed(1);
        const f1 = ((m.f1 || 0) * 100).toFixed(1);
        const fpr = ((m.false_positive_rate || 0) * 100).toFixed(1);

        this.container.innerHTML = `
            <div class="metric-row">
                <span class="metric-label">Model Precision (Accuracy of Flags)</span>
                <span class="metric-value ${m.precision >= 0.8 ? 'good' : m.precision >= 0.6 ? 'warning' : 'bad'}">${prec}%</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Model Recall (Coverage of Fraud Rings)</span>
                <span class="metric-value ${m.recall >= 0.8 ? 'good' : m.recall >= 0.6 ? 'warning' : 'bad'}">${rec}%</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Balanced F1-Score</span>
                <span class="metric-value ${m.f1 >= 0.8 ? 'good' : m.f1 >= 0.6 ? 'warning' : 'bad'}">${f1}%</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">False Positive Rate (Merchant Friction)</span>
                <span class="metric-value ${m.false_positive_rate <= 0.08 ? 'good' : m.false_positive_rate <= 0.2 ? 'warning' : 'bad'}">${fpr}%</span>
            </div>

            <div class="cost-summary">
                <div class="cost-row">
                    <span>Prevented Fraud Loss (True Positives)</span>
                    <span class="cost-positive">${cm.true_positives || 0} rings caught</span>
                </div>
                <div class="cost-row">
                    <span>Merchant Verification Friction (FP Cost)</span>
                    <span class="cost-negative">${costs.false_positive_cost || '₹0'}</span>
                </div>
                <div class="cost-row">
                    <span>Missed Fraud Loss (FN Cost)</span>
                    <span class="cost-negative">${costs.false_negative_cost || '₹0'}</span>
                </div>
                <div class="cost-row total">
                    <span>Net Merchant ROI Savings</span>
                    <span class="${(m.precision || 0) >= 0.5 ? 'cost-positive' : 'cost-negative'}">
                        ${costs.net_savings || '₹0'}
                    </span>
                </div>
            </div>
        `;
    }
}

window.MetricsDisplay = MetricsDisplay;
