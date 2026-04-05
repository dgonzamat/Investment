from fastapi import APIRouter, HTTPException
from app.services.data_fetcher import (
    fetch_stock_daily,
    fetch_stock_intraday,
    fetch_crypto_market,
    fetch_crypto_price,
    fetch_forex_history,
    fetch_forex_latest,
)

router = APIRouter(prefix="/api/market-data", tags=["market-data"])


@router.get("/{asset_type}/{symbol}")
async def get_market_data(asset_type: str, symbol: str):
    try:
        if asset_type in ("stocks", "etfs"):
            data = await fetch_stock_daily(symbol.upper())
        elif asset_type == "crypto":
            data = await fetch_crypto_market(symbol.lower())
        elif asset_type == "forex":
            data = await fetch_forex_history("USD", symbol.upper())
        else:
            raise HTTPException(400, f"Unknown asset type: {asset_type}")

        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/stocks/{symbol}/intraday")
async def get_stock_intraday(symbol: str, interval: str = "60min"):
    try:
        return await fetch_stock_intraday(symbol.upper(), interval)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/crypto/{symbol}/price")
async def get_crypto_current_price(symbol: str):
    try:
        return await fetch_crypto_price(symbol.lower())
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/forex/latest")
async def get_forex_latest(base: str = "USD"):
    try:
        return await fetch_forex_latest(base.upper())
    except Exception as e:
        raise HTTPException(500, str(e))
