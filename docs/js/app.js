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
        renderActionPanel(allRecommendations);
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

// ============ Render Action Panel (COMPRAR / VENDER) ============
function renderActionPanel(recs) {
    const buyList = document.getElementById('buyActions');
    const sellList = document.getElementById('sellActions');

    const buys = recs.filter(r => r.score >= 65).sort((a, b) => b.score - a.score).slice(0, 5);
    const sells = recs.filter(r => r.score <= 35).sort((a, b) => a.score - b.score).slice(0, 5);

    if (buys.length === 0) {
        buyList.innerHTML = '<div class="action-empty"><i class="fas fa-pause-circle"></i>Sin señales de compra fuertes en este momento. Espere mejores oportunidades.</div>';
    } else {
        buyList.innerHTML = buys.map(r => {
            const cur = r.currency || 'USD';
            const name = r.displayName || r.symbol.toUpperCase();
            const reason = r.reasonText || {};
            const isStrong = r.score >= 80;
            const changeClass = r.changePct >= 0 ? 'positive' : 'negative';
            const changeIcon = r.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
            return `
                <div class="action-card ${isStrong ? 'strong-buy' : ''}" onclick="openDetail('${r.assetType}', '${r.symbol}')">
                    <div class="action-card-action" style="color:var(--green-strong)">${reason.action || '🟢 Comprar'}</div>
                    <div class="action-card-top">
                        <span class="action-card-name">${name}</span>
                        <span class="action-card-score" style="color:${getSignalColor(r.score)}">${r.score}/100</span>
                    </div>
                    <div>
                        <span class="action-card-price">${currencySymbol(cur)}${formatPrice(r.currentPrice, cur)}</span>
                        <span class="action-card-change ${changeClass}"><i class="fas ${changeIcon}"></i> ${Math.abs(r.changePct).toFixed(2)}%</span>
                    </div>
                    ${reason.reasons ? `<div class="action-card-reason"><i class="fas fa-info-circle"></i> ${reason.reasons}</div>` : ''}
                </div>`;
        }).join('');
    }

    if (sells.length === 0) {
        sellList.innerHTML = '<div class="action-empty"><i class="fas fa-shield-alt"></i>Sin señales de venta fuertes. Posiciones actuales seguras.</div>';
    } else {
        sellList.innerHTML = sells.map(r => {
            const cur = r.currency || 'USD';
            const name = r.displayName || r.symbol.toUpperCase();
            const reason = r.reasonText || {};
            const isStrong = r.score <= 20;
            const changeClass = r.changePct >= 0 ? 'positive' : 'negative';
            const changeIcon = r.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
            return `
                <div class="action-card ${isStrong ? 'strong-sell' : ''}" onclick="openDetail('${r.assetType}', '${r.symbol}')">
                    <div class="action-card-action" style="color:var(--red-strong)">${reason.action || '🔴 Vender'}</div>
                    <div class="action-card-top">
                        <span class="action-card-name">${name}</span>
                        <span class="action-card-score" style="color:${getSignalColor(r.score)}">${r.score}/100</span>
                    </div>
                    <div>
                        <span class="action-card-price">${currencySymbol(cur)}${formatPrice(r.currentPrice, cur)}</span>
                        <span class="action-card-change ${changeClass}"><i class="fas ${changeIcon}"></i> ${Math.abs(r.changePct).toFixed(2)}%</span>
                    </div>
                    ${reason.reasons ? `<div class="action-card-reason"><i class="fas fa-exclamation-circle"></i> ${reason.reasons}</div>` : ''}
                </div>`;
        }).join('');
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
        const cur = a.currency || 'USD';
        const name = a.displayName || a.symbol.toUpperCase();
        return `
            <div class="alert-card ${isBuy ? 'buy' : 'sell'}" onclick="openDetail('${a.assetType}', '${a.symbol}')">
                <div class="alert-header">
                    <span class="alert-symbol">${name}</span>
                    <span class="alert-type-badge">${getAssetTypeLabel(a.assetType)}</span>
                </div>
                <div class="alert-signal" style="color:${getSignalColor(a.score)}">
                    <i class="fas ${icon}"></i> ${formatSignal(a.signal)}
                </div>
                <div class="alert-meta">
                    <span>Score: <b>${a.score}</b></span>
                    <span>${currencySymbol(cur)}${formatPrice(a.currentPrice, cur)}</span>
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
        const cur = r.currency || 'USD';
        const name = r.displayName || r.symbol.toUpperCase();
        return `
            <div class="rec-card" onclick="openDetail('${r.assetType}', '${r.symbol}')">
                <div class="rec-card-header">
                    <div>
                        <div class="rec-card-symbol">${name}</div>
                        <div class="rec-card-type">${getAssetTypeLabel(r.assetType)}${r.symbol !== name ? ' · ' + r.symbol.toUpperCase() : ''}</div>
                    </div>
                    <span class="signal-badge signal-${r.signal}">${formatSignal(r.signal)}</span>
                </div>
                <div class="rec-card-price">${currencySymbol(cur)}${formatPrice(r.currentPrice, cur)}</div>
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
                ${r.reasonText ? `<div class="rec-card-meta">
                    <span class="meta-tag" style="color:${r.score >= 55 ? 'var(--green)' : r.score <= 45 ? 'var(--red)' : 'var(--yellow)'}">${r.reasonText.action || ''}</span>
                </div>
                <div class="rec-card-meta" style="margin-top:2px; opacity:0.7">
                    <span style="font-size:0.6rem">${r.reasonText.reasons || ''}</span>
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
        const cur = analysis.currency || 'USD';
        document.getElementById('detailPrice').innerHTML = `
            ${currencySymbol(cur)}${formatPrice(analysis.currentPrice, cur)}
            <span class="rec-card-change ${changeClass}" style="font-size:1rem;margin-left:8px">
                <i class="fas ${changeIcon}"></i> ${Math.abs(analysis.changePct).toFixed(2)}%
            </span>`;

        // Action + Meta info
        const meta = analysis.meta || {};
        const reason = analysis.reasonText || {};
        const actionColor = analysis.score >= 55 ? 'var(--green-strong)' : analysis.score <= 45 ? 'var(--red-strong)' : 'var(--yellow)';
        document.getElementById('detailMeta').innerHTML = `
            <div class="detail-meta-item" style="background:${analysis.score >= 65 ? 'rgba(0,200,83,0.1)' : analysis.score <= 35 ? 'rgba(213,0,0,0.1)' : 'var(--bg-primary)'}; border:1px solid ${actionColor}; margin-bottom:8px">
                <span style="color:${actionColor}; font-weight:700; font-size:0.85rem">${reason.action || 'Mantener'}</span>
            </div>
            ${reason.reasons ? `<div class="detail-meta-item" style="font-size:0.68rem; line-height:1.5"><span>${reason.reasons}</span></div>` : ''}
            <div class="detail-meta-item"><span>Tendencia</span><span class="meta-val">${meta.trendStrength || 'N/A'}</span></div>
            <div class="detail-meta-item"><span>Volatilidad</span><span class="meta-val">${meta.volatility || 'N/A'} (${meta.volatilityPct || 0}%)</span></div>
            <div class="detail-meta-item"><span>ADX</span><span class="meta-val">${meta.adx || 'N/A'}</span></div>
            <div class="detail-meta-item"><span>Ind. Alcistas</span><span class="meta-val" style="color:var(--green)">${meta.confluenceBull || 0}/9</span></div>
            <div class="detail-meta-item"><span>Ind. Bajistas</span><span class="meta-val" style="color:var(--red)">${meta.confluenceBear || 0}/9</span></div>
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

function formatPrice(p, currency) {
    if (currency === 'CLP') {
        return p >= 1 ? Math.round(p).toLocaleString('es-CL') : p.toFixed(2);
    }
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    if (p >= 0.01) return p.toFixed(4);
    return p.toFixed(6);
}

function currencySymbol(currency) {
    return currency === 'CLP' ? 'CLP$' : '$';
}

function getAssetTypeLabel(type) {
    const labels = { stocks: 'US Stock', chile: 'Chile', etfs: 'ETF', crypto: 'Crypto', forex: 'Forex' };
    return labels[type] || type;
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('keypress', e => { if (e.key === 'Enter') searchSymbol(); });
    loadDashboard();
    pollingInterval = setInterval(loadDashboard, POLL_MS);
});
