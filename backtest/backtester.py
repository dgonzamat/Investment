"""
Backtester supporting both v1 (score-based) and v2 (trend-following) strategies.
"""
import numpy as np
from app.services.signal_generator import generate_composite_score
from app.services.strategy_v2 import evaluate_signal_v2


class Backtest:
    def __init__(
        self,
        ohlcv: list[dict],
        initial_capital: float = 10000,
        strategy: str = "v2",
        warmup_days: int = 60,
        commission: float = 0.001,
        buy_threshold: float = 65,
        sell_threshold: float = 35,
    ):
        self.ohlcv = ohlcv
        self.initial_capital = initial_capital
        self.strategy = strategy
        self.warmup_days = warmup_days
        self.commission = commission
        self.buy_threshold = buy_threshold
        self.sell_threshold = sell_threshold

    def _step_v1(self, window, cash, shares, position_state):
        analysis = generate_composite_score(window)
        score = analysis['score']
        price = window[-1]['close']

        if score >= self.buy_threshold and shares == 0:
            return ('BUY', 1.0, None, f'score={score:.0f}')
        elif score <= self.sell_threshold and shares > 0:
            return ('SELL', 0, None, f'score={score:.0f}')
        return ('HOLD', 0, None, '')

    def _step_v2(self, window, cash, shares, position_state):
        result = evaluate_signal_v2(window, position_state)
        return (result['action'], result.get('position_size', 0),
                result.get('stop_price'), result.get('reason', ''))

    def run(self) -> dict:
        cash = self.initial_capital
        shares = 0
        trades = []
        equity_curve = []
        position_state = None

        step_fn = self._step_v2 if self.strategy == 'v2' else self._step_v1

        for i in range(self.warmup_days, len(self.ohlcv)):
            window = self.ohlcv[: i + 1]
            current_price = window[-1]['close']
            current_date = window[-1]['date']

            action, size, stop, reason = step_fn(window, cash, shares, position_state)

            equity = cash + shares * current_price
            equity_curve.append({'date': current_date, 'equity': equity, 'price': current_price})

            if action == 'BUY' and shares == 0:
                # Use position size to determine capital allocation
                capital_to_use = cash * size
                shares_to_buy = (capital_to_use * (1 - self.commission)) / current_price
                cost = shares_to_buy * current_price * (1 + self.commission)
                if cost <= cash and shares_to_buy > 0:
                    shares = shares_to_buy
                    cash -= cost
                    position_state = {
                        'entry_price': current_price,
                        'highest_price': current_price,
                        'entry_date': current_date,
                        'stop_price': stop or current_price * 0.92,
                    }
                    trades.append({
                        'date': current_date, 'action': 'BUY',
                        'price': current_price, 'shares': shares,
                        'reason': reason,
                    })

            elif action == 'SELL' and shares > 0:
                proceeds = shares * current_price * (1 - self.commission)
                cash += proceeds
                pnl_pct = ((current_price - position_state['entry_price'])
                           / position_state['entry_price'] * 100)
                trades.append({
                    'date': current_date, 'action': 'SELL',
                    'price': current_price, 'shares': shares,
                    'pnl_pct': pnl_pct, 'reason': reason,
                })
                shares = 0
                position_state = None

            elif action == 'HOLD' and shares > 0:
                # Update highest price for trailing stop
                if current_price > position_state['highest_price']:
                    position_state['highest_price'] = current_price
                if stop:
                    position_state['stop_price'] = stop

        # Final liquidation
        if shares > 0:
            final_price = self.ohlcv[-1]['close']
            cash += shares * final_price * (1 - self.commission)
            pnl_pct = ((final_price - position_state['entry_price'])
                       / position_state['entry_price'] * 100)
            trades.append({
                'date': self.ohlcv[-1]['date'], 'action': 'SELL_FINAL',
                'price': final_price, 'shares': shares, 'pnl_pct': pnl_pct,
            })

        # Buy & Hold benchmark
        bh_start_price = self.ohlcv[self.warmup_days]['close']
        bh_end_price = self.ohlcv[-1]['close']
        bh_shares = self.initial_capital / bh_start_price
        bh_final = bh_shares * bh_end_price
        bh_return = ((bh_final - self.initial_capital) / self.initial_capital) * 100

        # Metrics
        strategy_return = ((cash - self.initial_capital) / self.initial_capital) * 100
        sells = [t for t in trades if t['action'] in ('SELL', 'SELL_FINAL') and 'pnl_pct' in t]
        winning = [t for t in sells if t['pnl_pct'] > 0]
        losing = [t for t in sells if t['pnl_pct'] <= 0]
        win_rate = (len(winning) / len(sells) * 100) if sells else 0
        avg_win = float(np.mean([t['pnl_pct'] for t in winning])) if winning else 0
        avg_loss = float(np.mean([t['pnl_pct'] for t in losing])) if losing else 0

        # Max drawdown
        equities = [e['equity'] for e in equity_curve]
        peak = self.initial_capital
        max_dd = 0
        for eq in equities:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100
            if dd > max_dd:
                max_dd = dd

        # Sharpe
        if len(equities) > 1:
            returns = np.diff(equities) / equities[:-1]
            sharpe = (float(np.mean(returns)) / float(np.std(returns)) * np.sqrt(252)) if np.std(returns) > 0 else 0
        else:
            sharpe = 0

        return {
            'strategy': self.strategy,
            'initial_capital': self.initial_capital,
            'final_capital': round(cash, 2),
            'strategy_return_pct': round(strategy_return, 2),
            'buy_hold_return_pct': round(bh_return, 2),
            'outperformance_pct': round(strategy_return - bh_return, 2),
            'num_trades': len(sells),
            'win_rate_pct': round(win_rate, 2),
            'avg_win_pct': round(avg_win, 2),
            'avg_loss_pct': round(avg_loss, 2),
            'max_drawdown_pct': round(max_dd, 2),
            'sharpe_ratio': round(sharpe, 2),
            'trades': trades,
        }
