import numpy as np


def calculate_sma(prices: list[float], period: int) -> list[float]:
    arr = np.array(prices, dtype=float)
    if len(arr) < period:
        return arr.tolist()
    kernel = np.ones(period) / period
    sma = np.convolve(arr, kernel, mode="valid")
    padding = [float("nan")] * (period - 1)
    return padding + sma.tolist()


def calculate_ema(prices: list[float], period: int) -> list[float]:
    arr = np.array(prices, dtype=float)
    if len(arr) == 0:
        return []
    alpha = 2.0 / (period + 1)
    ema = np.zeros_like(arr)
    ema[0] = arr[0]
    for i in range(1, len(arr)):
        ema[i] = alpha * arr[i] + (1 - alpha) * ema[i - 1]
    return ema.tolist()


def calculate_rsi(prices: list[float], period: int = 14) -> list[float]:
    arr = np.array(prices, dtype=float)
    if len(arr) < period + 1:
        return [50.0] * len(arr)

    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    rsi_values = [float("nan")] * period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rsi_values.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsi_values.append(100.0 - (100.0 / (1.0 + rs)))

    return rsi_values


def calculate_macd(
    prices: list[float],
    fast: int = 12,
    slow: int = 26,
    signal_period: int = 9,
) -> dict:
    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)

    macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
    signal_line = calculate_ema(macd_line, signal_period)
    histogram = [m - s for m, s in zip(macd_line, signal_line)]

    return {
        "macd_line": macd_line,
        "signal_line": signal_line,
        "histogram": histogram,
    }


def calculate_bollinger_bands(
    prices: list[float], period: int = 20, num_std: float = 2.0
) -> dict:
    arr = np.array(prices, dtype=float)
    if len(arr) < period:
        mid = arr.tolist()
        return {"upper": mid, "middle": mid, "lower": mid}

    sma = calculate_sma(prices, period)
    upper = []
    lower = []
    for i in range(len(arr)):
        if i < period - 1:
            upper.append(float("nan"))
            lower.append(float("nan"))
        else:
            window = arr[i - period + 1 : i + 1]
            std = float(np.std(window))
            upper.append(sma[i] + num_std * std)
            lower.append(sma[i] - num_std * std)

    return {"upper": upper, "middle": sma, "lower": lower}


def calculate_stochastic(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    k_period: int = 14,
    d_period: int = 3,
) -> dict:
    h = np.array(highs, dtype=float)
    l = np.array(lows, dtype=float)
    c = np.array(closes, dtype=float)
    n = len(c)

    k_values = []
    for i in range(n):
        if i < k_period - 1:
            k_values.append(50.0)
        else:
            hh = np.max(h[i - k_period + 1 : i + 1])
            ll = np.min(l[i - k_period + 1 : i + 1])
            if hh == ll:
                k_values.append(50.0)
            else:
                k_values.append(((c[i] - ll) / (hh - ll)) * 100.0)

    d_values = calculate_sma(k_values, d_period)
    # Replace NaN with 50
    d_values = [50.0 if (isinstance(v, float) and np.isnan(v)) else v for v in d_values]

    return {"k": k_values, "d": d_values}


def calculate_pivot_points(
    high: float, low: float, close: float
) -> dict:
    pivot = (high + low + close) / 3.0
    r1 = 2 * pivot - low
    s1 = 2 * pivot - high
    r2 = pivot + (high - low)
    s2 = pivot - (high - low)
    return {"pivot": pivot, "r1": r1, "s1": s1, "r2": r2, "s2": s2}


def calculate_atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> list[float]:
    if len(closes) < 2:
        return [0.0] * len(closes)
    tr = [highs[0] - lows[0]]
    for i in range(1, len(closes)):
        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))
    return calculate_ema(tr, period)


def calculate_adx(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> dict:
    n = len(closes)
    if n < period + 1:
        return {"adx": [25.0] * n, "pdi": [50.0] * n, "ndi": [50.0] * n}

    plus_dm = [0.0]
    minus_dm = [0.0]
    tr = [highs[0] - lows[0]]
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm.append(up if (up > down and up > 0) else 0.0)
        minus_dm.append(down if (down > up and down > 0) else 0.0)
        tr.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))

    smooth_tr = calculate_ema(tr, period)
    smooth_plus = calculate_ema(plus_dm, period)
    smooth_minus = calculate_ema(minus_dm, period)

    pdi = [(p / t * 100 if t > 0 else 0) for p, t in zip(smooth_plus, smooth_tr)]
    ndi = [(m / t * 100 if t > 0 else 0) for m, t in zip(smooth_minus, smooth_tr)]
    dx = [(abs(p - n_) / (p + n_) * 100 if (p + n_) > 0 else 0) for p, n_ in zip(pdi, ndi)]
    adx = calculate_ema(dx, period)

    return {"adx": adx, "pdi": pdi, "ndi": ndi}


def detect_divergence(
    prices: list[float], indicator: list[float], lookback: int = 20
) -> dict:
    n = len(prices)
    if n < lookback or len(indicator) < lookback:
        return {"type": "none", "strength": 0.0}

    p_slice = prices[-lookback:]
    i_slice = [v if (v is not None and not (isinstance(v, float) and np.isnan(v))) else 50.0 for v in indicator[-lookback:]]

    half = lookback // 2
    p_min1, i_at_min1 = min(range(half), key=lambda j: p_slice[j]), 0
    p_min1_val = p_slice[p_min1]
    i_at_min1 = i_slice[p_min1]
    p_min2, i_at_min2 = min(range(half, lookback), key=lambda j: p_slice[j]), 0
    p_min2_val = p_slice[p_min2]
    i_at_min2 = i_slice[p_min2]

    p_max1_idx = max(range(half), key=lambda j: p_slice[j])
    p_max2_idx = max(range(half, lookback), key=lambda j: p_slice[j])

    if p_min2_val < p_min1_val and i_at_min2 > i_at_min1:
        return {"type": "bullish", "strength": min((i_at_min2 - i_at_min1) / 10, 1.0)}
    if p_slice[p_max2_idx] > p_slice[p_max1_idx] and i_slice[p_max2_idx] < i_slice[p_max1_idx]:
        return {"type": "bearish", "strength": min((i_slice[p_max1_idx] - i_slice[p_max2_idx]) / 10, 1.0)}
    return {"type": "none", "strength": 0.0}


def calculate_volume_signal(
    volumes: list[float], prices: list[float], period: int = 20
) -> float:
    if len(volumes) < period + 1 or len(prices) < 2:
        return 50.0

    avg_vol = np.mean(volumes[-period - 1 : -1])
    current_vol = volumes[-1]
    price_change = prices[-1] - prices[-2]

    if avg_vol == 0:
        return 50.0

    vol_ratio = current_vol / avg_vol

    if vol_ratio > 1.5 and price_change > 0:
        return min(80.0 + (vol_ratio - 1.5) * 20, 100.0)
    elif vol_ratio > 1.5 and price_change < 0:
        return max(20.0 - (vol_ratio - 1.5) * 20, 0.0)
    elif price_change > 0:
        return 55.0 + min(vol_ratio * 10, 15.0)
    elif price_change < 0:
        return 45.0 - min(vol_ratio * 10, 15.0)
    else:
        return 50.0
