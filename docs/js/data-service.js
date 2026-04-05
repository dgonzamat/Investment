// ============================================================
// Data Service - Fetches from free APIs (CoinGecko, Frankfurter)
// Falls back to simulated data when APIs are unavailable
// ============================================================

const COINGECKO = 'https://api.coingecko.com/api/v3';
const FRANKFURTER = 'https://api.frankfurter.dev';

const SEED_PRICES = {
    AAPL: 195, MSFT: 420, GOOGL: 175, AMZN: 185, TSLA: 175, NVDA: 880, META: 500, JPM: 195,
    SPY: 520, QQQ: 440, VTI: 260, IWM: 205, GLD: 215, TLT: 92,
    bitcoin: 68500, ethereum: 3450, solana: 145, cardano: 0.45, ripple: 0.52, dogecoin: 0.085,
    EUR: 0.92, GBP: 0.79, JPY: 151.5, CHF: 0.88, CAD: 1.36, AUD: 1.53,
};

const DEFAULT_SYMBOLS = {
    stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM'],
    etfs: ['SPY', 'QQQ', 'VTI', 'IWM', 'GLD', 'TLT'],
    crypto: ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple', 'dogecoin'],
    forex: ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'],
};

// Simple seeded random
function seededRandom(seed) {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function generateOHLCV(symbol, days = 90) {
    let seed = 0;
    for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i);
    const rng = seededRandom(seed);
    const base = SEED_PRICES[symbol] || 100;
    const data = [];
    let price = base;

    for (let i = 0; i < days; i++) {
        const change = (rng() - 0.498) * 0.036;
        const trend = Math.sin((i / days) * Math.PI * 2) * 0.005;
        price = price * (1 + change + trend);
        const vol = (rng() - 0.5) * 0.024;
        const high = price * (1 + Math.abs(rng() * 0.012));
        const low = price * (1 - Math.abs(rng() * 0.012));
        const open = price * (1 + (rng() - 0.5) * 0.01);
        const date = new Date();
        date.setDate(date.getDate() - (days - i));

        data.push({
            date: date.toISOString().split('T')[0],
            open: +open.toFixed(4),
            high: +high.toFixed(4),
            low: +low.toFixed(4),
            close: +price.toFixed(4),
            volume: Math.floor(rng() * 4e7 + 1e6),
        });
    }
    return data;
}

const dataCache = {};

async function fetchWithFallback(url, cacheKey, ttl = 120) {
    if (dataCache[cacheKey] && Date.now() - dataCache[cacheKey].ts < ttl * 1000) {
        return dataCache[cacheKey].data;
    }
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        dataCache[cacheKey] = { data, ts: Date.now() };
        return data;
    } catch (e) {
        console.warn(`API unavailable (${cacheKey}): ${e.message}`);
        return null;
    }
}

// ----- Crypto (CoinGecko) -----
async function fetchCryptoData(coinId) {
    const data = await fetchWithFallback(
        `${COINGECKO}/coins/${coinId}/market_chart?vs_currency=usd&days=90&interval=daily`,
        `crypto:${coinId}`, 120
    );
    if (data && data.prices) {
        return data.prices.map((p, i) => ({
            date: new Date(p[0]).toISOString().split('T')[0],
            open: p[1],
            high: p[1] * 1.005,
            low: p[1] * 0.995,
            close: p[1],
            volume: data.total_volumes?.[i]?.[1] || 0,
        }));
    }
    return generateOHLCV(coinId);
}

// ----- Forex (Frankfurter) -----
async function fetchForexData(currency) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const url = `${FRANKFURTER}/${start.toISOString().split('T')[0]}..${end.toISOString().split('T')[0]}?base=USD&symbols=${currency}`;
    const data = await fetchWithFallback(url, `forex:${currency}`, 600);
    if (data && data.rates) {
        return Object.keys(data.rates).sort().map(date => {
            const rate = data.rates[date][currency] || 0;
            return { date, open: rate, high: rate * 1.002, low: rate * 0.998, close: rate, volume: 0 };
        });
    }
    return generateOHLCV(currency);
}

// ----- Stocks/ETFs (simulated - no free CORS-friendly API) -----
async function fetchStockData(symbol) {
    return generateOHLCV(symbol);
}

// ----- Unified fetch -----
async function fetchMarketData(assetType, symbol) {
    switch (assetType) {
        case 'crypto': return fetchCryptoData(symbol.toLowerCase());
        case 'forex': return fetchForexData(symbol.toUpperCase());
        default: return fetchStockData(symbol.toUpperCase());
    }
}

// ----- Analyze a symbol -----
async function analyzeSymbol(symbol, assetType) {
    const prices = await fetchMarketData(assetType, symbol);
    if (!prices || prices.length < 5) return null;

    const analysis = generateCompositeScore(prices);
    const current = prices[prices.length - 1].close;
    const prev = prices.length > 1 ? prices[prices.length - 2].close : current;
    const changePct = prev ? ((current - prev) / prev * 100) : 0;

    return {
        symbol, assetType,
        score: analysis.score,
        signal: analysis.signal,
        indicators: analysis.indicators,
        meta: analysis.meta || {},
        currentPrice: +current.toFixed(4),
        changePct: +changePct.toFixed(2),
        prices,
    };
}

// ----- Fetch all recommendations -----
async function fetchAllRecommendations(assetType) {
    const types = assetType && assetType !== 'all' ? [assetType] : Object.keys(DEFAULT_SYMBOLS);
    const results = [];

    for (const type of types) {
        const promises = DEFAULT_SYMBOLS[type].map(sym => analyzeSymbol(sym, type));
        const analyses = await Promise.all(promises);
        results.push(...analyses.filter(Boolean));
    }

    results.sort((a, b) => b.score - a.score);

    const alerts = results.filter(r =>
        !['NEUTRAL', 'WEAK_BUY', 'WEAK_SELL'].includes(r.signal)
    );

    return { recommendations: results, alerts, lastUpdated: new Date().toISOString() };
}
