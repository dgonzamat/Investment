// ============================================================
// Client-side Technical Analysis Engine
// All calculations run in the browser - no backend needed
// ============================================================

const TA = {
    // ----- Simple Moving Average -----
    sma(prices, period) {
        const result = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) { result.push(null); continue; }
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += prices[j];
            result.push(sum / period);
        }
        return result;
    },

    // ----- Exponential Moving Average -----
    ema(prices, period) {
        if (prices.length === 0) return [];
        const alpha = 2 / (period + 1);
        const result = [prices[0]];
        for (let i = 1; i < prices.length; i++) {
            result.push(alpha * prices[i] + (1 - alpha) * result[i - 1]);
        }
        return result;
    },

    // ----- RSI (Wilder's smoothing) -----
    rsi(prices, period = 14) {
        if (prices.length < period + 1) return prices.map(() => 50);
        const deltas = [];
        for (let i = 1; i < prices.length; i++) deltas.push(prices[i] - prices[i - 1]);

        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < period; i++) {
            if (deltas[i] > 0) avgGain += deltas[i];
            else avgLoss -= deltas[i];
        }
        avgGain /= period;
        avgLoss /= period;

        const result = new Array(period).fill(null);
        for (let i = period; i < deltas.length; i++) {
            avgGain = (avgGain * (period - 1) + Math.max(deltas[i], 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-deltas[i], 0)) / period;
            if (avgLoss === 0) result.push(100);
            else {
                const rs = avgGain / avgLoss;
                result.push(100 - 100 / (1 + rs));
            }
        }
        return result;
    },

    // ----- MACD -----
    macd(prices, fast = 12, slow = 26, signal = 9) {
        const emaFast = this.ema(prices, fast);
        const emaSlow = this.ema(prices, slow);
        const macdLine = emaFast.map((f, i) => f - emaSlow[i]);
        const signalLine = this.ema(macdLine, signal);
        const histogram = macdLine.map((m, i) => m - signalLine[i]);
        return { macdLine, signalLine, histogram };
    },

    // ----- Bollinger Bands -----
    bollingerBands(prices, period = 20, numStd = 2) {
        const mid = this.sma(prices, period);
        const upper = [], lower = [];
        for (let i = 0; i < prices.length; i++) {
            if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
            const slice = prices.slice(i - period + 1, i + 1);
            const mean = mid[i];
            const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
            upper.push(mean + numStd * std);
            lower.push(mean - numStd * std);
        }
        return { upper, middle: mid, lower };
    },

    // ----- Stochastic Oscillator -----
    stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
        const kValues = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < kPeriod - 1) { kValues.push(50); continue; }
            const hSlice = highs.slice(i - kPeriod + 1, i + 1);
            const lSlice = lows.slice(i - kPeriod + 1, i + 1);
            const hh = Math.max(...hSlice);
            const ll = Math.min(...lSlice);
            kValues.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
        }
        const dValues = this.sma(kValues, dPeriod).map(v => v === null ? 50 : v);
        return { k: kValues, d: dValues };
    },

    // ----- Pivot Points -----
    pivotPoints(high, low, close) {
        const pivot = (high + low + close) / 3;
        return { pivot, r1: 2 * pivot - low, s1: 2 * pivot - high, r2: pivot + (high - low), s2: pivot - (high - low) };
    },

    // ----- Volume Signal -----
    volumeSignal(volumes, prices, period = 20) {
        if (volumes.length < period + 1 || prices.length < 2) return 50;
        const avgVol = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
        if (avgVol === 0) return 50;
        const volRatio = volumes[volumes.length - 1] / avgVol;
        const priceChange = prices[prices.length - 1] - prices[prices.length - 2];
        if (volRatio > 1.5 && priceChange > 0) return Math.min(80 + (volRatio - 1.5) * 20, 100);
        if (volRatio > 1.5 && priceChange < 0) return Math.max(20 - (volRatio - 1.5) * 20, 0);
        if (priceChange > 0) return 55 + Math.min(volRatio * 10, 15);
        if (priceChange < 0) return 45 - Math.min(volRatio * 10, 15);
        return 50;
    },
};

// ============================================================
// Signal Generator - Composite Scoring
// ============================================================

const WEIGHTS = { ma: 0.20, macd: 0.20, rsi: 0.15, bb: 0.15, volume: 0.15, stochastic: 0.10, pivot: 0.05 };

function safe(arr, idx, def = 50) {
    const v = arr[arr.length + idx];
    return (v == null || isNaN(v)) ? def : v;
}

function maScore(prices) {
    if (prices.length < 26) return 50;
    const ema12 = TA.ema(prices, 12);
    const ema26 = TA.ema(prices, 26);
    let score = 0;
    if (safe(ema12, -1) > safe(ema26, -1)) score += 50;
    if (prices.length >= 50) {
        const sma50 = TA.sma(prices, 50);
        if (prices[prices.length - 1] > (safe(sma50, -1, prices[prices.length - 1]))) score += 25;
        else score += 12.5;
    } else score += 12.5;
    return score;
}

function rsiScore(prices) {
    const rsi = TA.rsi(prices);
    const v = safe(rsi, -1, 50);
    if (v < 30) return 80;
    if (v < 40) return 65;
    if (v <= 60) return 50;
    if (v <= 70) return 35;
    return 20;
}

function macdScore(prices) {
    const m = TA.macd(prices);
    let score = 0;
    if (safe(m.macdLine, -1, 0) > safe(m.signalLine, -1, 0)) score += 33;
    if (safe(m.macdLine, -1, 0) > 0) score += 33;
    if (m.histogram.length >= 2 && safe(m.histogram, -1, 0) > safe(m.histogram, -2, 0)) score += 34;
    return score;
}

function bbScore(prices) {
    const bb = TA.bollingerBands(prices);
    const upper = safe(bb.upper, -1);
    const lower = safe(bb.lower, -1);
    if (upper === lower) return 50;
    const pctB = (prices[prices.length - 1] - lower) / (upper - lower);
    if (pctB <= 0.2) return 75;
    if (pctB <= 0.4) return 62;
    if (pctB <= 0.6) return 50;
    if (pctB <= 0.8) return 38;
    return 25;
}

function stochasticScore(highs, lows, closes) {
    const s = TA.stochastic(highs, lows, closes);
    const k = safe(s.k, -1, 50);
    let score = k < 20 ? 80 : k > 80 ? 20 : 50;
    const kPrev = safe(s.k, -2, 50), dPrev = safe(s.d, -2, 50), d = safe(s.d, -1, 50);
    if (kPrev <= dPrev && k > d) score = Math.min(score + 15, 100);
    else if (kPrev >= dPrev && k < d) score = Math.max(score - 15, 0);
    return score;
}

function pivotScore(high, low, close, price) {
    const p = TA.pivotPoints(high, low, close);
    if (price > p.r1) return 30;
    if (price < p.s1) return 70;
    const range = p.r1 - p.s1;
    if (range === 0) return 50;
    return 70 - ((price - p.s1) / range) * 40;
}

function generateCompositeScore(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 5) {
        return { score: 50, signal: 'NEUTRAL', indicators: {} };
    }
    const closes = ohlcvData.map(d => d.close);
    const highs = ohlcvData.map(d => d.high);
    const lows = ohlcvData.map(d => d.low);
    const volumes = ohlcvData.map(d => d.volume || 0);
    const last = ohlcvData[ohlcvData.length - 1];

    const indicators = {
        ma: Math.round(maScore(closes) * 10) / 10,
        rsi: Math.round(rsiScore(closes) * 10) / 10,
        macd: Math.round(macdScore(closes) * 10) / 10,
        bollinger: Math.round(bbScore(closes) * 10) / 10,
        volume: Math.round(TA.volumeSignal(volumes, closes) * 10) / 10,
        stochastic: Math.round(stochasticScore(highs, lows, closes) * 10) / 10,
        pivot: Math.round(pivotScore(last.high, last.low, last.close, closes[closes.length - 1]) * 10) / 10,
    };

    let composite = 0;
    composite += indicators.ma * WEIGHTS.ma;
    composite += indicators.macd * WEIGHTS.macd;
    composite += indicators.rsi * WEIGHTS.rsi;
    composite += indicators.bollinger * WEIGHTS.bb;
    composite += indicators.volume * WEIGHTS.volume;
    composite += indicators.stochastic * WEIGHTS.stochastic;
    composite += indicators.pivot * WEIGHTS.pivot;

    composite = Math.max(0, Math.min(100, composite));
    const score = Math.round(composite * 10) / 10;

    return { score, signal: classifySignal(score), indicators };
}

function classifySignal(score) {
    if (score >= 80) return 'STRONG_BUY';
    if (score >= 65) return 'BUY';
    if (score >= 55) return 'WEAK_BUY';
    if (score >= 45) return 'NEUTRAL';
    if (score >= 35) return 'WEAK_SELL';
    if (score >= 20) return 'SELL';
    return 'STRONG_SELL';
}
