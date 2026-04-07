"""
Stress test V4 against various commission, slippage, and market frictions.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from backtest.historical_data import generate_regime_data
from backtest.backtester import Backtest


REGIMES = [
    ("Bull",     "bull",     250, 100, 0.018),
    ("Bear",     "bear",     250, 100, 0.018),
    ("Crash",    "crash",    250, 100, 0.022),
    ("Mixed",    "mixed",    400, 100, 0.020),
]
N_SEEDS = 20  # Smaller for stress test


def avg_outperformance(strategy, commission, n_seeds=N_SEEDS):
    """Returns average outperformance vs B&H across all regimes and seeds."""
    diffs = []
    for regime_name, regime, days, price, vol in REGIMES:
        for seed in range(n_seeds):
            data = generate_regime_data(regime_name, days, price, regime, vol, seed=seed)
            bt = Backtest(data, strategy=strategy, commission=commission).run()
            diffs.append(bt['strategy_return_pct'] - bt['buy_hold_return_pct'])
    return np.mean(diffs), np.median(diffs)


def main():
    print("\n" + "=" * 80)
    print(f"  STRESS TEST: V4 across commission levels ({N_SEEDS} seeds × {len(REGIMES)} regimes)")
    print("=" * 80)

    print(f"\n  {'Commission':>14}{'V4 mean alpha':>20}{'V4 median alpha':>20}{'Verdict':>15}")
    print("  " + "-" * 70)

    commissions = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02]
    for c in commissions:
        mean, median = avg_outperformance('v4', c)
        verdict = "PROFITABLE" if mean > 0 else "UNPROFITABLE"
        print(f"  {c*100:>12.2f}%{mean:>+19.2f}%{median:>+19.2f}%{verdict:>15}")

    print("\n" + "=" * 80)
    print("  ANALYSIS")
    print("=" * 80)
    print("  Real-world commission levels:")
    print("  - Robinhood/IBKR: 0.00% - 0.05%")
    print("  - TD Ameritrade/Schwab: 0.00% - 0.10%")
    print("  - Most retail brokers (Chile): 0.30% - 0.80%")
    print("  - High-cost brokers: 1.00% - 2.00%")
    print()


if __name__ == "__main__":
    main()
