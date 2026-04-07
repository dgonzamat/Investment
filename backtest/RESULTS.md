
======================================================================
  INVESTPRO BACKTEST - HEURISTIC VALIDATION
  Strategy: BUY when score >= 65, SELL when score <= 35
  Capital: $10,000 | Commission: 0.1% per trade
======================================================================

======================================================================
  SCENARIO: Bull Market
  Regime: bull | Days: 365 | Vol: 1.8%
======================================================================
  Initial Capital:    $10,000.00
  Final Capital:      $14,051.37
  Strategy Return:    +40.51%
  Buy & Hold Return:  +80.99%
  Outperformance:     -40.48%
  Number of Trades:   3
  Win Rate:           66.7%
  Avg Win:            +20.67%
  Avg Loss:           0.00%
  Max Drawdown:       -11.13%
  Sharpe Ratio:       1.24

======================================================================
  SCENARIO: Bear Market
  Regime: bear | Days: 365 | Vol: 1.8%
======================================================================
  Initial Capital:    $10,000.00
  Final Capital:      $9,975.42
  Strategy Return:    -0.25%
  Buy & Hold Return:  -42.14%
  Outperformance:     +41.89%
  Number of Trades:   2
  Win Rate:           50.0%
  Avg Win:            +5.00%
  Avg Loss:           -4.61%
  Max Drawdown:       -13.40%
  Sharpe Ratio:       0.04

======================================================================
  SCENARIO: Ranging Market
  Regime: ranging | Days: 365 | Vol: 1.5%
======================================================================
  Initial Capital:    $10,000.00
  Final Capital:      $8,995.27
  Strategy Return:    -10.05%
  Buy & Hold Return:  +7.73%
  Outperformance:     -17.78%
  Number of Trades:   6
  Win Rate:           16.7%
  Avg Win:            +4.68%
  Avg Loss:           -2.75%
  Max Drawdown:       -17.29%
  Sharpe Ratio:       -0.80

======================================================================
  SCENARIO: Crash + Recovery
  Regime: crash | Days: 365 | Vol: 2.2%
======================================================================
  Initial Capital:    $10,000.00
  Final Capital:      $7,869.96
  Strategy Return:    -21.30%
  Buy & Hold Return:  -54.51%
  Outperformance:     +33.21%
  Number of Trades:   2
  Win Rate:           0.0%
  Avg Win:            0.00%
  Avg Loss:           -10.93%
  Max Drawdown:       -26.76%
  Sharpe Ratio:       -1.14

======================================================================
  SCENARIO: Breakout Pattern
  Regime: breakout | Days: 365 | Vol: 1.8%
======================================================================
  Initial Capital:    $10,000.00
  Final Capital:      $11,084.25
  Strategy Return:    +10.84%
  Buy & Hold Return:  +47.84%
  Outperformance:     -37.00%
  Number of Trades:   9
  Win Rate:           22.2%
  Avg Win:            +18.60%
  Avg Loss:           -2.79%
  Max Drawdown:       -25.46%
  Sharpe Ratio:       0.54

======================================================================
  SCENARIO: Mixed (Realistic)
  Regime: mixed | Days: 730 | Vol: 2.0%
======================================================================
  Initial Capital:    $10,000.00
  Final Capital:      $11,914.55
  Strategy Return:    +19.15%
  Buy & Hold Return:  +91.57%
  Outperformance:     -72.42%
  Number of Trades:   4
  Win Rate:           75.0%
  Avg Win:            +10.37%
  Avg Loss:           -10.26%
  Max Drawdown:       -34.75%
  Sharpe Ratio:       0.39

======================================================================
  SUMMARY
======================================================================
  Scenario                 Strategy        B&H       Diff   Trades  WinRate
  ---------------------- ---------- ---------- ---------- -------- --------
  Bull Market                40.51%     80.99%    -40.48% ✗        3    66.7%
  Bear Market                -0.25%    -42.14%    +41.89% ✓        2    50.0%
  Ranging Market            -10.05%      7.73%    -17.78% ✗        6    16.7%
  Crash + Recovery          -21.30%    -54.51%    +33.21% ✓        2     0.0%
  Breakout Pattern           10.84%     47.84%    -37.00% ✗        9    22.2%
  Mixed (Realistic)          19.15%     91.57%    -72.42% ✗        4    75.0%
  ---------------------- ---------- ---------- ---------- -------- --------
  AVERAGE                     6.48%     21.91%    -15.43%

======================================================================
  CONCLUSIONS
======================================================================
  Strategy beat Buy & Hold in 2/6 scenarios
  Average outperformance: -15.43%

