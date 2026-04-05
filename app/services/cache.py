import time
from typing import Any


class TTLCache:
    def __init__(self):
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        if key in self._store:
            expiry, value = self._store[key]
            if time.time() < expiry:
                return value
            del self._store[key]
        return None

    def set(self, key: str, value: Any, ttl: int = 300):
        self._store[key] = (time.time() + ttl, value)

    def clear(self):
        self._store.clear()


cache = TTLCache()
