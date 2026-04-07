"""
Monte Carlo robustness testing.
Run each strategy x regime with 50 seeds to validate statistical significance.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from backtest.historical_data import generate_regime_data
from backtest.backtester import Backtest


REGIMES = [
    ("Bull",     "bull",     400, 100, 0.018),
    ("Bear",     "bear",     400, 100, 0.018),
    ("Ranging",  "ranging",  400, 100, 0.015),
    ("Crash",    "crash",    400, 100, 0.022),
    ("Breakout", "breakout", 400, 100, 0.018),
    ("Mixed",    "mixed",    600, 100, 0.020),
]

STRATEGIES = ["v4", "v6", "v7"]
N_SEEDS = 30


def run_monte_carlo():
    print("\n" + "=" * 100)
    print(f"  MONTE CARLO ROBUSTNESS TEST - {N_SEEDS} seeds × {len(STRATEGIES)} strategies × {len(REGIMES)} regimes")
    print(f"  Total backtests: {N_SEEDS * len(STRATEGIES) * len(REGIMES)}")
    print("=" * 100)

    # results[regime][strategy] = list of (return, bh_return) tuples
    results = {r[0]: {s: [] for s in STRATEGIES} for r in REGIMES}

    import time
    t_start = time.time()
    for regime_name, regime, days, price, vol in REGIMES:
        print(f"  Running {regime_name}...", end=' ', flush=True)
        t0 = time.time()
        for seed in range(N_SEEDS):
            data = generate_regime_data(regime_name, days, price, regime, vol, seed=seed)
            for strat in STRATEGIES:
                bt = Backtest(data, strategy=strat).run()
                results[regime_name][strat].append((bt['strategy_return_pct'], bt['buy_hold_return_pct']))
        print(f"done in {time.time() - t0:.0f}s")
    print(f"\n  Total time: {time.time() - t_start:.0f}s")

    # Aggregate stats
    print("\n" + "=" * 100)
    print(f"  MEAN RETURNS ({N_SEEDS} seeds avg)")
    print("=" * 100)
    header = f"  {'Regime':<12}"
    for s in STRATEGIES:
        header += f"{s.upper():>11}"
    header += f"{'B&H':>11}"
    print(header)
    print("  " + "-" * (12 + 11 * (len(STRATEGIES) + 1)))
    avg_strat = {s: [] for s in STRATEGIES}
    avg_bh = []
    first_strat = STRATEGIES[0]
    for regime_name, *_ in REGIMES:
        bh = np.mean([r[1] for r in results[regime_name][first_strat]])
        line = f"  {regime_name:<12}"
        for s in STRATEGIES:
            mean_ret = np.mean([r[0] for r in results[regime_name][s]])
            avg_strat[s].append(mean_ret)
            line += f"{mean_ret:>10.1f}%"
        avg_bh.append(bh)
        line += f"{bh:>10.1f}%"
        print(line)

    print("  " + "-" * (12 + 11 * (len(STRATEGIES) + 1)))
    line = f"  {'AVERAGE':<12}"
    for s in STRATEGIES:
        line += f"{np.mean(avg_strat[s]):>10.1f}%"
    line += f"{np.mean(avg_bh):>10.1f}%"
    print(line)

    # Win rates vs B&H
    print("\n" + "=" * 100)
    print("  WIN RATE vs Buy&Hold (% of seeds where strategy beats B&H)")
    print("=" * 100)
    header = f"  {'Regime':<12}"
    for s in STRATEGIES:
        header += f"{s.upper() + ' win%':>12}"
    print(header)
    print("  " + "-" * (12 + 12 * len(STRATEGIES)))
    overall_wins = {s: 0 for s in STRATEGIES}
    overall_total = 0
    for regime_name, *_ in REGIMES:
        line = f"  {regime_name:<12}"
        for s in STRATEGIES:
            wins = sum(1 for ret, bh in results[regime_name][s] if ret > bh)
            wr = wins / N_SEEDS * 100
            overall_wins[s] += wins
            line += f"{wr:>11.1f}%"
        overall_total += N_SEEDS
        print(line)
    print("  " + "-" * (12 + 12 * len(STRATEGIES)))
    line = f"  {'OVERALL':<12}"
    for s in STRATEGIES:
        line += f"{overall_wins[s]/overall_total*100:>11.1f}%"
    print(line)

    # Std dev (consistency)
    print("\n" + "=" * 100)
    print("  STD DEV OF RETURNS (lower = more consistent)")
    print("=" * 100)
    header = f"  {'Regime':<12}"
    for s in STRATEGIES:
        header += f"{s.upper() + ' σ':>11}"
    print(header)
    print("  " + "-" * (12 + 11 * len(STRATEGIES)))
    for regime_name, *_ in REGIMES:
        line = f"  {regime_name:<12}"
        for s in STRATEGIES:
            std = np.std([r[0] for r in results[regime_name][s]])
            line += f"{std:>10.1f}%"
        print(line)

    # Percentiles for best strategy
    best_strat = max(STRATEGIES, key=lambda s: overall_wins[s])
    print("\n" + "=" * 100)
    print(f"  {best_strat.upper()} PERCENTILES (worst-case to best-case across {N_SEEDS} seeds)")
    print("=" * 100)
    print(f"  {'Regime':<12}{'P5 (worst)':>14}{'P25':>11}{'Median':>11}{'P75':>11}{'P95 (best)':>14}")
    print("  " + "-" * 71)
    for regime_name, *_ in REGIMES:
        rets = [r[0] for r in results[regime_name][best_strat]]
        p5 = np.percentile(rets, 5)
        p25 = np.percentile(rets, 25)
        p50 = np.percentile(rets, 50)
        p75 = np.percentile(rets, 75)
        p95 = np.percentile(rets, 95)
        print(f"  {regime_name:<12}{p5:>13.1f}%{p25:>10.1f}%{p50:>10.1f}%{p75:>10.1f}%{p95:>13.1f}%")

    # Best strategy verdict
    print("\n" + "=" * 100)
    best_overall = max(STRATEGIES, key=lambda s: overall_wins[s])
    print(f"  WINNER (most consistent vs B&H): {best_overall.upper()}")
    print(f"  Win rate across all 300 backtests: {overall_wins[best_overall]/overall_total*100:.1f}%")
    print(f"  Robustness threshold (>60% wins): {'PASSED ✓' if overall_wins[best_overall]/overall_total > 0.6 else 'FAILED ✗'}")
    print("=" * 100)

    return results


if __name__ == "__main__":
    run_monte_carlo()
