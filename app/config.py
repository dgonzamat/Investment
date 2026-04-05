import os
from dotenv import load_dotenv

load_dotenv()

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "demo")
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"
COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
FRANKFURTER_BASE_URL = "https://api.frankfurter.dev"

CACHE_TTL = {
    "stocks": 300,
    "etfs": 300,
    "crypto": 120,
    "forex": 600,
}

INDICATOR_WEIGHTS = {
    "ma": 0.20,
    "macd": 0.20,
    "rsi": 0.15,
    "bb": 0.15,
    "volume": 0.15,
    "stochastic": 0.10,
    "pivot": 0.05,
}

SIGNAL_THRESHOLDS = {
    "strong_buy": 80,
    "buy": 65,
    "weak_buy": 55,
    "neutral_low": 45,
    "weak_sell": 35,
    "sell": 20,
}

DEFAULT_SYMBOLS = {
    "stocks": ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM"],
    "etfs": ["SPY", "QQQ", "VTI", "IWM", "GLD", "TLT"],
    "crypto": ["bitcoin", "ethereum", "solana", "cardano", "ripple", "dogecoin"],
    "forex": ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD"],
}
