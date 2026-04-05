from fastapi import APIRouter, HTTPException
from app.services.data_fetcher import (
    fetch_stock_daily,
    fetch_crypto_market,
    fetch_forex_history,
)
from app.services.signal_generator import generate_composite_score

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/{asset_type}/{symbol}")
async def get_analysis(asset_type: str, symbol: str):
    try:
        if asset_type in ("stocks", "etfs"):
            data = await fetch_stock_daily(symbol.upper())
        elif asset_type == "crypto":
            data = await fetch_crypto_market(symbol.lower())
        elif asset_type == "forex":
            data = await fetch_forex_history("USD", symbol.upper())
        else:
            raise HTTPException(400, f"Unknown asset type: {asset_type}")

        prices = data.get("prices", [])
        if not prices:
            return {
                "symbol": data.get("symbol", symbol),
                "asset_type": asset_type,
                "score": 50.0,
                "signal": "NEUTRAL",
                "indicators": {},
                "current_price": 0,
                "change_pct": 0,
                "error": data.get("error", "No price data available"),
            }

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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
