from fastapi import APIRouter
from datetime import datetime, timezone
from app.config import DEFAULT_SYMBOLS
from app.services.data_fetcher import (
    fetch_stock_daily,
    fetch_crypto_market,
    fetch_forex_history,
)
from app.services.signal_generator import generate_composite_score, generate_alert

router = APIRouter(prefix="/api", tags=["recommendations"])


async def _analyze_symbol(symbol: str, asset_type: str) -> dict | None:
    try:
        if asset_type in ("stocks", "etfs"):
            data = await fetch_stock_daily(symbol)
        elif asset_type == "crypto":
            data = await fetch_crypto_market(symbol)
        elif asset_type == "forex":
            data = await fetch_forex_history("USD", symbol)
        else:
            return None

        prices = data.get("prices", [])
        if not prices:
            return None

        score_data = generate_composite_score(prices)
        current_price = prices[-1]["close"]
        prev_price = prices[-2]["close"] if len(prices) > 1 else current_price
        change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price else 0

        return {
            "symbol": data.get("symbol", symbol),
            "asset_type": asset_type,
            "score": score_data["score"],
            "signal": score_data["signal"],
            "indicators": score_data["indicators"],
            "current_price": round(current_price, 4),
            "change_pct": round(change_pct, 2),
        }
    except Exception:
        return None


@router.get("/recommendations")
async def get_recommendations(asset_type: str | None = None):
    results = []

    types_to_scan = [asset_type] if asset_type and asset_type in DEFAULT_SYMBOLS else DEFAULT_SYMBOLS.keys()

    for at in types_to_scan:
        for symbol in DEFAULT_SYMBOLS[at]:
            analysis = await _analyze_symbol(symbol, at)
            if analysis:
                results.append(analysis)

    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "recommendations": results,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/alerts")
async def get_alerts(asset_type: str | None = None):
    alerts = []

    types_to_scan = [asset_type] if asset_type and asset_type in DEFAULT_SYMBOLS else DEFAULT_SYMBOLS.keys()

    for at in types_to_scan:
        for symbol in DEFAULT_SYMBOLS[at]:
            analysis = await _analyze_symbol(symbol, at)
            if analysis:
                alert = generate_alert(
                    symbol=analysis["symbol"],
                    asset_type=at,
                    score_data=analysis,
                    price=analysis["current_price"],
                )
                if alert:
                    alerts.append(alert)

    alerts.sort(key=lambda x: abs(x["score"] - 50), reverse=True)

    return {
        "alerts": alerts,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }
