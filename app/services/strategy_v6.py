"""
Strategy v6 - Antonacci-inspired Absolute Momentum Filter

Based on Gary Antonacci's GEM (Global Equities Momentum), validated by
academic research from 1926-2020 to outperform buy-and-hold with lower
drawdown across multiple decades and market regimes.

Original GEM uses 3 assets (S&P, International, Bonds) for rotation.
Since our backtester is single-asset, we implement only the core insight:
ABSOLUTE MOMENTUM FILTER.

Rules (extremely simple):
- Once per month (or whenever): check 12-month return
- If 12-month return > 0: stay invested (long the asset)
- If 12-month return <= 0: stay in cash
- Re-check monthly only (avoids whipsaws)
- No stop-loss, no trailing, no complexity

This is the "stupidly simple" baseline that has historically beaten
most complex TA strategies. If V4 can't beat THIS, V4 is overengineered.
"""
import numpy as np


def evaluate_signal_v6(ohlcv: list[dict], position_state: dict | None = None) -> dict:
    if not ohlcv or len(ohlcv) < 252:  # Need at least 1 year of data
        return {'action': 'HOLD', 'reason': 'insufficient data (need 252 days)', 'position_size': 0}

    closes = [d['close'] for d in ohlcv]
    price = closes[-1]
    n = len(closes)

    # 12-month (252 trading day) return
    price_12m_ago = closes[-252]
    return_12m = (price - price_12m_ago) / price_12m_ago

    # We only "check" on the first day of the month (every 21 trading days)
    # to avoid daily whipsaws. Use position_state to track last check.
    last_check_idx = position_state.get('last_check_idx', -22) if position_state else -22
    days_since_check = n - last_check_idx if last_check_idx > 0 else 999

    # === IF NOT IN POSITION ===
    if position_state is None:
        if return_12m > 0:
            return {
                'action': 'BUY',
                'reason': f'12m momentum positive ({return_12m*100:+.1f}%)',
                'position_size': 1.0,
                'stop_price': None,  # No stop loss
                'last_check_idx': n,
            }
        return {'action': 'HOLD', 'reason': f'12m momentum negative ({return_12m*100:+.1f}%)',
                'position_size': 0}

    # === IF IN POSITION ===
    # Only re-evaluate monthly (every 21 trading days)
    if days_since_check < 21:
        return {
            'action': 'HOLD',
            'reason': f'monthly check (next in {21 - days_since_check}d)',
            'position_size': 1.0,
            'stop_price': None,
            'last_check_idx': last_check_idx,
        }

    # Monthly re-evaluation
    if return_12m > 0:
        return {
            'action': 'HOLD',
            'reason': f'monthly: 12m mom {return_12m*100:+.1f}%, stay invested',
            'position_size': 1.0,
            'stop_price': None,
            'last_check_idx': n,
        }
    else:
        # Exit to cash
        entry = position_state.get('entry_price', price)
        profit_pct = (price - entry) / entry * 100
        return {
            'action': 'SELL',
            'reason': f'12m mom turned negative ({return_12m*100:+.1f}%), P&L {profit_pct:+.1f}%',
            'position_size': 0,
            'stop_price': None,
        }
