from pydantic import BaseModel


class OHLCV(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


class MarketData(BaseModel):
    symbol: str
    prices: list[OHLCV] = []
    error: str | None = None


class IndicatorDetail(BaseModel):
    ma: float = 50.0
    rsi: float = 50.0
    macd: float = 50.0
    bollinger: float = 50.0
    volume: float = 50.0
    stochastic: float = 50.0
    pivot: float = 50.0


class AnalysisResult(BaseModel):
    symbol: str
    asset_type: str
    score: float
    signal: str
    indicators: IndicatorDetail
    current_price: float = 0
    change_pct: float = 0
    details: str | None = None


class Alert(BaseModel):
    symbol: str
    asset_type: str
    signal: str
    score: float
    price: float = 0
    indicators: IndicatorDetail | None = None
    timestamp: str = ""


class RecommendationResponse(BaseModel):
    recommendations: list[AnalysisResult] = []
    alerts: list[Alert] = []
    last_updated: str = ""
