"""
Synthetic historical data generator with multiple market regimes.
Generates realistic OHLCV with known patterns for backtesting validation.
"""
import numpy as np
from datetime import datetime, timedelta


def generate_regime_data(
    name: str,
    days: int,
    start_price: float,
    regime: str,
    volatility: float = 0.02,
    seed: int = None,
) -> list[dict]:
    """
    Generate OHLCV data for a specific market regime.

    Regimes:
    - 'bull': Strong uptrend with pullbacks
    - 'bear': Strong downtrend with rallies
    - 'ranging': Sideways with mean reversion
    - 'crash': Sudden collapse then recovery
    - 'breakout': Long consolidation then breakout
    - 'mixed': Realistic mix of all regimes
    """
    if seed is not None:
        np.random.seed(seed)

    prices = [start_price]
    for i in range(days):
        if regime == 'bull':
            drift = 0.0012  # ~30%/year
            noise = np.random.normal(0, volatility)
        elif regime == 'bear':
            drift = -0.0012
            noise = np.random.normal(0, volatility)
        elif regime == 'ranging':
            # Mean reversion around start_price
            mean_reversion = (start_price - prices[-1]) / start_price * 0.05
            drift = mean_reversion
            noise = np.random.normal(0, volatility * 0.7)
        elif regime == 'crash':
            # Crash in middle 30% of period
            crash_start = days // 3
            crash_end = days // 2
            if crash_start <= i <= crash_end:
                drift = -0.025
                noise = np.random.normal(0, volatility * 2)
            elif i > crash_end:
                drift = 0.0015  # Recovery
                noise = np.random.normal(0, volatility)
            else:
                drift = 0.0008
                noise = np.random.normal(0, volatility * 0.8)
        elif regime == 'breakout':
            # Tight range then breakout at 60%
            if i < int(days * 0.6):
                drift = (start_price - prices[-1]) / start_price * 0.1
                noise = np.random.normal(0, volatility * 0.4)
            else:
                drift = 0.002
                noise = np.random.normal(0, volatility)
        elif regime == 'mixed':
            # Realistic: bull -> correction -> bull -> bear -> recovery
            phase = i / days
            if phase < 0.25:
                drift = 0.0015  # bull
            elif phase < 0.35:
                drift = -0.002  # correction
            elif phase < 0.55:
                drift = 0.0012  # bull again
            elif phase < 0.75:
                drift = -0.0015  # bear
            else:
                drift = 0.001  # recovery
            noise = np.random.normal(0, volatility)
        else:
            drift = 0.0
            noise = np.random.normal(0, volatility)

        new_price = prices[-1] * (1 + drift + noise)
        prices.append(max(new_price, 0.01))

    # Convert to OHLCV
    end_date = datetime.now()
    data = []
    for i in range(1, len(prices)):
        close = prices[i]
        prev_close = prices[i - 1]
        # Realistic intraday range
        intra_vol = abs(np.random.normal(0, volatility * 0.5))
        high = max(close, prev_close) * (1 + intra_vol)
        low = min(close, prev_close) * (1 - intra_vol)
        open_p = prev_close * (1 + np.random.normal(0, volatility * 0.3))
        # Volume correlated with absolute returns
        ret = abs(close - prev_close) / prev_close
        base_vol = 1e7
        volume = int(base_vol * (1 + ret * 50) * (1 + np.random.uniform(-0.3, 0.3)))

        date = end_date - timedelta(days=days - i)
        data.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": round(open_p, 4),
            "high": round(high, 4),
            "low": round(low, 4),
            "close": round(close, 4),
            "volume": volume,
        })

    return data
