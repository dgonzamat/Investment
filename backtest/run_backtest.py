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
    v3 = Backtest(data, strategy='v3').run()
    v4 = Backtest(data, strategy='v4').run()

    return {'name': name, 'v1': v1, 'v2': v2, 'v3': v3, 'v4': v4}


def main():
    print("\n" + "=" * 110)
    print("  INVESTPRO BACKTEST - V1 (mean rev) vs V2 (trend) vs V3 (Donchian) vs V4 (Buy-Dip) vs Buy&Hold")
    print("  Capital: $10,000 | Commission: 0.1%")
    print("=" * 110)

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
        print(f"v1={r['v1']['strategy_return_pct']:+.0f}% v2={r['v2']['strategy_return_pct']:+.0f}% v3={r['v3']['strategy_return_pct']:+.0f}% v4={r['v4']['strategy_return_pct']:+.0f}% B&H={r['v1']['buy_hold_return_pct']:+.0f}%")

    # Detailed table
    print("\n" + "=" * 110)
    print(f"  {'Scenario':<22}{'V1':>9}{'V2':>9}{'V3':>9}{'V4':>9}{'B&H':>9}{'V4 vs B&H':>13}{'V4 Tr':>8}{'V4 Win%':>10}")
    print("  " + "-" * 100)

    sum_v1 = sum_v2 = sum_v3 = sum_v4 = sum_bh = 0
    v4_wins = 0
    for r in results:
        v1, v2, v3, v4 = r['v1'], r['v2'], r['v3'], r['v4']
        bh = v1['buy_hold_return_pct']
        diff = v4['strategy_return_pct'] - bh
        marker = " ✓" if diff > 0 else " ✗"
        print(f"  {r['name']:<22}"
              f"{v1['strategy_return_pct']:>8.1f}%"
              f"{v2['strategy_return_pct']:>8.1f}%"
              f"{v3['strategy_return_pct']:>8.1f}%"
              f"{v4['strategy_return_pct']:>8.1f}%"
              f"{bh:>8.1f}%"
              f"{diff:>+11.1f}%{marker}"
              f"{v4['num_trades']:>7}"
              f"{v4['win_rate_pct']:>9.1f}%")
        sum_v1 += v1['strategy_return_pct']
        sum_v2 += v2['strategy_return_pct']
        sum_v3 += v3['strategy_return_pct']
        sum_v4 += v4['strategy_return_pct']
        sum_bh += bh
        if diff > 0:
            v4_wins += 1

    n = len(results)
    print("  " + "-" * 100)
    print(f"  {'AVERAGE':<22}"
          f"{sum_v1/n:>8.1f}%"
          f"{sum_v2/n:>8.1f}%"
          f"{sum_v3/n:>8.1f}%"
          f"{sum_v4/n:>8.1f}%"
          f"{sum_bh/n:>8.1f}%"
          f"{(sum_v4-sum_bh)/n:>+11.1f}%")

    # Risk metrics for v4
    print("\n" + "=" * 110)
    print("  V4 (BUY-THE-DIP) RISK METRICS")
    print("=" * 110)
    print(f"  {'Scenario':<22}{'Max DD':>10}{'Sharpe':>10}{'Avg Win':>12}{'Avg Loss':>12}")
    print("  " + "-" * 66)
    for r in results:
        v4 = r['v4']
        print(f"  {r['name']:<22}"
              f"{-v4['max_drawdown_pct']:>9.2f}%"
              f"{v4['sharpe_ratio']:>10.2f}"
              f"{v4['avg_win_pct']:>+11.2f}%"
              f"{v4['avg_loss_pct']:>+11.2f}%")

    print("\n" + "=" * 110)
    print(f"  V4 (Buy-the-Dip) beats Buy & Hold in {v4_wins}/{n} scenarios")
    print(f"  V4 avg outperformance: {(sum_v4-sum_bh)/n:+.2f}%")
    print(f"  V3 avg outperformance: {(sum_v3-sum_bh)/n:+.2f}%")
    print(f"  V2 avg outperformance: {(sum_v2-sum_bh)/n:+.2f}%")
    print(f"  V1 avg outperformance: {(sum_v1-sum_bh)/n:+.2f}%")
    print()
    print(f"  BEST STRATEGY: ", end='')
    best = max([('V1', sum_v1), ('V2', sum_v2), ('V3', sum_v3), ('V4', sum_v4)], key=lambda x: x[1])
    print(f"{best[0]} with avg return {best[1]/n:+.2f}%")
    print()


if __name__ == "__main__":
    main()
