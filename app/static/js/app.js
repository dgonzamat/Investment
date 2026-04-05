let currentTab = 'all';
let pollingInterval = null;
const POLL_MS = 60000;

// ============ Tab Switching ============
function switchTab(type) {
    currentTab = type;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-type="${type}"]`).classList.add('active');
    closeDetail();
    loadDashboard();
}

// ============ Load Dashboard ============
async function loadDashboard() {
    loadAlerts();
    loadRecommendations();
}

async function loadAlerts() {
    const grid = document.getElementById('alertsGrid');
    grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading alerts...</div>';

    try {
        const data = await fetchAlerts(currentTab);
        renderAlerts(data.alerts || []);
    } catch (e) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Could not load alerts</p></div>`;
    }
}

async function loadRecommendations() {
    const grid = document.getElementById('recommendationsGrid');
    grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Analyzing markets...</div>';

    try {
        const data = await fetchRecommendations(currentTab);
        renderRecommendations(data.recommendations || []);
        document.getElementById('lastUpdate').textContent =
            `Updated: ${new Date(data.last_updated).toLocaleTimeString()}`;
    } catch (e) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Could not load recommendations. API rate limit may have been reached. Try again in a few minutes.</p></div>`;
    }
}

// ============ Render Alerts ============
function renderAlerts(alerts) {
    const grid = document.getElementById('alertsGrid');

    if (alerts.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No active alerts</p></div>';
        return;
    }

    grid.innerHTML = alerts.map(a => {
        const isBuy = a.signal.includes('BUY');
        const cls = isBuy ? 'buy' : 'sell';
        const icon = isBuy ? 'fa-arrow-up' : 'fa-arrow-down';
        const signalLabel = formatSignal(a.signal);

        return `
            <div class="alert-card ${cls}" onclick="openDetail('${a.asset_type}', '${a.symbol}')">
                <div class="alert-symbol">${a.symbol.toUpperCase()}</div>
                <div class="alert-signal" style="color: ${getSignalColor(a.score)}">
                    <i class="fas ${icon}"></i> ${signalLabel}
                </div>
                <div class="alert-score">Score: ${a.score}/100</div>
                ${a.price ? `<div class="alert-price">$${formatPrice(a.price)}</div>` : ''}
            </div>
        `;
    }).join('');
}

// ============ Render Recommendations ============
function renderRecommendations(recs) {
    const grid = document.getElementById('recommendationsGrid');

    if (recs.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No recommendations available</p></div>';
        return;
    }

    grid.innerHTML = recs.map(r => {
        const color = getSignalColor(r.score);
        const changeClass = r.change_pct >= 0 ? 'positive' : 'negative';
        const changeIcon = r.change_pct >= 0 ? 'fa-caret-up' : 'fa-caret-down';

        return `
            <div class="rec-card" onclick="openDetail('${r.asset_type}', '${r.symbol}')">
                <div class="rec-card-header">
                    <div>
                        <div class="rec-card-symbol">${r.symbol.toUpperCase()}</div>
                        <div class="rec-card-type">${r.asset_type}</div>
                    </div>
                    <span class="signal-badge signal-${r.signal}">${formatSignal(r.signal)}</span>
                </div>
                <div class="rec-card-price">$${formatPrice(r.current_price)}</div>
                <div class="rec-card-change ${changeClass}">
                    <i class="fas ${changeIcon}"></i> ${Math.abs(r.change_pct).toFixed(2)}%
                </div>
                <div class="rec-card-score-bar">
                    <div class="rec-card-score-fill" style="width:${r.score}%; background:${color}"></div>
                </div>
                <div class="rec-card-bottom">
                    <span class="rec-card-score-label">Score: ${r.score}/100</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============ Detail Panel ============
async function openDetail(assetType, symbol) {
    const panel = document.getElementById('detailPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });

    document.getElementById('detailTitle').textContent = `${symbol.toUpperCase()} Analysis`;
    document.getElementById('detailSignal').textContent = 'Loading...';
    document.getElementById('detailSignal').className = 'signal-badge signal-NEUTRAL';
    document.getElementById('detailPrice').textContent = '';
    document.getElementById('indicatorBars').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const [analysis, marketData] = await Promise.all([
            fetchAnalysis(assetType, symbol),
            fetchMarketData(assetType, symbol),
        ]);

        // Gauge
        renderGauge('gaugeChart', analysis.score);

        // Signal badge
        const signalEl = document.getElementById('detailSignal');
        signalEl.textContent = formatSignal(analysis.signal);
        signalEl.className = `signal-badge signal-${analysis.signal}`;

        // Price
        const changeClass = analysis.change_pct >= 0 ? 'positive' : 'negative';
        const changeIcon = analysis.change_pct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        document.getElementById('detailPrice').innerHTML = `
            $${formatPrice(analysis.current_price)}
            <span class="rec-card-change ${changeClass}" style="font-size:1rem; margin-left:8px;">
                <i class="fas ${changeIcon}"></i> ${Math.abs(analysis.change_pct).toFixed(2)}%
            </span>
        `;

        // Indicator bars
        renderIndicatorBars(analysis.indicators);

        // Price chart
        if (marketData.prices && marketData.prices.length > 0) {
            renderPriceChart('priceChart', marketData.prices);
        }
    } catch (e) {
        document.getElementById('indicatorBars').innerHTML =
            `<div class="empty-state"><p>Error loading analysis: ${e.message}</p></div>`;
    }
}

function renderIndicatorBars(indicators) {
    const container = document.getElementById('indicatorBars');
    const names = {
        ma: 'Moving Avg',
        rsi: 'RSI',
        macd: 'MACD',
        bollinger: 'Bollinger',
        volume: 'Volume',
        stochastic: 'Stochastic',
        pivot: 'Pivot',
    };

    container.innerHTML = Object.entries(indicators).map(([key, val]) => {
        const color = getSignalColor(val);
        return `
            <div class="indicator-bar">
                <span class="label">${names[key] || key}</span>
                <div class="bar-bg">
                    <div class="bar-fill" style="width:${val}%; background:${color}"></div>
                </div>
                <span class="value" style="color:${color}">${val}</span>
            </div>
        `;
    }).join('');
}

function closeDetail() {
    document.getElementById('detailPanel').style.display = 'none';
}

// ============ Search ============
function searchSymbol() {
    const input = document.getElementById('searchInput').value.trim();
    const type = document.getElementById('searchType').value;
    if (!input) return;
    openDetail(type, input);
}

document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchSymbol();
});

// ============ Helpers ============
function formatSignal(signal) {
    const map = {
        STRONG_BUY: 'Strong Buy',
        BUY: 'Buy',
        WEAK_BUY: 'Weak Buy',
        NEUTRAL: 'Neutral',
        WEAK_SELL: 'Weak Sell',
        SELL: 'Sell',
        STRONG_SELL: 'Strong Sell',
    };
    return map[signal] || signal;
}

function formatPrice(price) {
    if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
}

// ============ Polling ============
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(loadDashboard, POLL_MS);
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    startPolling();
});
