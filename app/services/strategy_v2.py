"""
Strategy v2 - Trend Following with Trailing Stop and Regime Filter

Designed to fix v1 weaknesses:
- v1 sold on RSI > 70 even in strong trends -> missed bull markets
- v1 was whipsawed in ranging markets -> losses from false signals
- v1 had no profit-taking mechanism -> gave back gains

v2 rules:
- ENTRY: strong uptrend confirmed (ADX > 22 + price > SMA50 + MACD bullish)
        AND not extreme overbought (RSI < 78)
- EXIT: trailing stop (12% from peak) OR trend break
        DO NOT sell just because RSI is high
- REGIME: skip trading entirely if ADX < 18 (ranging market)
- POSITION: reduce size in high volatility
"""
import numpy as np
from app.services.technical_analysis import (
    calculate_ema, calculate_sma, calculate_rsi, calculate_macd,
    calculate_adx, calculate_atr,
)


def _safe(arr, idx, default=0.0):
    try:
        v = arr[idx]
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return default
        return float(v)
    except (IndexError, TypeError):
        return default


def evaluate_signal_v2(ohlcv: list[dict], position_state: dict | None = None) -> dict:
    """
    Returns:
        {
            'action': 'BUY' | 'SELL' | 'HOLD',
            'reason': str,
            'position_size': float (0.0 to 1.0),
            'stop_price': float | None,
        }

    position_state (if currently long):
        {'entry_price': float, 'highest_price': float, 'entry_date': str}
    """
    if not ohlcv or len(ohlcv) < 60:
        return {'action': 'HOLD', 'reason': 'insufficient data', 'position_size': 0, 'stop_price': None}

    closes = [d['close'] for d in ohlcv]
    highs = [d['high'] for d in ohlcv]
    lows = [d['low'] for d in ohlcv]

    price = closes[-1]

    # Compute indicators
    sma50 = calculate_sma(closes, 50)
    ema20 = calculate_ema(closes, 20)
    rsi = calculate_rsi(closes)
    macd_data = calculate_macd(closes)
    adx_data = calculate_adx(highs, lows, closes)
    atr_data = calculate_atr(highs, lows, closes)

    sma50_now = _safe(sma50, -1, price)
    sma50_prev = _safe(sma50, -5, sma50_now)
    ema20_now = _safe(ema20, -1, price)
    rsi_now = _safe(rsi, -1, 50)
    macd_line = _safe(macd_data['macd_line'], -1, 0)
    macd_signal = _safe(macd_data['signal_line'], -1, 0)
    macd_hist_now = _safe(macd_data['histogram'], -1, 0)
    macd_hist_prev = _safe(macd_data['histogram'], -2, 0)
    adx_now = _safe(adx_data['adx'], -1, 20)
    pdi = _safe(adx_data['pdi'], -1, 50)
    ndi = _safe(adx_data['ndi'], -1, 50)
    atr_now = _safe(atr_data, -1, 0)
    atr_pct = (atr_now / price * 100) if price > 0 else 0

    # === REGIME FILTER ===
    # Skip ranging/choppy markets entirely
    is_trending = adx_now >= 15  # More permissive

    # === IF NOT IN POSITION: check for ENTRY ===
    if position_state is None:
        # Skip if no clear trend
        if not is_trending:
            return {'action': 'HOLD', 'reason': f'no trend (ADX={adx_now:.0f})',
                    'position_size': 0, 'stop_price': None}

        # Trend direction must be UP
        is_uptrend = pdi > ndi and price > sma50_now and ema20_now > sma50_now

        # MACD must confirm OR price just crossed above EMA20
        macd_bullish = macd_line > macd_signal

        # Not extreme overbought
        not_extreme = rsi_now < 80

        # Strong trend bonus: ADX rising
        adx_rising = adx_now > _safe(adx_data['adx'], -5, adx_now)

        if is_uptrend and macd_bullish and not_extreme:
            # Position sizing based on volatility (lower vol = bigger position)
            if atr_pct < 1.5:
                size = 1.0
            elif atr_pct < 2.5:
                size = 0.9
            elif atr_pct < 4:
                size = 0.75
            else:
                size = 0.6

            # Wider initial stop: 2.5x ATR or 10% max
            stop = max(price - 2.5 * atr_now, price * 0.90)

            reason = f'uptrend (ADX={adx_now:.0f}, MACD bull)'
            if adx_rising:
                reason += ' [strengthening]'

            return {
                'action': 'BUY',
                'reason': reason,
                'position_size': size,
                'stop_price': round(stop, 4),
            }

        return {'action': 'HOLD', 'reason': 'no entry signal', 'position_size': 0, 'stop_price': None}

    # === IF IN POSITION: check for EXIT ===
    entry = position_state['entry_price']
    highest = position_state.get('highest_price', entry)
    initial_stop = position_state.get('stop_price', entry * 0.90)

    # Update highest price seen
    if price > highest:
        highest = price

    # === TRAILING STOP ===
    # Activate trailing stop after 8% profit, set 15% below peak (let trends run)
    profit_pct = (price - entry) / entry * 100
    if profit_pct >= 15:
        # Big winner - tighten to 10% trailing
        trailing_stop = highest * 0.90
        active_stop = max(initial_stop, trailing_stop)
    elif profit_pct >= 8:
        # Modest winner - 15% trailing
        trailing_stop = highest * 0.85
        active_stop = max(initial_stop, trailing_stop)
    else:
        active_stop = initial_stop

    # Stop hit
    if price <= active_stop:
        return {
            'action': 'SELL',
            'reason': f'stop hit @ {active_stop:.2f} (P&L was {profit_pct:+.1f}%)',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # Trend break: BOTH price below SMA50 AND SMA50 falling AND ADX shows bear
    trend_break = (
        price < sma50_now and
        sma50_now < sma50_prev and
        ndi > pdi + 5  # Strong bearish DI
    )
    if trend_break:
        return {
            'action': 'SELL',
            'reason': 'trend broken (price < falling SMA50 + bearish DI)',
            'position_size': 0,
            'stop_price': None,
            'new_highest': highest,
        }

    # Otherwise: HOLD position (don't exit on MACD alone - let trailing stop handle it)
    return {
        'action': 'HOLD',
        'reason': f'riding trend (P&L {profit_pct:+.1f}%, stop {active_stop:.2f})',
        'position_size': 1.0,
        'stop_price': round(active_stop, 4),
        'new_highest': highest,
    }
