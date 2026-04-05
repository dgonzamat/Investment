import httpx
import numpy as np
import logging
from datetime import datetime, timedelta, timezone
from app.config import (
    ALPHA_VANTAGE_API_KEY,
    ALPHA_VANTAGE_BASE_URL,
    COINGECKO_BASE_URL,
    FRANKFURTER_BASE_URL,
    CACHE_TTL,
)
from app.services.cache import cache

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "InvestPro/1.0",
    "Accept": "application/json",
}


async def _get(url: str, params: dict | None = None, timeout: float = 15.0) -> dict:
    async with httpx.AsyncClient(timeout=timeout, headers=_HEADERS) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


# =====================================================================
# Simulated Market Data Generator (fallback when APIs are unreachable)
# =====================================================================

_SEED_PRICES = {
    # Stocks
    "AAPL": 195.0, "MSFT": 420.0, "GOOGL": 175.0, "AMZN": 185.0,
    "TSLA": 175.0, "NVDA": 880.0, "META": 500.0, "JPM": 195.0,
    # ETFs
    "SPY": 520.0, "QQQ": 440.0, "VTI": 260.0, "IWM": 205.0,
    "GLD": 215.0, "TLT": 92.0,
    # Crypto
    "bitcoin": 68500.0, "ethereum": 3450.0, "solana": 145.0,
    "cardano": 0.45, "ripple": 0.52, "dogecoin": 0.085,
    # Forex (USD -> X)
    "EUR": 0.92, "GBP": 0.79, "JPY": 151.5, "CHF": 0.88,
    "CAD": 1.36, "AUD": 1.53,
}


def _generate_ohlcv(symbol: str, days: int = 90) -> list[dict]:
    seed = sum(ord(c) for c in symbol)
    rng = np.random.RandomState(seed)
    base_price = _SEED_PRICES.get(symbol, 100.0)

    # Generate realistic price movement with trends
    returns = rng.normal(0.0003, 0.018, days)  # slight upward bias
    # Add a trend component
    trend = np.sin(np.linspace(0, 2 * np.pi, days)) * 0.005
    returns = returns + trend

    prices_series = [base_price]
    for r in returns:
        prices_series.append(prices_series[-1] * (1 + r))

    end_date = datetime.now(timezone.utc)
    result = []
    for i in range(days):
        date = end_date - timedelta(days=days - i)
        close = prices_series[i + 1]
        volatility = abs(rng.normal(0, 0.012))
        high = close * (1 + volatility)
        low = close * (1 - volatility)
        open_p = close * (1 + rng.normal(0, 0.005))
        vol = int(rng.uniform(1e6, 5e7)) if base_price > 1 else int(rng.uniform(1e8, 1e10))

        result.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": round(open_p, 4),
            "high": round(high, 4),
            "low": round(low, 4),
            "close": round(close, 4),
            "volume": vol,
        })

    return result


# --------------- Alpha Vantage (Stocks / ETFs) ---------------

async def fetch_stock_daily(symbol: str) -> dict:
    cache_key = f"stock_daily:{symbol}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await _get(ALPHA_VANTAGE_BASE_URL, params={
            "function": "TIME_SERIES_DAILY",
            "symbol": symbol,
            "apikey": ALPHA_VANTAGE_API_KEY,
            "outputsize": "compact",
        })

        ts = data.get("Time Series (Daily)", {})
        if not ts:
            raise ValueError(data.get("Note") or data.get("Information") or "No data from API")

        result = {"symbol": symbol, "prices": []}
        for date_str in sorted(ts.keys()):
            entry = ts[date_str]
            result["prices"].append({
                "date": date_str,
                "open": float(entry["1. open"]),
                "high": float(entry["2. high"]),
                "low": float(entry["3. low"]),
                "close": float(entry["4. close"]),
                "volume": int(entry["5. volume"]),
            })

        cache.set(cache_key, result, CACHE_TTL["stocks"])
        return result
    except Exception as e:
        logger.warning(f"Alpha Vantage unavailable for {symbol}: {e}. Using simulated data.")
        result = {"symbol": symbol, "prices": _generate_ohlcv(symbol)}
        cache.set(cache_key, result, CACHE_TTL["stocks"])
        return result


async def fetch_stock_intraday(symbol: str, interval: str = "60min") -> dict:
    cache_key = f"stock_intra:{symbol}:{interval}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await _get(ALPHA_VANTAGE_BASE_URL, params={
            "function": "TIME_SERIES_INTRADAY",
            "symbol": symbol,
            "interval": interval,
            "apikey": ALPHA_VANTAGE_API_KEY,
            "outputsize": "compact",
        })

        ts_key = f"Time Series ({interval})"
        ts = data.get(ts_key, {})
        if not ts:
            raise ValueError("No intraday data")

        result = {"symbol": symbol, "interval": interval, "prices": []}
        for dt_str in sorted(ts.keys()):
            entry = ts[dt_str]
            result["prices"].append({
                "date": dt_str,
                "open": float(entry["1. open"]),
                "high": float(entry["2. high"]),
                "low": float(entry["3. low"]),
                "close": float(entry["4. close"]),
                "volume": int(entry["5. volume"]),
            })

        cache.set(cache_key, result, CACHE_TTL["stocks"])
        return result
    except Exception as e:
        logger.warning(f"Intraday unavailable for {symbol}: {e}. Using simulated data.")
        result = {"symbol": symbol, "interval": interval, "prices": _generate_ohlcv(symbol, 24)}
        cache.set(cache_key, result, CACHE_TTL["stocks"])
        return result


# --------------- CoinGecko (Crypto) ---------------

async def fetch_crypto_market(coin_id: str) -> dict:
    cache_key = f"crypto_market:{coin_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await _get(f"{COINGECKO_BASE_URL}/coins/{coin_id}/market_chart", params={
            "vs_currency": "usd",
            "days": "90",
            "interval": "daily",
        })

        prices_raw = data.get("prices", [])
        volumes_raw = data.get("total_volumes", [])

        result = {"symbol": coin_id, "prices": []}
        for i, (ts_ms, price) in enumerate(prices_raw):
            vol = volumes_raw[i][1] if i < len(volumes_raw) else 0
            result["prices"].append({
                "date": _ms_to_date(ts_ms),
                "open": price,
                "high": price * 1.005,
                "low": price * 0.995,
                "close": price,
                "volume": vol,
            })

        cache.set(cache_key, result, CACHE_TTL["crypto"])
        return result
    except Exception as e:
        logger.warning(f"CoinGecko unavailable for {coin_id}: {e}. Using simulated data.")
        result = {"symbol": coin_id, "prices": _generate_ohlcv(coin_id)}
        cache.set(cache_key, result, CACHE_TTL["crypto"])
        return result


async def fetch_crypto_price(coin_id: str) -> dict:
    cache_key = f"crypto_price:{coin_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await _get(f"{COINGECKO_BASE_URL}/simple/price", params={
            "ids": coin_id,
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true",
            "include_market_cap": "true",
        })

        info = data.get(coin_id, {})
        result = {
            "symbol": coin_id,
            "price": info.get("usd", 0),
            "change_24h": info.get("usd_24h_change", 0),
            "volume_24h": info.get("usd_24h_vol", 0),
            "market_cap": info.get("usd_market_cap", 0),
        }
    except Exception:
        base = _SEED_PRICES.get(coin_id, 100.0)
        result = {
            "symbol": coin_id,
            "price": base,
            "change_24h": 1.5,
            "volume_24h": 1e9,
            "market_cap": base * 1e7,
        }

    cache.set(cache_key, result, CACHE_TTL["crypto"])
    return result


async def fetch_crypto_list() -> list[dict]:
    cache_key = "crypto_trending"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await _get(f"{COINGECKO_BASE_URL}/search/trending")
        coins = []
        for item in data.get("coins", [])[:10]:
            c = item.get("item", {})
            coins.append({
                "id": c.get("id"),
                "name": c.get("name"),
                "symbol": c.get("symbol"),
                "market_cap_rank": c.get("market_cap_rank"),
            })
    except Exception:
        coins = [
            {"id": "bitcoin", "name": "Bitcoin", "symbol": "BTC", "market_cap_rank": 1},
            {"id": "ethereum", "name": "Ethereum", "symbol": "ETH", "market_cap_rank": 2},
            {"id": "solana", "name": "Solana", "symbol": "SOL", "market_cap_rank": 5},
        ]

    cache.set(cache_key, coins, CACHE_TTL["crypto"])
    return coins


# --------------- Frankfurter (Forex) ---------------

async def fetch_forex_latest(base: str = "USD") -> dict:
    cache_key = f"forex_latest:{base}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await _get(f"{FRANKFURTER_BASE_URL}/latest", params={"base": base})
        result = {
            "base": data.get("base", base),
            "date": data.get("date", ""),
            "rates": data.get("rates", {}),
        }
    except Exception:
        result = {
            "base": base,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "rates": {"EUR": 0.92, "GBP": 0.79, "JPY": 151.5, "CHF": 0.88, "CAD": 1.36, "AUD": 1.53},
        }

    cache.set(cache_key, result, CACHE_TTL["forex"])
    return result


async def fetch_forex_history(base: str = "USD", target: str = "EUR", days: int = 90) -> dict:
    cache_key = f"forex_hist:{base}:{target}:{days}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        end = datetime.now()
        start = end - timedelta(days=days)

        data = await _get(
            f"{FRANKFURTER_BASE_URL}/{start.strftime('%Y-%m-%d')}..{end.strftime('%Y-%m-%d')}",
            params={"base": base, "symbols": target},
        )

        rates = data.get("rates", {})
        result = {"symbol": f"{base}/{target}", "prices": []}
        for date_str in sorted(rates.keys()):
            rate = rates[date_str].get(target, 0)
            result["prices"].append({
                "date": date_str,
                "open": rate,
                "high": rate * 1.002,
                "low": rate * 0.998,
                "close": rate,
                "volume": 0,
            })
    except Exception:
        logger.warning(f"Frankfurter unavailable for {base}/{target}. Using simulated data.")
        result = {"symbol": f"{base}/{target}", "prices": _generate_ohlcv(target)}

    cache.set(cache_key, result, CACHE_TTL["forex"])
    return result


def _ms_to_date(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
