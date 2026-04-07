let currentTab = 'all';
let currentSort = 'momentum';
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
    if (event && event.target) event.target.classList.add('active');
    renderRecommendations(sortData(allRecommendations));
}

function sortData(recs) {
    const sorted = [...recs];
    switch (currentSort) {
        case 'momentum': sorted.sort((a, b) => b.momentum12m - a.momentum12m); break;
        case 'change': sorted.sort((a, b) => b.changePct - a.changePct); break;
        case 'name': sorted.sort((a, b) => a.symbol.localeCompare(b.symbol)); break;
    }
    return sorted;
}

// ============ Load Dashboard ============
async function loadDashboard() {
    const grid = document.getElementById('recommendationsGrid');
    const buyList = document.getElementById('buyActions');
    const sellList = document.getElementById('sellActions');
    grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Aplicando V6 Antonacci...</div>';
    if (buyList) buyList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    if (sellList) sellList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

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
    const inMarket = recs.filter(r => r.inMarket).length;
    const inCash = recs.length - inMarket;
    const avgMomentum = recs.length > 0
        ? recs.reduce((s, r) => s + r.momentum12m, 0) / recs.length
        : 0;

    document.getElementById('bullCount').textContent = inMarket;
    document.getElementById('bearCount').textContent = inCash;
    document.getElementById('neutralCount').textContent = alerts.length;
    document.getElementById('avgScore').textContent = avgMomentum.toFixed(1) + '%';
    document.getElementById('avgScore').style.color = avgMomentum > 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('alertCount').textContent = alerts.length;
}

function updateTabCounts(recs) {
    const counts = { all: recs.length, stocks: 0, etfs: 0, crypto: 0, forex: 0, chile: 0 };
    recs.forEach(r => { if (counts[r.assetType] !== undefined) counts[r.assetType]++; });
    for (const [key, val] of Object.entries(counts)) {
        const el = document.getElementById('count' + key.charAt(0).toUpperCase() + key.slice(1));
        if (el) el.textContent = val;
    }
}

// ============ Render Action Panel (V6 Antonacci - Fresh Signals) ============
function renderActionPanel(recs) {
    const buyList = document.getElementById('buyActions');
    const sellList = document.getElementById('sellActions');
    if (!buyList || !sellList) return;

    // Fresh BUY signals: momentum just turned positive
    const freshBuys = recs.filter(r => r.v6.freshSignal && r.inMarket);
    // Fresh SELL signals: momentum just turned negative
    const freshSells = recs.filter(r => r.v6.freshSignal && !r.inMarket);

    if (freshBuys.length === 0) {
        buyList.innerHTML = '<div class="action-empty"><i class="fas fa-pause-circle"></i>Sin nuevas señales de compra. Los instrumentos en tendencia alcista ya están "EN MERCADO" (revisa abajo).</div>';
    } else {
        buyList.innerHTML = freshBuys.map(r => actionCard(r, true)).join('');
    }

    if (freshSells.length === 0) {
        sellList.innerHTML = '<div class="action-empty"><i class="fas fa-shield-alt"></i>Sin nuevas señales de venta. Los instrumentos sin tendencia ya están "EN CASH".</div>';
    } else {
        sellList.innerHTML = freshSells.map(r => actionCard(r, false)).join('');
    }
}

function actionCard(r, isBuy) {
    const cur = r.currency || 'USD';
    const name = r.displayName || r.symbol.toUpperCase();
    const changeClass = r.changePct >= 0 ? 'positive' : 'negative';
    const changeIcon = r.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
    const cssClass = isBuy ? 'strong-buy' : 'strong-sell';
    const color = isBuy ? 'var(--green-strong)' : 'var(--red-strong)';
    const action = isBuy ? '🟢 ENTRAR AL MERCADO' : '🔴 SALIR A CASH';
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    return `
        <div class="action-card ${cssClass}" onclick="openDetail('${r.assetType}', '${r.symbol}')">
            <div class="action-card-action" style="color:${color}"><i class="fas ${icon}"></i> ${action}</div>
            <div class="action-card-top">
                <span class="action-card-name">${name}</span>
                <span class="action-card-score" style="color:${color}">${r.momentum12m >= 0 ? '+' : ''}${r.momentum12m.toFixed(1)}%</span>
            </div>
            <div>
                <span class="action-card-price">${currencySymbol(cur)}${formatPrice(r.currentPrice, cur)}</span>
                <span class="action-card-change ${changeClass}"><i class="fas ${changeIcon}"></i> ${Math.abs(r.changePct).toFixed(2)}%</span>
            </div>
            <div class="action-card-reason"><i class="fas fa-bolt"></i> ${r.v6.reason}</div>
        </div>`;
}

// ============ Render Alerts (Same as fresh signals) ============
function renderAlerts(alerts) {
    const grid = document.getElementById('alertsGrid');
    if (!grid) return;
    if (!alerts.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Sin cambios de tendencia recientes - el mercado está estable según el modelo V6</p></div>';
        return;
    }
    grid.innerHTML = alerts.slice(0, 12).map(a => {
        const isBuy = a.inMarket;
        const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
        const cur = a.currency || 'USD';
        const name = a.displayName || a.symbol.toUpperCase();
        return `
            <div class="alert-card ${isBuy ? 'buy' : 'sell'}" onclick="openDetail('${a.assetType}', '${a.symbol}')">
                <div class="alert-header">
                    <span class="alert-symbol">${name}</span>
                    <span class="alert-type-badge">${getAssetTypeLabel(a.assetType)}</span>
                </div>
                <div class="alert-signal" style="color:${isBuy ? 'var(--green)' : 'var(--red)'}">
                    <i class="fas ${icon}"></i> ${isBuy ? 'NUEVA COMPRA' : 'NUEVA VENTA'}
                </div>
                <div class="alert-meta">
                    <span>Mom 12m: <b>${a.momentum12m >= 0 ? '+' : ''}${a.momentum12m.toFixed(1)}%</b></span>
                    <span>${currencySymbol(cur)}${formatPrice(a.currentPrice, cur)}</span>
                </div>
                <div class="alert-trend"><i class="fas fa-info-circle"></i> ${a.v6.reason}</div>
            </div>`;
    }).join('');
}

// ============ Render All Recommendations (full list with V6 status) ============
function renderRecommendations(recs) {
    const grid = document.getElementById('recommendationsGrid');
    if (!recs.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sin datos disponibles</p></div>';
        return;
    }
    grid.innerHTML = recs.map(r => {
        const cur = r.currency || 'USD';
        const name = r.displayName || r.symbol.toUpperCase();
        const changeClass = r.changePct >= 0 ? 'positive' : 'negative';
        const changeIcon = r.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';

        // V6 status: green if in market, red if cash
        const v6Status = r.inMarket ? 'EN MERCADO' : 'EN CASH';
        const v6Color = r.inMarket ? 'var(--green-strong)' : 'var(--text-muted)';
        const v6Bg = r.inMarket ? 'rgba(0,200,83,0.15)' : 'rgba(110,118,129,0.15)';
        const v6Icon = r.inMarket ? 'fa-circle-check' : 'fa-circle-pause';

        // Momentum bar: scale -50% to +50%
        const momentumPct = Math.max(-50, Math.min(50, r.momentum12m));
        const barWidth = (Math.abs(momentumPct) / 50) * 50; // 0-50% width
        const barOffset = momentumPct >= 0 ? 50 : 50 - barWidth;
        const barColor = momentumPct >= 0 ? 'var(--green)' : 'var(--red)';

        const freshBadge = r.v6.freshSignal
            ? `<span class="fresh-badge ${r.inMarket ? 'fresh-buy' : 'fresh-sell'}">⚡ NUEVO</span>`
            : '';

        return `
            <div class="rec-card" onclick="openDetail('${r.assetType}', '${r.symbol}')">
                <div class="rec-card-header">
                    <div>
                        <div class="rec-card-symbol">${name} ${freshBadge}</div>
                        <div class="rec-card-type">${getAssetTypeLabel(r.assetType)}${r.symbol !== name ? ' · ' + r.symbol.toUpperCase() : ''}</div>
                    </div>
                    <span class="v6-badge" style="background:${v6Bg}; color:${v6Color}">
                        <i class="fas ${v6Icon}"></i> ${v6Status}
                    </span>
                </div>
                <div class="rec-card-price">${currencySymbol(cur)}${formatPrice(r.currentPrice, cur)}</div>
                <div class="rec-card-change ${changeClass}">
                    <i class="fas ${changeIcon}"></i> ${Math.abs(r.changePct).toFixed(2)}% hoy
                </div>
                <div class="momentum-bar-container">
                    <div class="momentum-bar-track">
                        <div class="momentum-bar-center"></div>
                        <div class="momentum-bar-fill" style="left:${barOffset}%; width:${barWidth}%; background:${barColor}"></div>
                    </div>
                    <div class="momentum-labels">
                        <span>-50%</span>
                        <span class="momentum-value" style="color:${barColor}">12m: ${r.momentum12m >= 0 ? '+' : ''}${r.momentum12m.toFixed(1)}%</span>
                        <span>+50%</span>
                    </div>
                </div>
                <div class="rec-card-bottom">
                    <span class="rec-card-score-label">3m: ${r.momentum3m >= 0 ? '+' : ''}${r.momentum3m.toFixed(1)}%</span>
                    <span class="rec-card-score-label">Conf: ${r.v6.confidence}%</span>
                </div>
            </div>`;
    }).join('');
}

// ============ Detail Panel ============
async function openDetail(assetType, symbol) {
    const panel = document.getElementById('detailPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('detailTitle').textContent = `${symbol.toUpperCase()} - Análisis Detallado`;
    document.getElementById('indicatorBars').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    document.getElementById('detailMeta').innerHTML = '';

    try {
        const analysis = await analyzeSymbol(symbol, assetType);
        if (!analysis) throw new Error('No data');

        // V6 confidence as the main gauge (not the technical score)
        renderGauge('gaugeChart', analysis.v6.confidence);

        const signalEl = document.getElementById('detailSignal');
        const v6Status = analysis.inMarket ? 'EN MERCADO' : 'EN CASH';
        signalEl.textContent = v6Status;
        signalEl.className = `signal-badge ${analysis.inMarket ? 'signal-STRONG_BUY' : 'signal-SELL'}`;

        const changeClass = analysis.changePct >= 0 ? 'positive' : 'negative';
        const changeIcon = analysis.changePct >= 0 ? 'fa-caret-up' : 'fa-caret-down';
        const cur = analysis.currency || 'USD';
        document.getElementById('detailPrice').innerHTML = `
            ${currencySymbol(cur)}${formatPrice(analysis.currentPrice, cur)}
            <span class="rec-card-change ${changeClass}" style="font-size:1rem;margin-left:8px">
                <i class="fas ${changeIcon}"></i> ${Math.abs(analysis.changePct).toFixed(2)}%
            </span>`;

        // V6 metadata - the PRIMARY model
        const actionColor = analysis.inMarket ? 'var(--green-strong)' : 'var(--red-strong)';
        document.getElementById('detailMeta').innerHTML = `
            <div class="detail-meta-item" style="background:${analysis.inMarket ? 'rgba(0,200,83,0.1)' : 'rgba(213,0,0,0.1)'}; border:1px solid ${actionColor}; margin-bottom:8px; padding:8px 12px;">
                <span style="color:${actionColor}; font-weight:700; font-size:0.85rem">${analysis.v6.reason}</span>
            </div>
            <div class="detail-meta-item"><span>Modelo</span><span class="meta-val">V6 Antonacci</span></div>
            <div class="detail-meta-item"><span>Momentum 12m</span><span class="meta-val" style="color:${analysis.momentum12m >= 0 ? 'var(--green)' : 'var(--red)'}">${analysis.momentum12m >= 0 ? '+' : ''}${analysis.momentum12m.toFixed(2)}%</span></div>
            <div class="detail-meta-item"><span>Momentum 6m</span><span class="meta-val">${(analysis.v6.momentum6m || 0) >= 0 ? '+' : ''}${(analysis.v6.momentum6m || 0).toFixed(2)}%</span></div>
            <div class="detail-meta-item"><span>Momentum 3m</span><span class="meta-val">${analysis.momentum3m >= 0 ? '+' : ''}${analysis.momentum3m.toFixed(2)}%</span></div>
            <div class="detail-meta-item"><span>Confianza</span><span class="meta-val">${analysis.v6.confidence}%</span></div>
            <div class="detail-meta-item"><span>Señal nueva</span><span class="meta-val">${analysis.v6.freshSignal ? '⚡ Sí' : '─ No'}</span></div>
        `;

        // Educational technical indicators (NOT used for buy/sell)
        renderIndicatorBars(analysis.indicators);
        renderPriceChart('priceChart', analysis.prices);
        renderRSIChart('rsiChart', analysis.prices);
    } catch (e) {
        document.getElementById('indicatorBars').innerHTML =
            `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
}

function renderIndicatorBars(indicators) {
    const names = { ma: 'Medias Móviles', rsi: 'RSI', macd: 'MACD', bollinger: 'Bollinger', volume: 'Volumen', stochastic: 'Stochastic', pivot: 'Pivot Pts', divergence: 'Divergencia', trend: 'ADX Trend' };
    const container = document.getElementById('indicatorBars');
    const note = '<div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:12px; padding:8px; background:rgba(255,214,0,0.05); border-left:3px solid var(--yellow);"><i class="fas fa-info-circle"></i> Estos indicadores son <b>educativos solamente</b>. La señal de compra/venta viene del modelo V6 (Antonacci), validado por 100 años de datos académicos.</div>';
    container.innerHTML = note + Object.entries(indicators).map(([key, val]) => {
        const color = getSignalColor(val);
        return `
            <div class="indicator-bar">
                <div class="indicator-info">
                    <span class="label">${names[key] || key}</span>
                </div>
                <div class="bar-bg">
                    <div class="bar-fill" style="width:${val}%; background:${color}"></div>
                </div>
                <div class="indicator-values">
                    <span class="value" style="color:${color}">${val}</span>
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
    return { IN_MARKET: 'En Mercado', IN_CASH: 'En Cash', FRESH_BUY: 'Nueva Compra', FRESH_SELL: 'Nueva Venta', INSUFFICIENT_DATA: 'Sin Datos' }[s] || s;
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
