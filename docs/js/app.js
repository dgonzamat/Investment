let currentTab = 'all';
let currentSort = 'score';
let allRecommendations = [];
let pollingInterval = null;
const POLL_MS = 120000;

// ============ Tab Switching ============
function switchTab(type) {
    currentTab = type;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-type="${type}"]`).classList.add('active');
    closeDetail();
    loadDashboard();
}

// ============ Sorting ============
function sortCards(method) {
    currentSort = method;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderRecommendations(sortData(allRecommendations));
}

function sortData(recs) {
    const sorted = [...recs];
    switch (currentSort) {
        case 'score': sorted.sort((a, b) => b.score - a.score); break;
        case 'change': sorted.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)); break;
        case 'name': sorted.sort((a, b) => a.symbol.localeCompare(b.symbol)); break;
    }
    return sorted;
}

// ============ Load Dashboard ============
async function loadDashboard() {
    const grid = document.getElementById('recommendationsGrid');
    const alertsGrid = document.getElementById('alertsGrid');
    grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Analyzing markets...</div>';
    alertsGrid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Scanning signals...</div>';

    try {
        const data = await fetchAllRecommendations(currentTab);
        allRecommendations = data.recommendations;
        renderRecommendations(sortData(allRecommendations));
        renderAlerts(data.alerts);
        updateMarketSummary(data.recommendations, data.alerts);
        updateTabCounts(data.recommendations);
        document.getElementById('lastUpdate').textContent =
            `Updated: ${new Date(data.lastUpdated).toLocaleTimeString()}`;
    } catch (e) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ${e.message}</p></div>`;
    }
}

// ============ Market Summary ============
function updateMarketSummary(recs, alerts) {
    const bulls = recs.filter(r => r.score >= 55).length;
    const bears = recs.filter(r => r.score <= 45).length;
    const neutrals = recs.length - bulls - bears;
    const avg = recs.length > 0 ? recs.reduce((s, r) => s + r.score, 0) / recs.length : 50;

    document.getElementById('bullCount').textContent = bulls;
    document.getElementById('bearCount').textContent = bears;
    document.getElementById('neutralCount').textContent = neutrals;
    document.getElementById('avgScore').textContent = avg.toFixed(1);
    document.getElementById('avgScore').style.color = getSignalColor(avg);
    document.getElementById('alertCount').textContent = alerts.length;
}

function updateTabCounts(recs) {
    const counts = { all: recs.length, stocks: 0, etfs: 0, crypto: 0, forex: 0 };
    recs.forEach(r => { if (counts[r.assetType] !== undefined) counts[r.assetType]++; });
    for (const [key, val] of Object.entries(counts)) {
        const el = document.getElementById('count' + key.charAt(0).toUpperCase() + key.slice(1));
        if (el) el.textContent = val;
    }
}

// ============ Render Alerts ============
function renderAlerts(alerts) {
    const grid = document.getElementById('alertsGrid');
    if (!alerts.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No strong signals detected - market is balanced</p></div>';
        return;
    }
    grid.innerHTML = alerts.slice(0, 12).map(a => {
        const isBuy = a.signal.includes('BUY');
        const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const meta = a.meta || {};
        return `
            <div class="alert-card ${isBuy ? 'buy' : 'sell'}" onclick="openDetail('${a.assetType}', '${a.symbol}')">
                <div class="alert-header">
                    <span class="alert-symbol">${a.symbol.toUpperCase()}</span>
                    <span class="alert-type-badge">${a.assetType}</span>
                </div>
                <div class="alert-signal" style="color:${getSignalColor(a.score)}">
                    <i class="fas ${icon}"></i> ${formatSignal(a.signal)}
                </div>
                <div class="alert-meta">
                    <span>Score: <b>${a.score}</b></span>
                    <span>$${formatPrice(a.currentPrice)}</span>
                </div>
                ${meta.trendStrength ? `<div class="alert-trend"><i class="fas fa-chart-line"></i> ${meta.trendStrength} trend | Vol: ${meta.volatility}</div>` : ''}
            </div>`;
    }).join('');
}

// ============ Render Recommendations ============
function renderRecommendations(recs) {
    const grid = document.getElementById('recommendationsGrid');
    if (!recs.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No data available</p></div>';
        return;
    }
    grid.innerHTML = recs.map(r => {
        const color = getSignalColor(r.score);
        const changeClass = r.changePct >= 0 ? 'positive' : 'negative';
        const changeIcon = r.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        const meta = r.meta || {};
        return `
            <div class="rec-card" onclick="openDetail('${r.assetType}', '${r.symbol}')">
                <div class="rec-card-header">
                    <div>
                        <div class="rec-card-symbol">${r.symbol.toUpperCase()}</div>
                        <div class="rec-card-type">${r.assetType}</div>
                    </div>
                    <span class="signal-badge signal-${r.signal}">${formatSignal(r.signal)}</span>
                </div>
                <div class="rec-card-price">$${formatPrice(r.currentPrice)}</div>
                <div class="rec-card-change ${changeClass}">
                    <i class="fas ${changeIcon}"></i> ${Math.abs(r.changePct).toFixed(2)}%
                </div>
                <div class="rec-card-score-bar">
                    <div class="rec-card-score-fill" style="width:${r.score}%; background:${color}"></div>
                </div>
                <div class="rec-card-bottom">
                    <span class="rec-card-score-label">Score: ${r.score}/100</span>
                    <div class="mini-indicators">
                        ${Object.entries(r.indicators).slice(0, 5).map(([k, v]) =>
                            `<span class="mini-ind" style="color:${getSignalColor(v)}" title="${k}: ${v}">${k.slice(0,2).toUpperCase()}</span>`
                        ).join('')}
                    </div>
                </div>
                ${meta.trendStrength ? `<div class="rec-card-meta">
                    <span class="meta-tag"><i class="fas fa-chart-line"></i> ${meta.trendStrength}</span>
                    <span class="meta-tag"><i class="fas fa-bolt"></i> Vol: ${meta.volatility}</span>
                    ${meta.confluenceBull >= 5 ? '<span class="meta-tag" style="color:var(--green)"><i class="fas fa-check-double"></i> High Confluence</span>' : ''}
                    ${meta.confluenceBear >= 5 ? '<span class="meta-tag" style="color:var(--red)"><i class="fas fa-exclamation-double"></i> Bear Confluence</span>' : ''}
                </div>` : ''}
            </div>`;
    }).join('');
}

// ============ Detail Panel ============
async function openDetail(assetType, symbol) {
    const panel = document.getElementById('detailPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('detailTitle').textContent = `${symbol.toUpperCase()} - Detailed Analysis`;
    document.getElementById('indicatorBars').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    document.getElementById('detailMeta').innerHTML = '';

    try {
        const analysis = await analyzeSymbol(symbol, assetType);
        if (!analysis) throw new Error('No data');

        renderGauge('gaugeChart', analysis.score);

        const signalEl = document.getElementById('detailSignal');
        signalEl.textContent = formatSignal(analysis.signal);
        signalEl.className = `signal-badge signal-${analysis.signal}`;

        const changeClass = analysis.changePct >= 0 ? 'positive' : 'negative';
        const changeIcon = analysis.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        document.getElementById('detailPrice').innerHTML = `
            $${formatPrice(analysis.currentPrice)}
            <span class="rec-card-change ${changeClass}" style="font-size:1rem;margin-left:8px">
                <i class="fas ${changeIcon}"></i> ${Math.abs(analysis.changePct).toFixed(2)}%
            </span>`;

        // Meta info
        const meta = analysis.meta || {};
        document.getElementById('detailMeta').innerHTML = `
            <div class="detail-meta-item"><span>Trend Strength</span><span class="meta-val">${meta.trendStrength || 'N/A'}</span></div>
            <div class="detail-meta-item"><span>Volatility</span><span class="meta-val">${meta.volatility || 'N/A'} (${meta.volatilityPct || 0}%)</span></div>
            <div class="detail-meta-item"><span>ADX</span><span class="meta-val">${meta.adx || 'N/A'}</span></div>
            <div class="detail-meta-item"><span>Bull Indicators</span><span class="meta-val" style="color:var(--green)">${meta.confluenceBull || 0}/9</span></div>
            <div class="detail-meta-item"><span>Bear Indicators</span><span class="meta-val" style="color:var(--red)">${meta.confluenceBear || 0}/9</span></div>
        `;

        renderIndicatorBars(analysis.indicators);
        renderPriceChart('priceChart', analysis.prices);
        renderRSIChart('rsiChart', analysis.prices);
    } catch (e) {
        document.getElementById('indicatorBars').innerHTML =
            `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
}

function renderIndicatorBars(indicators) {
    const names = { ma: 'Moving Avg', rsi: 'RSI', macd: 'MACD', bollinger: 'Bollinger', volume: 'Volume', stochastic: 'Stochastic', pivot: 'Pivot Pts', divergence: 'Divergence', trend: 'ADX Trend' };
    const weights = { ma: '18%', macd: '18%', rsi: '14%', bollinger: '12%', volume: '12%', stochastic: '8%', pivot: '5%', divergence: '8%', trend: '5%' };
    document.getElementById('indicatorBars').innerHTML = Object.entries(indicators).map(([key, val]) => {
        const color = getSignalColor(val);
        const signal = val >= 65 ? 'BUY' : val <= 35 ? 'SELL' : 'HOLD';
        const sigColor = val >= 65 ? '#4caf50' : val <= 35 ? '#f44336' : '#ffd600';
        return `
            <div class="indicator-bar">
                <div class="indicator-info">
                    <span class="label">${names[key] || key}</span>
                    <span class="weight">${weights[key] || ''}</span>
                </div>
                <div class="bar-bg">
                    <div class="bar-fill" style="width:${val}%; background:${color}"></div>
                </div>
                <div class="indicator-values">
                    <span class="value" style="color:${color}">${val}</span>
                    <span class="signal-mini" style="color:${sigColor}">${signal}</span>
                </div>
            </div>`;
    }).join('');
}

function closeDetail() { document.getElementById('detailPanel').style.display = 'none'; }

// ============ Search ============
function searchSymbol() {
    const input = document.getElementById('searchInput').value.trim();
    const type = document.getElementById('searchType').value;
    if (!input) return;
    openDetail(type, input);
}

// ============ Helpers ============
function formatSignal(s) {
    return { STRONG_BUY: 'Strong Buy', BUY: 'Buy', WEAK_BUY: 'Weak Buy', NEUTRAL: 'Neutral', WEAK_SELL: 'Weak Sell', SELL: 'Sell', STRONG_SELL: 'Strong Sell' }[s] || s;
}

function formatPrice(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    if (p >= 0.01) return p.toFixed(4);
    return p.toFixed(6);
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('keypress', e => { if (e.key === 'Enter') searchSymbol(); });
    loadDashboard();
    pollingInterval = setInterval(loadDashboard, POLL_MS);
});
