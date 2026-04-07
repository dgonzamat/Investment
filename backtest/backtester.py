"""
Backtester for the InvestPro technical analysis strategy.

Strategy rules:
- BUY when composite score >= BUY_THRESHOLD (default 65)
- SELL when composite score <= SELL_THRESHOLD (default 35)
- Position sizing: all-in / all-out
- Tracks: total return, win rate, max drawdown, Sharpe ratio
- Compares against buy-and-hold benchmark
"""
import numpy as np
from app.services.signal_generator import generate_composite_score


class Backtest:
    def __init__(
        self,
        ohlcv: list[dict],
        initial_capital: float = 10000,
        buy_threshold: float = 65,
        sell_threshold: float = 35,
        warmup_days: int = 50,  # Need this much data for indicators
        commission: float = 0.001,  # 0.1% per trade
    ):
        self.ohlcv = ohlcv
        self.initial_capital = initial_capital
        self.buy_threshold = buy_threshold
        self.sell_threshold = sell_threshold
        self.warmup_days = warmup_days
        self.commission = commission

    def run(self) -> dict:
        cash = self.initial_capital
        shares = 0
        trades = []
        equity_curve = []
        positions_open = None  # entry price when long

        for i in range(self.warmup_days, len(self.ohlcv)):
            window = self.ohlcv[: i + 1]
            current_price = window[-1]["close"]
            current_date = window[-1]["date"]

            # Run our strategy
            analysis = generate_composite_score(window)
            score = analysis["score"]

            equity = cash + shares * current_price
            equity_curve.append({"date": current_date, "equity": equity, "price": current_price, "score": score})

            # Trading logic
            if score >= self.buy_threshold and shares == 0:
                # BUY signal
                shares_to_buy = (cash * (1 - self.commission)) / current_price
                cost = shares_to_buy * current_price * (1 + self.commission)
                if cost <= cash:
                    shares = shares_to_buy
                    cash -= cost
                    positions_open = current_price
                    trades.append({
                        "date": current_date,
                        "action": "BUY",
                        "price": current_price,
                        "shares": shares,
                        "score": score,
                    })

            elif score <= self.sell_threshold and shares > 0:
                # SELL signal
                proceeds = shares * current_price * (1 - self.commission)
                cash += proceeds
                pnl_pct = ((current_price - positions_open) / positions_open) * 100
                trades.append({
                    "date": current_date,
                    "action": "SELL",
                    "price": current_price,
                    "shares": shares,
                    "score": score,
                    "pnl_pct": pnl_pct,
                })
                shares = 0
                positions_open = None

        # Final liquidation at last price
        if shares > 0:
            final_price = self.ohlcv[-1]["close"]
            cash += shares * final_price * (1 - self.commission)
            pnl_pct = ((final_price - positions_open) / positions_open) * 100
            trades.append({
                "date": self.ohlcv[-1]["date"],
                "action": "SELL_FINAL",
                "price": final_price,
                "shares": shares,
                "pnl_pct": pnl_pct,
            })
            shares = 0

        # Buy & Hold benchmark
        bh_start_price = self.ohlcv[self.warmup_days]["close"]
        bh_end_price = self.ohlcv[-1]["close"]
        bh_shares = self.initial_capital / bh_start_price
        bh_final = bh_shares * bh_end_price
        bh_return = ((bh_final - self.initial_capital) / self.initial_capital) * 100

        # Strategy metrics
        strategy_return = ((cash - self.initial_capital) / self.initial_capital) * 100
        sells = [t for t in trades if t["action"] in ("SELL", "SELL_FINAL") and "pnl_pct" in t]
        winning_trades = [t for t in sells if t["pnl_pct"] > 0]
        win_rate = (len(winning_trades) / len(sells) * 100) if sells else 0
        avg_win = np.mean([t["pnl_pct"] for t in winning_trades]) if winning_trades else 0
        losing_trades = [t for t in sells if t["pnl_pct"] <= 0]
        avg_loss = np.mean([t["pnl_pct"] for t in losing_trades]) if losing_trades else 0

        # Max drawdown
        equities = [e["equity"] for e in equity_curve]
        peak = self.initial_capital
        max_dd = 0
        for eq in equities:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100
            if dd > max_dd:
                max_dd = dd

        # Sharpe ratio (annualized, assuming 252 trading days)
        if len(equities) > 1:
            returns = np.diff(equities) / equities[:-1]
            sharpe = (np.mean(returns) / np.std(returns) * np.sqrt(252)) if np.std(returns) > 0 else 0
        else:
            sharpe = 0

        return {
            "initial_capital": self.initial_capital,
            "final_capital": round(cash, 2),
            "strategy_return_pct": round(strategy_return, 2),
            "buy_hold_return_pct": round(bh_return, 2),
            "outperformance_pct": round(strategy_return - bh_return, 2),
            "num_trades": len(sells),
            "win_rate_pct": round(win_rate, 2),
            "avg_win_pct": round(float(avg_win), 2),
            "avg_loss_pct": round(float(avg_loss), 2),
            "max_drawdown_pct": round(max_dd, 2),
            "sharpe_ratio": round(float(sharpe), 2),
            "trades": trades,
            "equity_curve": equity_curve,
        }
