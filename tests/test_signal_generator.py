import numpy as np
import pytest
from app.services.signal_generator import (
    generate_composite_score,
    classify_signal,
    generate_alert,
)


class TestClassifySignal:
    def test_strong_buy(self):
        assert classify_signal(85) == "STRONG_BUY"
        assert classify_signal(100) == "STRONG_BUY"

    def test_buy(self):
        assert classify_signal(70) == "BUY"

    def test_weak_buy(self):
        assert classify_signal(58) == "WEAK_BUY"

    def test_neutral(self):
        assert classify_signal(50) == "NEUTRAL"

    def test_weak_sell(self):
        assert classify_signal(40) == "WEAK_SELL"

    def test_sell(self):
        assert classify_signal(25) == "SELL"

    def test_strong_sell(self):
        assert classify_signal(10) == "STRONG_SELL"
        assert classify_signal(0) == "STRONG_SELL"

    def test_boundary_values(self):
        assert classify_signal(80) == "STRONG_BUY"
        assert classify_signal(65) == "BUY"
        assert classify_signal(55) == "WEAK_BUY"
        assert classify_signal(45) == "NEUTRAL"
        assert classify_signal(35) == "WEAK_SELL"
        assert classify_signal(20) == "SELL"
        assert classify_signal(19.9) == "STRONG_SELL"


class TestCompositeScore:
    def _make_uptrend(self, n=90):
        np.random.seed(42)
        base = 100.0
        data = []
        for i in range(n):
            close = base + i * 0.5 + np.random.randn() * 0.5
            data.append({
                "date": f"2026-01-{i+1:02d}",
                "open": close - 0.3,
                "high": close + 1.0,
                "low": close - 1.0,
                "close": close,
                "volume": int(1e6 + np.random.rand() * 1e5),
            })
        return data

    def _make_downtrend(self, n=90):
        np.random.seed(42)
        base = 200.0
        data = []
        for i in range(n):
            close = base - i * 1.0 + np.random.randn() * 0.3
            data.append({
                "date": f"2026-01-{i+1:02d}",
                "open": close + 0.3,
                "high": close + 1.0,
                "low": close - 1.0,
                "close": close,
                "volume": int(1e6 + np.random.rand() * 1e5),
            })
        return data

    def test_uptrend_bullish_score(self):
        data = self._make_uptrend()
        result = generate_composite_score(data)
        assert result["score"] > 50
        assert result["signal"] in ("WEAK_BUY", "BUY", "STRONG_BUY")

    def test_downtrend_bearish_score(self):
        data = self._make_downtrend()
        result = generate_composite_score(data)
        # In a strong downtrend, moving averages should be bearish.
        # Other indicators (RSI, Stochastic) may show oversold counter-signals.
        assert result["indicators"]["ma"] < 50
        # Overall score should be below strong buy territory
        assert result["score"] < 70

    def test_score_range(self):
        data = self._make_uptrend()
        result = generate_composite_score(data)
        assert 0 <= result["score"] <= 100

    def test_indicators_present(self):
        data = self._make_uptrend()
        result = generate_composite_score(data)
        indicators = result["indicators"]
        for key in ("ma", "rsi", "macd", "bollinger", "volume", "stochastic", "pivot"):
            assert key in indicators
            assert 0 <= indicators[key] <= 100

    def test_insufficient_data(self):
        data = [{"date": "2026-01-01", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000}]
        result = generate_composite_score(data)
        assert result["score"] == 50.0
        assert result["signal"] == "NEUTRAL"

    def test_empty_data(self):
        result = generate_composite_score([])
        assert result["score"] == 50.0


class TestGenerateAlert:
    def test_buy_alert(self):
        score_data = {"score": 85.0, "signal": "STRONG_BUY", "indicators": {}}
        alert = generate_alert("AAPL", "stocks", score_data, 195.0)
        assert alert is not None
        assert alert["signal"] == "STRONG_BUY"
        assert alert["symbol"] == "AAPL"

    def test_sell_alert(self):
        score_data = {"score": 15.0, "signal": "STRONG_SELL", "indicators": {}}
        alert = generate_alert("TSLA", "stocks", score_data, 175.0)
        assert alert is not None
        assert alert["signal"] == "STRONG_SELL"

    def test_neutral_no_alert(self):
        score_data = {"score": 50.0, "signal": "NEUTRAL", "indicators": {}}
        alert = generate_alert("MSFT", "stocks", score_data, 420.0)
        assert alert is None

    def test_weak_signals_no_alert(self):
        for signal in ("WEAK_BUY", "WEAK_SELL"):
            score_data = {"score": 55.0, "signal": signal, "indicators": {}}
            assert generate_alert("X", "stocks", score_data) is None
