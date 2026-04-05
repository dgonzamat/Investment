// ============================================================
// Client-side Technical Analysis Engine v2.0
// Enhanced heuristics: ATR, ADX, Divergence, Confluence scoring
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
        const upper = [], lower = [], bandwidth = [];
        for (let i = 0; i < prices.length; i++) {
            if (mid[i] === null) { upper.push(null); lower.push(null); bandwidth.push(null); continue; }
            const slice = prices.slice(i - period + 1, i + 1);
            const mean = mid[i];
            const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
            upper.push(mean + numStd * std);
            lower.push(mean - numStd * std);
            bandwidth.push(mean > 0 ? ((mean + numStd * std) - (mean - numStd * std)) / mean * 100 : 0);
        }
        return { upper, middle: mid, lower, bandwidth };
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

    // ----- NEW: Average True Range (ATR) - Volatility -----
    atr(highs, lows, closes, period = 14) {
        if (closes.length < 2) return closes.map(() => 0);
        const tr = [highs[0] - lows[0]];
        for (let i = 1; i < closes.length; i++) {
            tr.push(Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            ));
        }
        return this.ema(tr, period);
    },

    // ----- NEW: ADX (Average Directional Index) - Trend Strength -----
    adx(highs, lows, closes, period = 14) {
        if (closes.length < period + 1) return { adx: closes.map(() => 25), pdi: closes.map(() => 50), ndi: closes.map(() => 50) };
        const plusDM = [0], minusDM = [0], tr = [highs[0] - lows[0]];
        for (let i = 1; i < closes.length; i++) {
            const upMove = highs[i] - highs[i - 1];
            const downMove = lows[i - 1] - lows[i];
            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
            tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
        }
        const smoothTR = this.ema(tr, period);
        const smoothPlusDM = this.ema(plusDM, period);
        const smoothMinusDM = this.ema(minusDM, period);
        const pdi = smoothPlusDM.map((v, i) => smoothTR[i] > 0 ? (v / smoothTR[i]) * 100 : 0);
        const ndi = smoothMinusDM.map((v, i) => smoothTR[i] > 0 ? (v / smoothTR[i]) * 100 : 0);
        const dx = pdi.map((p, i) => (p + ndi[i]) > 0 ? Math.abs(p - ndi[i]) / (p + ndi[i]) * 100 : 0);
        const adxLine = this.ema(dx, period);
        return { adx: adxLine, pdi, ndi };
    },

    // ----- NEW: RSI Divergence Detection -----
    detectDivergence(prices, indicator, lookback = 20) {
        const n = prices.length;
        if (n < lookback) return { type: 'none', strength: 0 };
        const pSlice = prices.slice(-lookback);
        const iSlice = indicator.slice(-lookback).map(v => v == null ? 50 : v);

        // Find local mins/maxs in price
        let pMin1 = Infinity, pMin2 = Infinity, iAtPMin1 = 50, iAtPMin2 = 50;
        let pMax1 = -Infinity, pMax2 = -Infinity, iAtPMax1 = 50, iAtPMax2 = 50;
        const half = Math.floor(lookback / 2);

        for (let i = 0; i < half; i++) {
            if (pSlice[i] < pMin1) { pMin1 = pSlice[i]; iAtPMin1 = iSlice[i]; }
            if (pSlice[i] > pMax1) { pMax1 = pSlice[i]; iAtPMax1 = iSlice[i]; }
        }
        for (let i = half; i < lookback; i++) {
            if (pSlice[i] < pMin2) { pMin2 = pSlice[i]; iAtPMin2 = iSlice[i]; }
            if (pSlice[i] > pMax2) { pMax2 = pSlice[i]; iAtPMax2 = iSlice[i]; }
        }

        // Bullish divergence: price lower low, indicator higher low
        if (pMin2 < pMin1 && iAtPMin2 > iAtPMin1) {
            return { type: 'bullish', strength: Math.min((iAtPMin2 - iAtPMin1) / 10, 1) };
        }
        // Bearish divergence: price higher high, indicator lower high
        if (pMax2 > pMax1 && iAtPMax2 < iAtPMax1) {
            return { type: 'bearish', strength: Math.min((iAtPMax1 - iAtPMax2) / 10, 1) };
        }
        return { type: 'none', strength: 0 };
    },

    // ----- NEW: Trend Strength via ADX -----
    trendStrength(adxValue) {
        if (adxValue >= 50) return { label: 'Very Strong', multiplier: 1.3 };
        if (adxValue >= 35) return { label: 'Strong', multiplier: 1.15 };
        if (adxValue >= 25) return { label: 'Moderate', multiplier: 1.0 };
        if (adxValue >= 15) return { label: 'Weak', multiplier: 0.85 };
        return { label: 'No Trend', multiplier: 0.7 };
    },

    // ----- NEW: Volatility Assessment -----
    volatilityAssessment(atrValues, prices) {
        if (!atrValues.length || !prices.length) return { level: 'Normal', pct: 0 };
        const lastATR = atrValues[atrValues.length - 1] || 0;
        const lastPrice = prices[prices.length - 1] || 1;
        const atrPct = (lastATR / lastPrice) * 100;
        if (atrPct > 5) return { level: 'Extreme', pct: atrPct };
        if (atrPct > 3) return { level: 'High', pct: atrPct };
        if (atrPct > 1.5) return { level: 'Moderate', pct: atrPct };
        return { level: 'Low', pct: atrPct };
    }
};

// ============================================================
// Signal Generator v2.0 - Enhanced Composite Scoring
// Now includes: divergence, trend strength, volatility adjustment
// ============================================================

const WEIGHTS = { ma: 0.18, macd: 0.18, rsi: 0.14, bb: 0.12, volume: 0.12, stochastic: 0.08, pivot: 0.05, divergence: 0.08, trend: 0.05 };

function safe(arr, idx, def = 50) {
    const v = arr[arr.length + idx];
    return (v == null || isNaN(v)) ? def : v;
}

function maScore(prices) {
    if (prices.length < 26) return 50;
    const ema12 = TA.ema(prices, 12);
    const ema26 = TA.ema(prices, 26);
    let score = 0;
    if (safe(ema12, -1) > safe(ema26, -1)) score += 40;
    // EMA acceleration: is gap widening?
    if (ema12.length >= 2 && ema26.length >= 2) {
        const gapNow = safe(ema12, -1) - safe(ema26, -1);
        const gapPrev = safe(ema12, -2) - safe(ema26, -2);
        if (gapNow > gapPrev) score += 10; // Accelerating
    }
    if (prices.length >= 50) {
        const sma50 = TA.sma(prices, 50);
        if (prices[prices.length - 1] > (safe(sma50, -1, prices[prices.length - 1]))) score += 25;
        else score += 12.5;
    } else score += 12.5;
    return Math.min(score, 100);
}

function rsiScore(prices) {
    const rsi = TA.rsi(prices);
    const v = safe(rsi, -1, 50);
    const prev = safe(rsi, -2, 50);
    let score;
    if (v < 25) score = 85;
    else if (v < 30) score = 75;
    else if (v < 40) score = 62;
    else if (v <= 60) score = 50;
    else if (v <= 70) score = 38;
    else if (v <= 75) score = 25;
    else score = 15;
    // Momentum: RSI direction matters
    if (v > prev && v < 50) score += 5; // Recovering from oversold
    if (v < prev && v > 50) score -= 5; // Weakening from overbought
    return Math.max(0, Math.min(100, score));
}

function macdScore(prices) {
    const m = TA.macd(prices);
    let score = 0;
    const ml = safe(m.macdLine, -1, 0);
    const sl = safe(m.signalLine, -1, 0);
    if (ml > sl) score += 30;
    if (ml > 0) score += 25;
    // Histogram momentum
    if (m.histogram.length >= 3) {
        const h1 = safe(m.histogram, -1, 0);
        const h2 = safe(m.histogram, -2, 0);
        const h3 = safe(m.histogram, -3, 0);
        if (h1 > h2 && h2 > h3) score += 25; // Accelerating
        else if (h1 > h2) score += 15;
    }
    // Crossover detection (recent)
    if (m.macdLine.length >= 2) {
        const prevML = safe(m.macdLine, -2, 0);
        const prevSL = safe(m.signalLine, -2, 0);
        if (prevML <= prevSL && ml > sl) score += 20; // Bullish crossover!
        if (prevML >= prevSL && ml < sl) score -= 10; // Bearish crossover
    }
    return Math.max(0, Math.min(100, score));
}

function bbScore(prices) {
    const bb = TA.bollingerBands(prices);
    const upper = safe(bb.upper, -1);
    const lower = safe(bb.lower, -1);
    if (upper === lower) return 50;
    const price = prices[prices.length - 1];
    const pctB = (price - lower) / (upper - lower);
    // Bandwidth squeeze detection
    const bw = safe(bb.bandwidth, -1, 5);
    const prevBw = safe(bb.bandwidth, -5, 5);
    const squeeze = bw < prevBw * 0.7; // Bandwidth contracting = potential breakout

    let score;
    if (pctB <= 0.1) score = 82;
    else if (pctB <= 0.2) score = 72;
    else if (pctB <= 0.4) score = 60;
    else if (pctB <= 0.6) score = 50;
    else if (pctB <= 0.8) score = 40;
    else if (pctB <= 0.9) score = 28;
    else score = 18;

    // If squeeze detected, amplify signal
    if (squeeze && pctB < 0.3) score += 8;
    if (squeeze && pctB > 0.7) score -= 8;
    return Math.max(0, Math.min(100, score));
}

function stochasticScore(highs, lows, closes) {
    const s = TA.stochastic(highs, lows, closes);
    const k = safe(s.k, -1, 50);
    const d = safe(s.d, -1, 50);
    const kPrev = safe(s.k, -2, 50);
    const dPrev = safe(s.d, -2, 50);

    let score;
    if (k < 15) score = 85;
    else if (k < 20) score = 75;
    else if (k > 85) score = 15;
    else if (k > 80) score = 25;
    else score = 50;

    // Crossover bonus
    if (kPrev <= dPrev && k > d) score = Math.min(score + 18, 100);
    else if (kPrev >= dPrev && k < d) score = Math.max(score - 18, 0);
    return score;
}

function pivotScore(high, low, close, price) {
    const p = TA.pivotPoints(high, low, close);
    if (price > p.r2) return 20;
    if (price > p.r1) return 32;
    if (price < p.s2) return 80;
    if (price < p.s1) return 68;
    const range = p.r1 - p.s1;
    if (range === 0) return 50;
    return 68 - ((price - p.s1) / range) * 36;
}

function divergenceScore(prices, highs, lows, closes) {
    const rsiValues = TA.rsi(prices);
    const div = TA.detectDivergence(prices, rsiValues);
    if (div.type === 'bullish') return 50 + div.strength * 35;
    if (div.type === 'bearish') return 50 - div.strength * 35;
    return 50;
}

function trendScore(highs, lows, closes) {
    const adxData = TA.adx(highs, lows, closes);
    const adxVal = safe(adxData.adx, -1, 25);
    const pdi = safe(adxData.pdi, -1, 50);
    const ndi = safe(adxData.ndi, -1, 50);
    // If strong trend and +DI > -DI => bullish
    if (adxVal > 25 && pdi > ndi) return 50 + Math.min((adxVal - 25) * 1.5, 30);
    if (adxVal > 25 && ndi > pdi) return 50 - Math.min((adxVal - 25) * 1.5, 30);
    return 50;
}

function generateCompositeScore(ohlcvData) {
    if (!ohlcvData || ohlcvData.length < 5) {
        return { score: 50, signal: 'NEUTRAL', indicators: {}, meta: {} };
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
        divergence: Math.round(divergenceScore(closes, highs, lows, closes) * 10) / 10,
        trend: Math.round(trendScore(highs, lows, closes) * 10) / 10,
    };

    let composite = 0;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
        composite += (indicators[key] || 50) * weight;
    }

    // Volatility & trend strength adjustments
    const atrValues = TA.atr(highs, lows, closes);
    const adxData = TA.adx(highs, lows, closes);
    const adxVal = safe(adxData.adx, -1, 25);
    const trendInfo = TA.trendStrength(adxVal);
    const volInfo = TA.volatilityAssessment(atrValues, closes);

    // Strong trends amplify signal away from 50
    const deviation = composite - 50;
    composite = 50 + deviation * trendInfo.multiplier;
    composite = Math.max(0, Math.min(100, composite));

    // Confluence bonus: if 6+ indicators agree on direction, boost
    const bullish = Object.values(indicators).filter(v => v >= 60).length;
    const bearish = Object.values(indicators).filter(v => v <= 40).length;
    if (bullish >= 6) composite = Math.min(composite + 5, 100);
    if (bearish >= 6) composite = Math.max(composite - 5, 0);

    const score = Math.round(composite * 10) / 10;

    return {
        score, signal: classifySignal(score), indicators,
        meta: {
            trendStrength: trendInfo.label,
            volatility: volInfo.level,
            volatilityPct: Math.round(volInfo.pct * 100) / 100,
            adx: Math.round(adxVal * 10) / 10,
            confluenceBull: bullish,
            confluenceBear: bearish,
        }
    };
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
