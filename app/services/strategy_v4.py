"""
Strategy v4 - Buy the Dip in Confirmed Uptrend

Based on academic research showing that buying pullbacks in long-term
uptrends is one of the few TA strategies that consistently beats Buy & Hold.

Core thesis: Stay long during uptrends, scale into pullbacks, exit only
when the long-term trend breaks.

Rules:
- MACRO FILTER: SMA50 > SMA200 (long-term uptrend confirmed)
- ENTRY: Pullback to SMA20 OR RSI < 45 within uptrend
        OR: Initial breakout above SMA50 from below
- INITIAL STOP: 8% below entry (wide enough to ride pullbacks)
- ADAPTIVE TRAILING:
    * Profit < 10%: no trailing (let trend develop)
    * Profit 10-25%: trailing at 12% from peak
    * Profit > 25%: trailing at 8% from peak
- TREND BREAK EXIT: SMA50 crosses below SMA200 (Death Cross)
- NO EXIT on overbought RSI (key insight)
- RE-ENTRY: Allowed immediately after stop if macro filter still up
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


def evaluate_signal_v4(ohlcv: list[dict], position_state: dict | None = None) -> dict:
    if not ohlcv or len(ohlcv) < 60:
        return {'action': 'HOLD', 'reason': 'insufficient data', 'position_size': 0}

    closes = [d['close'] for d in ohlcv]
    highs = [d['high'] for d in ohlcv]
    lows = [d['low'] for d in ohlcv]

    price = closes[-1]
    n = len(closes)

    # Macro filter: SMA50 vs SMA200 (use 100 if not enough data)
    sma_long_period = 200 if n >= 200 else 100
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

    atr = calculate_atr(highs, lows, closes)
    atr_now = _safe(atr, -1, price * 0.02)

    # === MACRO FILTER: long-term uptrend ===
    macro_uptrend = sma50_now > sma_long_now and sma_long_now >= sma_long_past * 0.99

    # === IF NOT IN POSITION ===
    if position_state is None:
        if not macro_uptrend:
            return {'action': 'HOLD', 'reason': 'no macro uptrend (SMA50<SMA200)',
                    'position_size': 0}

        # Entry triggers (in confirmed uptrend):
        # 1. Pullback to SMA20 (price within 2% of SMA20)
        pullback_to_sma20 = abs(price - sma20_now) / sma20_now < 0.02

        # 2. RSI dipped below 45 then recovering (pullback bounce)
        rsi_pullback = rsi_now > 45 and _safe(rsi, -3, 50) < 45

        # 3. Just crossed above SMA50 (initial breakout)
        prev_price = closes[-2]
        prev_sma50 = _safe(sma50, -2, sma50_now)
        breakout = prev_price <= prev_sma50 and price > sma50_now

        # 4. Strong momentum: 5-day return > 0 AND price > EMA10
        momentum = closes[-1] > closes[-6] * 1.01 if n >= 6 else False

        # ENTER if any trigger fires
        if pullback_to_sma20 or rsi_pullback or breakout:
            initial_stop = price * 0.92  # 8% stop
            trigger = ('pullback to SMA20' if pullback_to_sma20 else
                       'RSI bounce' if rsi_pullback else
                       'SMA50 breakout' if breakout else
                       'momentum')
            return {
                'action': 'BUY',
                'reason': f'uptrend entry: {trigger}',
                'position_size': 1.0,
                'stop_price': round(initial_stop, 4),
            }

        return {'action': 'HOLD', 'reason': 'waiting for entry trigger', 'position_size': 0}

    # === IF IN POSITION ===
    entry = position_state['entry_price']
    highest = position_state.get('highest_price', entry)
    initial_stop = position_state.get('stop_price', entry * 0.92)

    if price > highest:
        highest = price

    profit_pct = (price - entry) / entry * 100

    # === ADAPTIVE TRAILING STOP ===
    if profit_pct >= 25:
        trailing = highest * 0.92  # 8% from peak
    elif profit_pct >= 10:
        trailing = highest * 0.88  # 12% from peak
    else:
        trailing = initial_stop  # No trailing yet

    active_stop = max(initial_stop, trailing)

    # === EXIT: stop hit ===
    if price <= active_stop:
        return {
            'action': 'SELL',
            'reason': f'stop @ {active_stop:.2f} (P&L {profit_pct:+.1f}%)',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # === EXIT: macro trend broken (Death Cross) ===
    if sma50_now < sma_long_now * 0.98:
        return {
            'action': 'SELL',
            'reason': f'death cross (SMA50<SMA200), P&L {profit_pct:+.1f}%',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # === HOLD: don't exit on RSI alone ===
    return {
        'action': 'HOLD',
        'reason': f'riding uptrend (P&L {profit_pct:+.1f}%)',
        'position_size': 1.0,
        'stop_price': round(active_stop, 4),
        'new_highest': highest,
    }
