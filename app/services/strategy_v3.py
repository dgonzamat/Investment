"""
Strategy v3 - Hybrid Donchian + Adaptive Trailing

Combines Turtle-style breakouts with V2's adaptive trailing.
Key improvements over V2:
- Faster entry: Donchian 20-day high breakout (not waiting for ADX 15+)
- Wider exit: trailing stop only (no 10-day low exit which kills trends)
- Pyramiding: add to winners (key Turtle insight)
- Long-only, full position sizing
"""
import numpy as np
from app.services.technical_analysis import (
    calculate_sma, calculate_atr,
)


def _safe(arr, idx, default=0.0):
    try:
        v = arr[idx]
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return default
        return float(v)
    except (IndexError, TypeError):
        return default


def evaluate_signal_v3(
    ohlcv: list[dict],
    position_state: dict | None = None,
    entry_period: int = 20,    # Donchian entry channel
    trend_filter: int = 50,    # SMA trend filter
) -> dict:
    """
    Returns: {'action': 'BUY'|'SELL'|'HOLD'|'PYRAMID', ...}
    """
    if not ohlcv or len(ohlcv) < trend_filter + 5:
        return {'action': 'HOLD', 'reason': 'insufficient data', 'position_size': 0}

    closes = [d['close'] for d in ohlcv]
    highs = [d['high'] for d in ohlcv]
    lows = [d['low'] for d in ohlcv]

    price = closes[-1]

    # Donchian entry channel
    entry_high = max(highs[-entry_period - 1:-1])

    # Trend filter (50-day SMA rising)
    sma_trend = calculate_sma(closes, trend_filter)
    sma_now = _safe(sma_trend, -1, price)
    sma_past = _safe(sma_trend, -10, sma_now)
    trend_up = sma_now > sma_past and price > sma_now

    # ATR for stops
    atr = calculate_atr(highs, lows, closes, period=20)
    atr_now = _safe(atr, -1, price * 0.02)
    if atr_now <= 0:
        atr_now = price * 0.02

    # === IF NOT IN POSITION: check for ENTRY ===
    if position_state is None:
        breakout = price > entry_high

        if breakout and trend_up:
            initial_stop = max(price - 2.5 * atr_now, price * 0.90)
            return {
                'action': 'BUY',
                'reason': f'Donchian breakout {price:.2f} > {entry_high:.2f}',
                'position_size': 1.0,  # Full position
                'stop_price': round(initial_stop, 4),
            }

        return {'action': 'HOLD', 'reason': 'no breakout', 'position_size': 0}

    # === IF IN POSITION ===
    entry = position_state['entry_price']
    highest = position_state.get('highest_price', entry)
    initial_stop = position_state.get('stop_price', entry * 0.90)
    units_added = position_state.get('units_added', 0)

    if price > highest:
        highest = price

    # === ADAPTIVE TRAILING STOP ===
    # As profit grows, we tighten the stop
    profit_pct = (price - entry) / entry * 100
    if profit_pct >= 30:
        # Big winner: 8% trailing
        trailing = highest * 0.92
    elif profit_pct >= 15:
        # Solid winner: 12% trailing
        trailing = highest * 0.88
    elif profit_pct >= 5:
        # Modest winner: 15% trailing
        trailing = highest * 0.85
    else:
        trailing = initial_stop

    active_stop = max(initial_stop, trailing)

    # === EXIT: stop hit ===
    if price <= active_stop:
        return {
            'action': 'SELL',
            'reason': f'trailing stop @ {active_stop:.2f} (P&L {profit_pct:+.1f}%, peak {highest:.2f})',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # === EXIT: trend completely broken (price < SMA50 by >5% AND falling SMA) ===
    sma_drop = (sma_now - price) / sma_now * 100
    if sma_drop > 5 and sma_now < sma_past:
        return {
            'action': 'SELL',
            'reason': f'trend break (price {sma_drop:.1f}% below falling SMA50)',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # === PYRAMIDING: add to position on each 1*ATR move in favor (max 2 adds) ===
    pyramid_level = entry + (units_added + 1) * 1.0 * atr_now
    if units_added < 2 and price >= pyramid_level and profit_pct > 3:
        new_stop = max(active_stop, price - 2.5 * atr_now)
        return {
            'action': 'PYRAMID',
            'reason': f'pyramid #{units_added + 1} @ {price:.2f} (P&L {profit_pct:+.1f}%)',
            'position_size': 0.3,
            'stop_price': round(new_stop, 4),
            'new_highest': highest,
        }

    # === HOLD ===
    return {
        'action': 'HOLD',
        'reason': f'riding trend (P&L {profit_pct:+.1f}%, stop {active_stop:.2f})',
        'position_size': 1.0,
        'stop_price': round(active_stop, 4),
        'new_highest': highest,
    }
