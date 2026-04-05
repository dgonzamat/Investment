import numpy as np
from datetime import datetime, timezone
from app.config import INDICATOR_WEIGHTS, SIGNAL_THRESHOLDS
from app.services.technical_analysis import (
    calculate_ema,
    calculate_sma,
    calculate_rsi,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_stochastic,
    calculate_pivot_points,
    calculate_volume_signal,
    calculate_atr,
    calculate_adx,
    detect_divergence,
)


def _safe(lst: list, idx: int, default: float = 50.0) -> float:
    try:
        v = lst[idx]
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return default
        return float(v)
    except (IndexError, TypeError):
        return default


def _ma_score(prices: list[float]) -> float:
    if len(prices) < 26:
        return 50.0

    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    score = 0.0

    # EMA(12) > EMA(26) -> bullish
    if _safe(ema12, -1) > _safe(ema26, -1):
        score += 50.0

    # Price > SMA(50)
    if len(prices) >= 50:
        sma50 = calculate_sma(prices, 50)
        if prices[-1] > _safe(sma50, -1, prices[-1]):
            score += 25.0

        # SMA(50) > SMA(200)
        if len(prices) >= 200:
            sma200 = calculate_sma(prices, 200)
            if _safe(sma50, -1) > _safe(sma200, -1):
                score += 25.0
        else:
            score += 12.5
    else:
        score += 12.5

    return score


def _rsi_score(prices: list[float]) -> float:
    rsi = calculate_rsi(prices)
    current = _safe(rsi, -1, 50.0)

    if current < 30:
        return 80.0
    elif current < 40:
        return 65.0
    elif current <= 60:
        return 50.0
    elif current <= 70:
        return 35.0
    else:
        return 20.0


def _macd_score(prices: list[float]) -> float:
    macd = calculate_macd(prices)
    ml = _safe(macd["macd_line"], -1, 0)
    sl = _safe(macd["signal_line"], -1, 0)
    hist = macd["histogram"]

    score = 0.0
    if ml > sl:
        score += 33.0
    if ml > 0:
        score += 33.0
    if len(hist) >= 2 and _safe(hist, -1, 0) > _safe(hist, -2, 0):
        score += 34.0

    return score


def _bb_score(prices: list[float]) -> float:
    bb = calculate_bollinger_bands(prices)
    upper = _safe(bb["upper"], -1)
    lower = _safe(bb["lower"], -1)
    mid = _safe(bb["middle"], -1)
    price = prices[-1] if prices else 50.0

    if upper == lower:
        return 50.0

    pct_b = (price - lower) / (upper - lower)

    if pct_b <= 0.2:
        return 75.0
    elif pct_b <= 0.4:
        return 62.0
    elif pct_b <= 0.6:
        return 50.0
    elif pct_b <= 0.8:
        return 38.0
    else:
        return 25.0


def _stochastic_score(highs: list[float], lows: list[float], closes: list[float]) -> float:
    stoch = calculate_stochastic(highs, lows, closes)
    k = _safe(stoch["k"], -1, 50.0)
    d = _safe(stoch["d"], -1, 50.0)
    k_prev = _safe(stoch["k"], -2, 50.0)
    d_prev = _safe(stoch["d"], -2, 50.0)

    if k < 20:
        score = 80.0
    elif k > 80:
        score = 20.0
    else:
        score = 50.0

    # Crossover bonus
    if k_prev <= d_prev and k > d:
        score = min(score + 15.0, 100.0)
    elif k_prev >= d_prev and k < d:
        score = max(score - 15.0, 0.0)

    return score


def _pivot_score(high: float, low: float, close: float, current_price: float) -> float:
    pivots = calculate_pivot_points(high, low, close)

    if current_price > pivots["r1"]:
        return 30.0  # Above resistance -> overbought
    elif current_price < pivots["s1"]:
        return 70.0  # Below support -> oversold bounce expected
    else:
        # Between S1 and R1 - neutral
        range_total = pivots["r1"] - pivots["s1"]
        if range_total == 0:
            return 50.0
        position = (current_price - pivots["s1"]) / range_total
        return 70.0 - position * 40.0


def generate_composite_score(ohlcv_data: list[dict]) -> dict:
    if not ohlcv_data or len(ohlcv_data) < 5:
        return {
            "score": 50.0,
            "signal": "NEUTRAL",
            "indicators": {},
            "details": "Insufficient data",
        }

    closes = [d["close"] for d in ohlcv_data]
    highs = [d["high"] for d in ohlcv_data]
    lows = [d["low"] for d in ohlcv_data]
    volumes = [d.get("volume", 0) for d in ohlcv_data]

    ma = _ma_score(closes)
    rsi = _rsi_score(closes)
    macd = _macd_score(closes)
    bb = _bb_score(closes)
    vol = calculate_volume_signal(volumes, closes)
    stoch = _stochastic_score(highs, lows, closes)

    last = ohlcv_data[-1]
    pivot = _pivot_score(last["high"], last["low"], last["close"], closes[-1])

    # New indicators
    rsi_values = calculate_rsi(closes)
    div = detect_divergence(closes, rsi_values)
    div_score = 50.0
    if div["type"] == "bullish":
        div_score = 50.0 + div["strength"] * 35
    elif div["type"] == "bearish":
        div_score = 50.0 - div["strength"] * 35

    adx_data = calculate_adx(highs, lows, closes)
    adx_val = _safe(adx_data["adx"], -1, 25.0)
    pdi = _safe(adx_data["pdi"], -1, 50.0)
    ndi = _safe(adx_data["ndi"], -1, 50.0)
    trend_score = 50.0
    if adx_val > 25 and pdi > ndi:
        trend_score = 50.0 + min((adx_val - 25) * 1.5, 30)
    elif adx_val > 25 and ndi > pdi:
        trend_score = 50.0 - min((adx_val - 25) * 1.5, 30)

    w = INDICATOR_WEIGHTS
    composite = (
        ma * w["ma"]
        + macd * w["macd"]
        + rsi * w["rsi"]
        + bb * w["bb"]
        + vol * w["volume"]
        + stoch * w["stochastic"]
        + pivot * w["pivot"]
    )

    # Trend strength adjustment
    if adx_val >= 50:
        multiplier = 1.3
    elif adx_val >= 35:
        multiplier = 1.15
    elif adx_val >= 25:
        multiplier = 1.0
    else:
        multiplier = 0.85
    deviation = composite - 50.0
    composite = 50.0 + deviation * multiplier

    composite = max(0.0, min(100.0, composite))

    indicators_dict = {
        "ma": round(ma, 1),
        "rsi": round(rsi, 1),
        "macd": round(macd, 1),
        "bollinger": round(bb, 1),
        "volume": round(vol, 1),
        "stochastic": round(stoch, 1),
        "pivot": round(pivot, 1),
        "divergence": round(div_score, 1),
        "trend": round(trend_score, 1),
    }

    # Confluence bonus
    bullish_count = sum(1 for v in indicators_dict.values() if v >= 60)
    bearish_count = sum(1 for v in indicators_dict.values() if v <= 40)
    if bullish_count >= 6:
        composite = min(composite + 5, 100.0)
    if bearish_count >= 6:
        composite = max(composite - 5, 0.0)

    return {
        "score": round(composite, 1),
        "signal": classify_signal(composite),
        "indicators": indicators_dict,
        "meta": {
            "adx": round(adx_val, 1),
            "trend_strength": "Strong" if adx_val >= 35 else "Moderate" if adx_val >= 25 else "Weak",
            "divergence": div["type"],
            "confluence_bull": bullish_count,
            "confluence_bear": bearish_count,
        },
        "details": None,
    }


def classify_signal(score: float) -> str:
    t = SIGNAL_THRESHOLDS
    if score >= t["strong_buy"]:
        return "STRONG_BUY"
    elif score >= t["buy"]:
        return "BUY"
    elif score >= t["weak_buy"]:
        return "WEAK_BUY"
    elif score >= t["neutral_low"]:
        return "NEUTRAL"
    elif score >= t["weak_sell"]:
        return "WEAK_SELL"
    elif score >= t["sell"]:
        return "SELL"
    else:
        return "STRONG_SELL"


def generate_alert(symbol: str, asset_type: str, score_data: dict, price: float = 0) -> dict | None:
    signal = score_data["signal"]
    if signal in ("NEUTRAL", "WEAK_BUY", "WEAK_SELL"):
        return None

    return {
        "symbol": symbol,
        "asset_type": asset_type,
        "signal": signal,
        "score": score_data["score"],
        "price": price,
        "indicators": score_data["indicators"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
