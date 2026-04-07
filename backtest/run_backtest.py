"""
Run backtest comparing v1 (score-based) vs v2 (trend-following) vs Buy&Hold.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backtest.historical_data import generate_regime_data
from backtest.backtester import Backtest


def fmt(v):
    return f"{v:+.2f}%"


def run_scenario(name, regime, days, price, vol, seed):
    data = generate_regime_data(name, days, price, regime, vol, seed)

    v1 = Backtest(data, strategy='v1').run()
    v2 = Backtest(data, strategy='v2').run()

    return {'name': name, 'v1': v1, 'v2': v2}


def main():
    print("\n" + "=" * 88)
    print("  INVESTPRO BACKTEST - V1 (mean reversion) vs V2 (trend following) vs Buy&Hold")
    print("  Capital: $10,000 | Commission: 0.1%")
    print("=" * 88)

    scenarios = [
        ("Bull Market",        "bull",     365, 100, 0.018, 42),
        ("Bear Market",        "bear",     365, 100, 0.018, 43),
        ("Ranging Market",     "ranging",  365, 100, 0.015, 44),
        ("Crash + Recovery",   "crash",    365, 100, 0.022, 45),
        ("Breakout Pattern",   "breakout", 365, 100, 0.018, 46),
        ("Mixed (2 years)",    "mixed",    730, 100, 0.020, 47),
    ]

    results = []
    for name, regime, days, price, vol, seed in scenarios:
        print(f"\n  Running {name}...", end=' ', flush=True)
        r = run_scenario(name, regime, days, price, vol, seed)
        results.append(r)
        print(f"v1={r['v1']['strategy_return_pct']:+.1f}% v2={r['v2']['strategy_return_pct']:+.1f}% B&H={r['v1']['buy_hold_return_pct']:+.1f}%")

    # Detailed table
    print("\n" + "=" * 88)
    print(f"  {'Scenario':<22}{'V1':>10}{'V2':>10}{'B&H':>10}{'V2 vs B&H':>12}{'V2 Trades':>12}{'V2 Win%':>12}")
    print("  " + "-" * 86)

    sum_v1 = sum_v2 = sum_bh = 0
    v2_wins = 0
    for r in results:
        v1 = r['v1']
        v2 = r['v2']
        bh = v1['buy_hold_return_pct']
        diff = v2['strategy_return_pct'] - bh
        marker = " ✓" if diff > 0 else " ✗"
        print(f"  {r['name']:<22}"
              f"{v1['strategy_return_pct']:>9.2f}%"
              f"{v2['strategy_return_pct']:>9.2f}%"
              f"{bh:>9.2f}%"
              f"{diff:>+10.2f}%{marker}"
              f"{v2['num_trades']:>11}"
              f"{v2['win_rate_pct']:>10.1f}%")
        sum_v1 += v1['strategy_return_pct']
        sum_v2 += v2['strategy_return_pct']
        sum_bh += bh
        if diff > 0:
            v2_wins += 1

    n = len(results)
    print("  " + "-" * 86)
    print(f"  {'AVERAGE':<22}"
          f"{sum_v1/n:>9.2f}%"
          f"{sum_v2/n:>9.2f}%"
          f"{sum_bh/n:>9.2f}%"
          f"{(sum_v2-sum_bh)/n:>+10.2f}%")

    # Risk metrics for v2
    print("\n" + "=" * 88)
    print("  V2 RISK METRICS PER SCENARIO")
    print("=" * 88)
    print(f"  {'Scenario':<22}{'Max DD':>10}{'Sharpe':>10}{'Avg Win':>12}{'Avg Loss':>12}")
    print("  " + "-" * 66)
    for r in results:
        v2 = r['v2']
        print(f"  {r['name']:<22}"
              f"{-v2['max_drawdown_pct']:>9.2f}%"
              f"{v2['sharpe_ratio']:>10.2f}"
              f"{v2['avg_win_pct']:>+11.2f}%"
              f"{v2['avg_loss_pct']:>+11.2f}%")

    print("\n" + "=" * 88)
    print(f"  V2 STRATEGY beats Buy & Hold in {v2_wins}/{n} scenarios")
    print(f"  V2 average outperformance: {(sum_v2-sum_bh)/n:+.2f}%")
    print(f"  V1 average outperformance: {(sum_v1-sum_bh)/n:+.2f}%")
    print(f"  V2 improvement over V1:    {(sum_v2-sum_v1)/n:+.2f}%")
    print()


if __name__ == "__main__":
    main()
