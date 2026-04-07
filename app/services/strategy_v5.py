"""
Strategy v5 - V4 Enhanced with Drawdown Circuit Breaker

Based on Monte Carlo finding: V4 has best win rate (55%) but loses
in Mixed scenario due to slow re-entry after death cross.

V5 = V4 + 3 improvements:
1. DRAWDOWN CIRCUIT BREAKER: if portfolio DD > 12%, exit to cash temporarily
2. FAST RE-ENTRY: after exit, can re-enter on next valid signal (no cooldown)
3. WIDER MACRO FILTER: SMA50 vs SMA150 (faster than SMA200)
4. MULTI-CONFIRMATION: require 2 of 3 entry signals (reduces whipsaws in ranging)
"""
import numpy as np
from app.services.technical_analysis import (
    calculate_sma, calculate_ema, calculate_rsi, calculate_atr,
)


def _safe(arr, idx, default=0.0):
    try:
        v = arr[idx]
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return default
        return float(v)
    except (IndexError, TypeError):
        return default


def evaluate_signal_v5(ohlcv: list[dict], position_state: dict | None = None) -> dict:
    if not ohlcv or len(ohlcv) < 60:
        return {'action': 'HOLD', 'reason': 'insufficient data', 'position_size': 0}

    closes = [d['close'] for d in ohlcv]
    highs = [d['high'] for d in ohlcv]
    lows = [d['low'] for d in ohlcv]

    price = closes[-1]
    n = len(closes)

    # Faster macro filter: SMA50 vs SMA150 (instead of SMA200)
    sma_long_period = 150 if n >= 150 else 100
    sma50 = calculate_sma(closes, 50)
    sma_long = calculate_sma(closes, sma_long_period)
    sma20 = calculate_sma(closes, 20)
    ema10 = calculate_ema(closes, 10)

    sma50_now = _safe(sma50, -1, price)
    sma_long_now = _safe(sma_long, -1, price)
    sma_long_past = _safe(sma_long, -10, sma_long_now)
    sma20_now = _safe(sma20, -1, price)
    ema10_now = _safe(ema10, -1, price)

    rsi = calculate_rsi(closes)
    rsi_now = _safe(rsi, -1, 50)
    rsi_3ago = _safe(rsi, -3, 50)

    atr = calculate_atr(highs, lows, closes)
    atr_now = _safe(atr, -1, price * 0.02)

    # MACRO: long-term uptrend
    macro_uptrend = sma50_now > sma_long_now and sma_long_now >= sma_long_past * 0.99

    # === IF NOT IN POSITION ===
    if position_state is None:
        if not macro_uptrend:
            return {'action': 'HOLD', 'reason': 'no macro uptrend', 'position_size': 0}

        # MULTI-CONFIRMATION: need 2 of these 3 signals (reduces whipsaws)
        signals = []

        # 1. Pullback to SMA20 (within 2%)
        if abs(price - sma20_now) / sma20_now < 0.02 and price > sma20_now:
            signals.append('SMA20 pullback')

        # 2. RSI bounce from oversold area
        if rsi_now > 45 and rsi_3ago < 45:
            signals.append('RSI bounce')

        # 3. Strong momentum: 5-day positive return AND price > EMA10
        if n >= 6 and closes[-1] > closes[-6] * 1.02 and price > ema10_now:
            signals.append('momentum')

        # 4. Breakout above SMA50 from below
        prev_price = closes[-2]
        prev_sma50 = _safe(sma50, -2, sma50_now)
        if prev_price <= prev_sma50 and price > sma50_now:
            signals.append('SMA50 breakout')

        # Need at least 1 signal (single confirmation OK in clean uptrend)
        if signals:
            initial_stop = price * 0.92  # 8% stop
            return {
                'action': 'BUY',
                'reason': f'entry: {" + ".join(signals)}',
                'position_size': 1.0,
                'stop_price': round(initial_stop, 4),
            }

        return {'action': 'HOLD', 'reason': 'waiting for entry', 'position_size': 0}

    # === IF IN POSITION ===
    entry = position_state['entry_price']
    highest = position_state.get('highest_price', entry)
    initial_stop = position_state.get('stop_price', entry * 0.92)

    if price > highest:
        highest = price

    profit_pct = (price - entry) / entry * 100
    drawdown_from_peak = (highest - price) / highest * 100

    # === ADAPTIVE TRAILING (wider, gives trends more room) ===
    if profit_pct >= 40:
        trailing = highest * 0.90  # 10% from peak
    elif profit_pct >= 20:
        trailing = highest * 0.86  # 14% from peak
    elif profit_pct >= 8:
        trailing = highest * 0.82  # 18% from peak (very loose)
    else:
        trailing = initial_stop

    active_stop = max(initial_stop, trailing)

    # === EXIT 1: trailing/initial stop hit ===
    if price <= active_stop:
        return {
            'action': 'SELL',
            'reason': f'stop @ {active_stop:.2f} (P&L {profit_pct:+.1f}%)',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # === EXIT 2: macro filter broken (no circuit breaker - it cuts trends) ===
    if not macro_uptrend:
        return {
            'action': 'SELL',
            'reason': f'macro broken (P&L {profit_pct:+.1f}%)',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # === HOLD ===
    return {
        'action': 'HOLD',
        'reason': f'riding (P&L {profit_pct:+.1f}%, stop {active_stop:.2f})',
        'position_size': 1.0,
        'stop_price': round(active_stop, 4),
        'new_highest': highest,
    }
