"""
Run backtest across multiple market regimes and report results.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backtest.historical_data import generate_regime_data
from backtest.backtester import Backtest


def format_pct(v):
    s = f"{v:+.2f}%" if v != 0 else "0.00%"
    return s


def run_scenario(name, regime, days, start_price, volatility, seed):
    print(f"\n{'='*70}")
    print(f"  SCENARIO: {name}")
    print(f"  Regime: {regime} | Days: {days} | Vol: {volatility*100:.1f}%")
    print('='*70)

    data = generate_regime_data(name, days, start_price, regime, volatility, seed)
    bt = Backtest(data, initial_capital=10000, buy_threshold=65, sell_threshold=35)
    result = bt.run()

    print(f"  Initial Capital:    ${result['initial_capital']:,.2f}")
    print(f"  Final Capital:      ${result['final_capital']:,.2f}")
    print(f"  Strategy Return:    {format_pct(result['strategy_return_pct'])}")
    print(f"  Buy & Hold Return:  {format_pct(result['buy_hold_return_pct'])}")
    print(f"  Outperformance:     {format_pct(result['outperformance_pct'])}")
    print(f"  Number of Trades:   {result['num_trades']}")
    print(f"  Win Rate:           {result['win_rate_pct']:.1f}%")
    print(f"  Avg Win:            {format_pct(result['avg_win_pct'])}")
    print(f"  Avg Loss:           {format_pct(result['avg_loss_pct'])}")
    print(f"  Max Drawdown:       -{result['max_drawdown_pct']:.2f}%")
    print(f"  Sharpe Ratio:       {result['sharpe_ratio']:.2f}")
    return result


def main():
    print("\n" + "="*70)
    print("  INVESTPRO BACKTEST - HEURISTIC VALIDATION")
    print("  Strategy: BUY when score >= 65, SELL when score <= 35")
    print("  Capital: $10,000 | Commission: 0.1% per trade")
    print("="*70)

    scenarios = [
        ("Bull Market", "bull", 365, 100, 0.018, 42),
        ("Bear Market", "bear", 365, 100, 0.018, 43),
        ("Ranging Market", "ranging", 365, 100, 0.015, 44),
        ("Crash + Recovery", "crash", 365, 100, 0.022, 45),
        ("Breakout Pattern", "breakout", 365, 100, 0.018, 46),
        ("Mixed (Realistic)", "mixed", 730, 100, 0.020, 47),
    ]

    results = []
    for name, regime, days, price, vol, seed in scenarios:
        r = run_scenario(name, regime, days, price, vol, seed)
        results.append((name, r))

    # Summary table
    print("\n" + "="*70)
    print("  SUMMARY")
    print("="*70)
    print(f"  {'Scenario':<22} {'Strategy':>10} {'B&H':>10} {'Diff':>10} {'Trades':>8} {'WinRate':>8}")
    print(f"  {'-'*22} {'-'*10} {'-'*10} {'-'*10} {'-'*8} {'-'*8}")
    total_strategy = 0
    total_bh = 0
    for name, r in results:
        diff = r['outperformance_pct']
        marker = " ✓" if diff > 0 else " ✗"
        print(f"  {name:<22} {r['strategy_return_pct']:>9.2f}% {r['buy_hold_return_pct']:>9.2f}% {diff:>+9.2f}%{marker} {r['num_trades']:>8} {r['win_rate_pct']:>7.1f}%")
        total_strategy += r['strategy_return_pct']
        total_bh += r['buy_hold_return_pct']

    print(f"  {'-'*22} {'-'*10} {'-'*10} {'-'*10} {'-'*8} {'-'*8}")
    avg_strategy = total_strategy / len(results)
    avg_bh = total_bh / len(results)
    print(f"  {'AVERAGE':<22} {avg_strategy:>9.2f}% {avg_bh:>9.2f}% {avg_strategy - avg_bh:>+9.2f}%")

    print("\n" + "="*70)
    print("  CONCLUSIONS")
    print("="*70)
    wins = sum(1 for _, r in results if r['outperformance_pct'] > 0)
    print(f"  Strategy beat Buy & Hold in {wins}/{len(results)} scenarios")
    print(f"  Average outperformance: {avg_strategy - avg_bh:+.2f}%")
    print()


if __name__ == "__main__":
    main()
