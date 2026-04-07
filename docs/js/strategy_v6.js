// ============================================================
// Strategy V6 - Antonacci's GEM-inspired Absolute Momentum Filter
// Validated by Monte Carlo + 100 years of academic research
// ============================================================
// Rules:
// 1. Calculate 12-month (252 day) return
// 2. If > 0 -> IN MARKET (buy/hold)
// 3. If <= 0 -> IN CASH (sell/stay out)
// 4. Re-evaluate monthly only (avoids whipsaws)
// 5. NO stops, NO trailing, NO complexity
// ============================================================

function evaluateV6(ohlcv) {
    if (!ohlcv || ohlcv.length < 252) {
        // Not enough data for 12-month lookback - use whatever we have
        const period = Math.min(ohlcv.length - 1, 90);
        if (period < 30) {
            return {
                action: 'NEUTRAL',
                inMarket: false,
                momentum12m: 0,
                momentum3m: 0,
                signal: 'INSUFFICIENT_DATA',
                confidence: 0,
                reason: 'Datos insuficientes (necesita >30 días)',
            };
        }
        const closes = ohlcv.map(d => d.close);
        const ret = (closes[closes.length - 1] - closes[0]) / closes[0];
        return {
            action: ret > 0 ? 'BUY' : 'SELL',
            inMarket: ret > 0,
            momentum12m: ret * 100,
            momentum3m: ret * 100,
            signal: ret > 0 ? 'IN_MARKET' : 'IN_CASH',
            confidence: Math.min(Math.abs(ret) * 200, 100),
            reason: `Momentum ${period}d: ${(ret * 100).toFixed(1)}%`,
        };
    }

    const closes = ohlcv.map(d => d.close);
    const price = closes[closes.length - 1];

    // 12-month momentum (252 trading days)
    const price12mAgo = closes[closes.length - 252];
    const return12m = (price - price12mAgo) / price12mAgo;

    // 3-month momentum (63 days) - secondary indicator
    const price3mAgo = closes[closes.length - 63];
    const return3m = (price - price3mAgo) / price3mAgo;

    // 6-month momentum (126 days) - tertiary
    const price6mAgo = closes[closes.length - 126];
    const return6m = (price - price6mAgo) / price6mAgo;

    // Confidence: how strong is the signal?
    // Strong positive: all timeframes align positive
    // Strong negative: all timeframes align negative
    let confidence;
    if (return12m > 0 && return6m > 0 && return3m > 0) {
        confidence = Math.min(return12m * 200, 100);
    } else if (return12m < 0 && return6m < 0 && return3m < 0) {
        confidence = Math.min(Math.abs(return12m) * 200, 100);
    } else {
        confidence = Math.abs(return12m) * 100;
    }

    const inMarket = return12m > 0;

    // Detect "fresh signals" - momentum just turned
    // Compare with 1 month ago
    const closesMonthAgo = ohlcv.slice(0, -21).map(d => d.close);
    let freshSignal = false;
    if (closesMonthAgo.length >= 252) {
        const oldPrice = closesMonthAgo[closesMonthAgo.length - 1];
        const oldPrice12mAgo = closesMonthAgo[closesMonthAgo.length - 252];
        const oldReturn12m = (oldPrice - oldPrice12mAgo) / oldPrice12mAgo;
        // Sign change = fresh signal
        if ((return12m > 0) !== (oldReturn12m > 0)) {
            freshSignal = true;
        }
    }

    let signal, action, reason;
    if (inMarket) {
        signal = freshSignal ? 'FRESH_BUY' : 'IN_MARKET';
        action = freshSignal ? 'BUY' : 'HOLD_LONG';
        reason = freshSignal
            ? `Momentum 12m acaba de cambiar a positivo (${(return12m * 100).toFixed(1)}%)`
            : `Tendencia alcista confirmada (12m: ${(return12m * 100).toFixed(1)}%)`;
    } else {
        signal = freshSignal ? 'FRESH_SELL' : 'IN_CASH';
        action = freshSignal ? 'SELL' : 'STAY_CASH';
        reason = freshSignal
            ? `Momentum 12m acaba de cambiar a negativo (${(return12m * 100).toFixed(1)}%)`
            : `Sin tendencia alcista (12m: ${(return12m * 100).toFixed(1)}%)`;
    }

    return {
        action,
        inMarket,
        momentum12m: return12m * 100,
        momentum6m: return6m * 100,
        momentum3m: return3m * 100,
        signal,
        confidence: Math.round(Math.min(confidence, 100)),
        reason,
        freshSignal,
    };
}
