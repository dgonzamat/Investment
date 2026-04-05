const chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
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
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h - 10;
    const radius = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 0, false);
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#1a1a2e';
    ctx.stroke();

    // Colored arc segments
    const segments = [
        { start: 0, end: 0.2, color: '#d50000' },
        { start: 0.2, end: 0.35, color: '#f44336' },
        { start: 0.35, end: 0.45, color: '#ff9800' },
        { start: 0.45, end: 0.55, color: '#ffd600' },
        { start: 0.55, end: 0.65, color: '#8bc34a' },
        { start: 0.65, end: 0.8, color: '#4caf50' },
        { start: 0.8, end: 1.0, color: '#00c853' },
    ];

    segments.forEach(seg => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, Math.PI + seg.start * Math.PI, Math.PI + seg.end * Math.PI, false);
        ctx.lineWidth = 14;
        ctx.strokeStyle = seg.color;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    // Needle
    const angle = Math.PI + (score / 100) * Math.PI;
    const needleLen = radius - 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + needleLen * Math.cos(angle), cy + needleLen * Math.sin(angle));
    ctx.lineWidth = 3;
    ctx.strokeStyle = getSignalColor(score);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#e6edf3';
    ctx.fill();

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

    const labels = priceData.map(d => d.date).slice(-60);
    const closes = priceData.map(d => d.close).slice(-60);
    const highs = priceData.map(d => d.high).slice(-60);
    const lows = priceData.map(d => d.low).slice(-60);

    chartInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Close',
                    data: closes,
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88,166,255,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                },
                {
                    label: 'High',
                    data: highs,
                    borderColor: 'rgba(76,175,80,0.4)',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [3, 3],
                    fill: false,
                },
                {
                    label: 'Low',
                    data: lows,
                    borderColor: 'rgba(244,67,54,0.4)',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [3, 3],
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#8b949e', font: { size: 11 } } },
            },
            scales: {
                x: {
                    ticks: { color: '#6e7681', maxTicksLimit: 10, font: { size: 10 } },
                    grid: { color: 'rgba(48,54,61,0.5)' },
                },
                y: {
                    ticks: { color: '#6e7681', font: { size: 10 } },
                    grid: { color: 'rgba(48,54,61,0.5)' },
                },
            },
        },
    });
}
