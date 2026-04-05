import math
import numpy as np
import pytest
from app.services.technical_analysis import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_stochastic,
    calculate_pivot_points,
    calculate_volume_signal,
)


# ===== SMA Tests =====

class TestSMA:
    def test_basic_sma(self):
        prices = [10.0, 20.0, 30.0, 40.0, 50.0]
        result = calculate_sma(prices, 3)
        assert len(result) == 5
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert abs(result[2] - 20.0) < 0.01
        assert abs(result[3] - 30.0) < 0.01
        assert abs(result[4] - 40.0) < 0.01

    def test_sma_period_equals_length(self):
        prices = [10.0, 20.0, 30.0]
        result = calculate_sma(prices, 3)
        assert abs(result[-1] - 20.0) < 0.01

    def test_sma_insufficient_data(self):
        prices = [10.0, 20.0]
        result = calculate_sma(prices, 5)
        assert len(result) == 2

    def test_sma_constant_prices(self):
        prices = [50.0] * 20
        result = calculate_sma(prices, 10)
        for v in result:
            if not math.isnan(v):
                assert abs(v - 50.0) < 0.01


# ===== EMA Tests =====

class TestEMA:
    def test_ema_first_value(self):
        prices = [10.0, 20.0, 30.0, 40.0]
        result = calculate_ema(prices, 3)
        assert result[0] == 10.0

    def test_ema_trending_up(self):
        prices = list(range(1, 21))
        result = calculate_ema([float(p) for p in prices], 5)
        # EMA should follow trend, last value close to recent prices
        assert result[-1] > result[0]
        assert result[-1] > 15.0

    def test_ema_empty(self):
        assert calculate_ema([], 5) == []

    def test_ema_single_value(self):
        result = calculate_ema([42.0], 10)
        assert result == [42.0]


# ===== RSI Tests =====

class TestRSI:
    def test_rsi_overbought(self):
        # Strongly rising prices -> RSI should be high
        prices = [float(i) for i in range(100)]
        rsi = calculate_rsi(prices)
        assert rsi[-1] > 70

    def test_rsi_oversold(self):
        # Strongly falling prices -> RSI should be low
        prices = [float(100 - i) for i in range(100)]
        rsi = calculate_rsi(prices)
        assert rsi[-1] < 30

    def test_rsi_range(self):
        np.random.seed(42)
        prices = np.cumsum(np.random.randn(100)) + 100
        rsi = calculate_rsi(prices.tolist())
        for v in rsi:
            if not math.isnan(v):
                assert 0 <= v <= 100

    def test_rsi_insufficient_data(self):
        prices = [10.0, 11.0, 12.0]
        result = calculate_rsi(prices, 14)
        assert all(v == 50.0 for v in result)

    def test_rsi_flat_prices(self):
        prices = [50.0] * 30
        rsi = calculate_rsi(prices)
        # No gains or losses -> RSI should be 100 (avg_loss=0)
        # or handle gracefully
        for v in rsi:
            if not math.isnan(v):
                assert 0 <= v <= 100


# ===== MACD Tests =====

class TestMACD:
    def test_macd_structure(self):
        prices = [float(i) for i in range(50)]
        result = calculate_macd(prices)
        assert "macd_line" in result
        assert "signal_line" in result
        assert "histogram" in result
        assert len(result["macd_line"]) == 50

    def test_macd_uptrend_positive(self):
        prices = [float(i * 2) for i in range(60)]
        result = calculate_macd(prices)
        # In uptrend, fast EMA > slow EMA, so MACD line should be positive
        assert result["macd_line"][-1] > 0

    def test_macd_downtrend_negative(self):
        prices = [float(100 - i * 2) for i in range(60)]
        result = calculate_macd(prices)
        assert result["macd_line"][-1] < 0


# ===== Bollinger Bands Tests =====

class TestBollingerBands:
    def test_bb_structure(self):
        prices = [float(50 + i % 10) for i in range(30)]
        result = calculate_bollinger_bands(prices)
        assert "upper" in result
        assert "middle" in result
        assert "lower" in result

    def test_bb_ordering(self):
        np.random.seed(42)
        prices = (np.random.randn(50) * 5 + 100).tolist()
        result = calculate_bollinger_bands(prices)
        for i in range(19, len(prices)):
            assert result["lower"][i] <= result["middle"][i] <= result["upper"][i]

    def test_bb_constant_prices(self):
        prices = [100.0] * 30
        result = calculate_bollinger_bands(prices)
        # With zero std dev, bands should collapse
        for i in range(19, 30):
            assert abs(result["upper"][i] - 100.0) < 0.01
            assert abs(result["lower"][i] - 100.0) < 0.01

    def test_bb_insufficient_data(self):
        prices = [10.0, 20.0, 30.0]
        result = calculate_bollinger_bands(prices)
        assert len(result["upper"]) == 3


# ===== Stochastic Tests =====

class TestStochastic:
    def test_stochastic_range(self):
        np.random.seed(42)
        n = 50
        closes = (np.random.randn(n) * 5 + 100).tolist()
        highs = [c + abs(np.random.randn()) for c in closes]
        lows = [c - abs(np.random.randn()) for c in closes]
        result = calculate_stochastic(highs, lows, closes)
        for k in result["k"]:
            assert 0 <= k <= 100
        for d in result["d"]:
            assert 0 <= d <= 100

    def test_stochastic_overbought(self):
        # Price at top of range -> %K near 100
        highs = [100.0 + i for i in range(20)]
        lows = [90.0 + i for i in range(20)]
        closes = [99.5 + i for i in range(20)]  # Close near high
        result = calculate_stochastic(highs, lows, closes)
        assert result["k"][-1] > 80


# ===== Pivot Points Tests =====

class TestPivotPoints:
    def test_pivot_calculation(self):
        result = calculate_pivot_points(high=110, low=90, close=100)
        assert abs(result["pivot"] - 100.0) < 0.01
        assert abs(result["r1"] - 110.0) < 0.01
        assert abs(result["s1"] - 90.0) < 0.01
        assert abs(result["r2"] - 120.0) < 0.01
        assert abs(result["s2"] - 80.0) < 0.01

    def test_pivot_symmetry(self):
        result = calculate_pivot_points(high=105, low=95, close=100)
        # R1 - Pivot should equal Pivot - S1
        assert abs((result["r1"] - result["pivot"]) - (result["pivot"] - result["s1"])) < 0.01


# ===== Volume Signal Tests =====

class TestVolumeSignal:
    def test_volume_spike_bullish(self):
        volumes = [1000.0] * 25 + [3000.0]  # spike at end
        prices = [100.0] * 25 + [105.0]     # price up
        result = calculate_volume_signal(volumes, prices)
        assert result > 70

    def test_volume_spike_bearish(self):
        volumes = [1000.0] * 25 + [3000.0]  # spike at end
        prices = [100.0] * 25 + [95.0]      # price down
        result = calculate_volume_signal(volumes, prices)
        assert result < 30

    def test_volume_normal(self):
        volumes = [1000.0] * 25
        prices = [100.0] * 24 + [100.5]
        result = calculate_volume_signal(volumes, prices)
        assert 40 <= result <= 70

    def test_volume_insufficient_data(self):
        result = calculate_volume_signal([100], [50])
        assert result == 50.0
