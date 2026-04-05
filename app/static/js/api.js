const API_BASE = '';

async function apiFetch(path) {
    try {
        const resp = await fetch(`${API_BASE}${path}`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        return await resp.json();
    } catch (e) {
        console.error(`API Error [${path}]:`, e.message);
        throw e;
    }
}

async function fetchRecommendations(assetType) {
    const params = assetType && assetType !== 'all' ? `?asset_type=${assetType}` : '';
    return apiFetch(`/api/recommendations${params}`);
}

async function fetchAlerts(assetType) {
    const params = assetType && assetType !== 'all' ? `?asset_type=${assetType}` : '';
    return apiFetch(`/api/alerts${params}`);
}

async function fetchAnalysis(assetType, symbol) {
    return apiFetch(`/api/analysis/${assetType}/${symbol}`);
}

async function fetchMarketData(assetType, symbol) {
    return apiFetch(`/api/market-data/${assetType}/${symbol}`);
}
