// ============================================================
// Data Service v2.0 - Fetches from free APIs
// CoinGecko (crypto), Frankfurter (forex), mindicador.cl (UF/CLP)
// Falls back to simulated data when APIs are unavailable
// ============================================================

const COINGECKO = 'https://api.coingecko.com/api/v3';
const FRANKFURTER = 'https://api.frankfurter.dev';
const MINDICADOR = 'https://mindicador.cl/api';

const SEED_PRICES = {
    // US Stocks
    AAPL: 195, MSFT: 420, GOOGL: 175, AMZN: 185, TSLA: 175, NVDA: 880, META: 500, JPM: 195,
    // Chilean Stocks (NYSE listed)
    SQM: 52, BCH: 24, ECH: 40,
    // Chilean Stocks (Santiago - simulated in CLP)
    'FALABELLA': 2850, 'CENCOSUD': 2200, 'COPEC': 6800, 'BCI': 32000,
    'CHILE': 95, 'CCU': 6200, 'ENELAM': 125, 'CMPC': 2100,
    // US ETFs
    SPY: 520, QQQ: 440, VTI: 260, IWM: 205, GLD: 215, TLT: 92,
    // Crypto
    bitcoin: 68500, ethereum: 3450, solana: 145, cardano: 0.45, ripple: 0.52, dogecoin: 0.085,
    // Forex
    EUR: 0.92, GBP: 0.79, JPY: 151.5, CHF: 0.88, CAD: 1.36, AUD: 1.53, CLP: 920,
    // Chilean instruments
    UF: 37850, IPSA: 7200,
};

// Labels for display
const SYMBOL_NAMES = {
    // Chilean stocks
    FALABELLA: 'Falabella', CENCOSUD: 'Cencosud', COPEC: 'Empresas Copec',
    BCI: 'Banco BCI', CHILE: 'Banco de Chile', CCU: 'CCU', ENELAM: 'Enel Américas',
    CMPC: 'CMPC', SQM: 'SQM (Lithium)', BCH: 'Banco Chile ADR', ECH: 'iShares Chile ETF',
    // Other
    IPSA: 'IPSA Index', UF: 'Unidad de Fomento',
};

const DEFAULT_SYMBOLS = {
    stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM'],
    chile: ['SQM', 'FALABELLA', 'CENCOSUD', 'COPEC', 'BCI', 'CHILE', 'CCU', 'ENELAM', 'CMPC', 'ECH'],
    etfs: ['SPY', 'QQQ', 'VTI', 'IWM', 'GLD', 'TLT', 'ECH'],
    crypto: ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple', 'dogecoin'],
    forex: ['EUR', 'GBP', 'JPY', 'CHF', 'CLP', 'AUD'],
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
        const high = price * (1 + Math.abs(rng() * 0.012));
        const low = price * (1 - Math.abs(rng() * 0.012));
        const open = price * (1 + (rng() - 0.5) * 0.01);
        const date = new Date();
        date.setDate(date.getDate() - (days - i));
        data.push({
            date: date.toISOString().split('T')[0],
            open: +open.toFixed(4), high: +high.toFixed(4),
            low: +low.toFixed(4), close: +price.toFixed(4),
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
            open: p[1], high: p[1] * 1.005, low: p[1] * 0.995, close: p[1],
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

// ----- Chilean Indicators (mindicador.cl - UF, Dolar) -----
async function fetchChileanIndicator(indicator) {
    const data = await fetchWithFallback(`${MINDICADOR}/${indicator}`, `chile:${indicator}`, 600);
    if (data && data.serie) {
        return data.serie.slice(0, 90).reverse().map(item => {
            const date = item.fecha.split('T')[0];
            const val = item.valor;
            return { date, open: val, high: val * 1.001, low: val * 0.999, close: val, volume: 0 };
        });
    }
    return generateOHLCV(indicator === 'uf' ? 'UF' : 'CLP');
}

// ----- Stocks/ETFs (simulated) -----
async function fetchStockData(symbol) {
    return generateOHLCV(symbol.toUpperCase());
}

// ----- Chilean Stocks (simulated with realistic CLP prices) -----
async function fetchChileanStockData(symbol) {
    return generateOHLCV(symbol.toUpperCase());
}

// ----- Unified fetch -----
async function fetchMarketData(assetType, symbol) {
    switch (assetType) {
        case 'crypto': return fetchCryptoData(symbol.toLowerCase());
        case 'forex':
            if (symbol.toUpperCase() === 'CLP') {
                // Try mindicador.cl for real CLP data
                const clpData = await fetchChileanIndicator('dolar');
                if (clpData && clpData.length > 5 && clpData[0].close > 0) return clpData;
            }
            return fetchForexData(symbol.toUpperCase());
        case 'chile':
            if (symbol.toUpperCase() === 'UF') return fetchChileanIndicator('uf');
            if (symbol.toUpperCase() === 'IPSA') return generateOHLCV('IPSA');
            return fetchChileanStockData(symbol);
        default: return fetchStockData(symbol.toUpperCase());
    }
}

// ----- Analyze a symbol -----
async function analyzeSymbol(symbol, assetType) {
    const prices = await fetchMarketData(assetType, symbol);
    if (!prices || prices.length < 5) return null;

    // PRIMARY MODEL: V6 Antonacci (validated by Monte Carlo + 100 years academic)
    const v6 = evaluateV6(prices);

    // SECONDARY: composite score for educational technical analysis (NOT used for buy/sell)
    const technical = generateCompositeScore(prices);

    const current = prices[prices.length - 1].close;
    const prev = prices.length > 1 ? prices[prices.length - 2].close : current;
    const changePct = prev ? ((current - prev) / prev * 100) : 0;

    const displayName = SYMBOL_NAMES[symbol.toUpperCase()] || symbol;
    const isCLP = assetType === 'chile' && !['SQM', 'BCH', 'ECH'].includes(symbol.toUpperCase());
    const currency = isCLP ? 'CLP' : 'USD';

    return {
        symbol, assetType, displayName, currency,
        // V6 signals (PRIMARY)
        v6,  // {action, inMarket, momentum12m, signal, confidence, reason, freshSignal}
        // Map to compatible fields for legacy UI
        score: v6.confidence,  // 0-100 confidence in current signal
        signal: v6.signal,
        action: v6.action,
        inMarket: v6.inMarket,
        momentum12m: v6.momentum12m,
        momentum3m: v6.momentum3m,
        // Technical analysis (educational only - shown in detail panel)
        indicators: technical.indicators,
        technicalScore: technical.score,
        technicalSignal: technical.signal,
        meta: technical.meta || {},
        reasonText: { action: v6.signal, reasons: v6.reason },
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

    // Deduplicate (ECH appears in both chile and etfs)
    const seen = new Set();
    const deduped = results.filter(r => {
        const key = `${r.symbol}:${r.assetType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by: fresh signals first, then by inMarket+momentum
    deduped.sort((a, b) => {
        if (a.v6.freshSignal && !b.v6.freshSignal) return -1;
        if (!a.v6.freshSignal && b.v6.freshSignal) return 1;
        return b.momentum12m - a.momentum12m;
    });

    // Alerts are FRESH signals (momentum just changed direction)
    const alerts = deduped.filter(r => r.v6.freshSignal);

    return { recommendations: deduped, alerts, lastUpdated: new Date().toISOString() };
}
