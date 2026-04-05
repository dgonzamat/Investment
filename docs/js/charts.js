const chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function getSignalColor(score) {
    if (score >= 80) return '#00c853';
    if (score >= 65) return '#4caf50';
    if (score >= 55) return '#8bc34a';
    if (score >= 45) return '#ffd600';
    if (score >= 35) return '#ff9800';
    if (score >= 20) return '#f44336';
    return '#d50000';
}

function renderGauge(canvasId, score) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h - 10;
    const radius = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    // Background arc
    ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, 0, false);
    ctx.lineWidth = 16; ctx.strokeStyle = '#1a1a2e'; ctx.stroke();

    // Colored segments
    const segs = [
        [0, 0.2, '#d50000'], [0.2, 0.35, '#f44336'], [0.35, 0.45, '#ff9800'],
        [0.45, 0.55, '#ffd600'], [0.55, 0.65, '#8bc34a'], [0.65, 0.8, '#4caf50'],
        [0.8, 1.0, '#00c853']
    ];
    segs.forEach(([s, e, c]) => {
        ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI + s * Math.PI, Math.PI + e * Math.PI, false);
        ctx.lineWidth = 14; ctx.strokeStyle = c; ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;
    });

    // Needle
    const angle = Math.PI + (score / 100) * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (radius - 5) * Math.cos(angle), cy + (radius - 5) * Math.sin(angle));
    ctx.lineWidth = 3; ctx.strokeStyle = getSignalColor(score); ctx.stroke();

    // Center dot
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#e6edf3'; ctx.fill();

    // Score text
    ctx.fillStyle = getSignalColor(score);
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(score), cx, cy - 20);
}

function renderPriceChart(canvasId, priceData) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !priceData || priceData.length === 0) return;

    const sliced = priceData.slice(-60);
    const labels = sliced.map(d => d.date);
    const closes = sliced.map(d => d.close);

    // Calculate indicators for overlay
    const allCloses = priceData.map(d => d.close);
    const sma20 = TA.sma(allCloses, 20).slice(-60);
    const bb = TA.bollingerBands(allCloses);
    const bbUpper = bb.upper.slice(-60);
    const bbLower = bb.lower.slice(-60);

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Price', data: closes,
                    borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.08)',
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
                },
                {
                    label: 'SMA(20)', data: sma20,
                    borderColor: '#ffd600', borderWidth: 1.5, pointRadius: 0,
                    borderDash: [4, 4], fill: false,
                },
                {
                    label: 'BB Upper', data: bbUpper,
                    borderColor: 'rgba(76,175,80,0.4)', borderWidth: 1, pointRadius: 0,
                    borderDash: [2, 2], fill: false,
                },
                {
                    label: 'BB Lower', data: bbLower,
                    borderColor: 'rgba(244,67,54,0.4)', borderWidth: 1, pointRadius: 0,
                    borderDash: [2, 2], fill: '-1', backgroundColor: 'rgba(88,166,255,0.03)',
                },
            ],
        },
        options: {
            responsive: true,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { labels: { color: '#8b949e', font: { size: 11 } } },
                tooltip: { backgroundColor: '#161b22', titleColor: '#e6edf3', bodyColor: '#8b949e', borderColor: '#30363d', borderWidth: 1 },
            },
            scales: {
                x: { ticks: { color: '#6e7681', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: 'rgba(48,54,61,0.5)' } },
                y: { ticks: { color: '#6e7681', font: { size: 10 } }, grid: { color: 'rgba(48,54,61,0.5)' } },
            },
        },
    });
}

function renderRSIChart(canvasId, priceData) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !priceData) return;

    const closes = priceData.map(d => d.close);
    const rsiData = TA.rsi(closes).slice(-60);
    const labels = priceData.slice(-60).map(d => d.date);

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'RSI(14)', data: rsiData,
                borderColor: '#ce93d8', borderWidth: 2, pointRadius: 0,
                fill: false, tension: 0.3,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#8b949e' } },
                annotation: {},
            },
            scales: {
                x: { ticks: { color: '#6e7681', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: 'rgba(48,54,61,0.3)' } },
                y: { min: 0, max: 100, ticks: { color: '#6e7681', font: { size: 10 } }, grid: { color: 'rgba(48,54,61,0.3)' } },
            },
        },
    });
}
