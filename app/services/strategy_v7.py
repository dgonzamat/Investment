"""
Strategy V7 - Accelerating Dual Momentum (ADM)

Based on Engineered Portfolio's improvement to Antonacci's GEM (2018),
validated by 150-year backtest to outperform GEM without overfitting.

Source: https://engineeredportfolio.com/2018/05/02/accelerating-dual-momentum-investing/
GitHub: https://github.com/AleksLi1/Accelerating_Dual_Momentum

Key insight: GEM's 12-month signal is too slow. Sum of multiple shorter
lookbacks (1m + 3m + 6m) is more responsive while staying robust.

Rules:
- Calculate 1m, 3m, 6m returns (21, 63, 126 trading days)
- Score = ret_1m + ret_3m + ret_6m
- If score > 0: IN MARKET (long)
- If score <= 0: IN CASH
- Re-evaluate monthly only (avoids whipsaws)
- NO stops, NO trailing
"""
import numpy as np


def evaluate_signal_v7(ohlcv: list[dict], position_state: dict | None = None) -> dict:
    if not ohlcv or len(ohlcv) < 126:  # Need at least 6 months
        return {'action': 'HOLD', 'reason': 'insufficient data (need 126 days)', 'position_size': 0}

    closes = [d['close'] for d in ohlcv]
    price = closes[-1]
    n = len(closes)

    # Calculate 1m, 3m, 6m returns
    ret_1m = (price - closes[-21]) / closes[-21]
    ret_3m = (price - closes[-63]) / closes[-63]
    ret_6m = (price - closes[-126]) / closes[-126]

    # ADM Score
    score = ret_1m + ret_3m + ret_6m

    # Monthly check (every 21 days)
    last_check_idx = position_state.get('last_check_idx', -22) if position_state else -22
    days_since_check = n - last_check_idx if last_check_idx > 0 else 999

    # === IF NOT IN POSITION ===
    if position_state is None:
        if score > 0:
            return {
                'action': 'BUY',
                'reason': f'ADM score positive ({score*100:+.1f}%): 1m={ret_1m*100:+.1f}, 3m={ret_3m*100:+.1f}, 6m={ret_6m*100:+.1f}',
                'position_size': 1.0,
                'stop_price': None,
                'last_check_idx': n,
            }
        return {
            'action': 'HOLD',
            'reason': f'ADM score negative ({score*100:+.1f}%)',
            'position_size': 0,
        }

    # === IF IN POSITION ===
    # Only re-evaluate monthly
    if days_since_check < 21:
        return {
            'action': 'HOLD',
            'reason': f'monthly check (next in {21 - days_since_check}d, score {score*100:+.1f}%)',
            'position_size': 1.0,
            'stop_price': None,
            'last_check_idx': last_check_idx,
        }

    # Monthly re-evaluation
    if score > 0:
        return {
            'action': 'HOLD',
            'reason': f'monthly: ADM {score*100:+.1f}%, stay invested',
            'position_size': 1.0,
            'stop_price': None,
            'last_check_idx': n,
        }
    else:
        entry = position_state.get('entry_price', price)
        profit_pct = (price - entry) / entry * 100
        return {
            'action': 'SELL',
            'reason': f'ADM turned negative ({score*100:+.1f}%), P&L {profit_pct:+.1f}%',
            'position_size': 0,
            'stop_price': None,
        }
