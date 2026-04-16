# FastAPI (Python 3.12) — Tech KB

**Version pinning**: `fastapi@0.115.x`, `pydantic@2.9.x` / `2.10.x`, `uvicorn[standard]@0.32.x`, `starlette@>=0.40,<1.0`. Python `>=3.12,<3.13`.

## 1. API surface overview

- App entry: `FastAPI()` — decorated route functions
- Async endpoints: `async def` — use with async DB drivers
- `pydantic.BaseModel` for request/response schemas (pydantic v2 with Rust core)
- `Depends(...)` for dependency injection
- `BackgroundTasks` for fire-and-forget
- Auto OpenAPI at `/docs` (Swagger) and `/redoc`
- `HTTPException`, `Request`, `Response`, `status`
- Middleware via `app.add_middleware(...)`
- Lifespan via `@asynccontextmanager` on `lifespan` param

## 2. Code examples

### Example 1 — App scaffold with lifespan + CORS

```python
# backend/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from .routers import markets, strategies, backtests

engine = create_async_engine("sqlite+aiosqlite:///./local.db", echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    yield
    # shutdown
    await engine.dispose()

app = FastAPI(title="Prediction Markets API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets.router,    prefix="/api/markets",    tags=["markets"])
app.include_router(strategies.router, prefix="/api/strategies", tags=["strategies"])
app.include_router(backtests.router,  prefix="/api/backtests",  tags=["backtests"])
```

### Example 2 — Pydantic v2 models

```python
# backend/app/schemas/market.py
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from datetime import datetime

Platform = Literal["kalshi", "polymarket", "manifold", "predictit"]

class MarketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # enables ORM mode

    id: str
    platform: Platform
    title: str
    yes_price: float = Field(ge=0, le=1)
    no_price:  float = Field(ge=0, le=1)
    volume_24h: float = Field(ge=0)
    closes_at: datetime | None

class CreateBacktestIn(BaseModel):
    strategy_id: str
    params: dict[str, float | int | str]
    start: datetime
    end: datetime
    bankroll: float = Field(default=10_000, gt=0)
```

### Example 3 — Async endpoint with DI

```python
# backend/app/routers/markets.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db import get_session
from ..models import Market
from ..schemas.market import MarketOut, Platform

router = APIRouter()

@router.get("", response_model=list[MarketOut])
async def list_markets(
    platform: Platform | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> list[Market]:
    stmt = select(Market).limit(limit)
    if platform:
        stmt = stmt.where(Market.platform == platform)
    result = await session.execute(stmt)
    return list(result.scalars().all())

@router.get("/{market_id}", response_model=MarketOut)
async def get_market(market_id: str, session: AsyncSession = Depends(get_session)) -> Market:
    m = await session.get(Market, market_id)
    if m is None:
        raise HTTPException(status_code=404, detail="market not found")
    return m
```

### Example 4 — DB dependency

```python
# backend/app/db.py
from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession
from .main import SessionLocal  # or a shared `session.py` module

async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
```

### Example 5 — Background task (fire backtest)

```python
# backend/app/routers/backtests.py
from fastapi import APIRouter, BackgroundTasks, Depends
from uuid import uuid4

from ..schemas.market import CreateBacktestIn
from ..services.backtest_runner import run_backtest

router = APIRouter()

@router.post("", status_code=202)
async def start_backtest(payload: CreateBacktestIn, bg: BackgroundTasks):
    job_id = str(uuid4())
    bg.add_task(run_backtest, job_id, payload.model_dump())
    return {"job_id": job_id, "status": "queued"}
```

### Example 6 — Websocket endpoint for live ticks

```python
# backend/app/routers/stream.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
router = APIRouter()

@router.websocket("/stream/{market_id}")
async def stream_market(ws: WebSocket, market_id: str):
    await ws.accept()
    try:
        while True:
            tick = await next_tick(market_id)  # implement in adapter layer
            await ws.send_json(tick)
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return

async def next_tick(market_id: str):
    return {"ts": 0, "yes": 0.5, "no": 0.5}
```

### Example 7 — Custom exception handler

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class AdapterError(Exception):
    def __init__(self, platform: str, detail: str):
        self.platform = platform
        self.detail = detail

@app.exception_handler(AdapterError)
async def adapter_error_handler(req: Request, exc: AdapterError):
    return JSONResponse(status_code=502, content={"platform": exc.platform, "detail": exc.detail})
```

## 3. Gotchas / pitfalls

- **Blocking calls inside `async def`** freeze the event loop. Wrap CPU-bound work (pandas, numpy) in `await asyncio.to_thread(...)` or use `def` endpoint (FastAPI runs sync endpoints in a thread pool).
- **Pydantic v2 is NOT pydantic v1** — `.dict()` → `.model_dump()`, `.parse_obj()` → `.model_validate()`, `Config` class → `model_config = ConfigDict(...)`.
- **`from_attributes=True`** replaces v1's `orm_mode = True`.
- **Default `exclude_unset` in v2** — call `.model_dump(exclude_unset=True)` for PATCH semantics.
- **DI with yield**: use `Depends(get_session)` with `AsyncIterator` only; don't wrap in `@asynccontextmanager`.
- **CORS middleware order**: must be added *before* routers that return errors, else responses miss the CORS headers.
- **`response_model`** filters output — if you forget it, you leak DB fields. Pair with `ConfigDict(from_attributes=True)`.
- **`BackgroundTasks` runs in the same worker after response** — not durable. Use Celery/RQ/APScheduler for real queues.
- **Windows**: use `uvicorn` with `--reload` for dev only; don't ship with reload.

## 4. Testing hooks

Use `httpx.AsyncClient` with `ASGITransport` (starlette's `TestClient` is sync and has edge cases with lifespan):

```python
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

@pytest.mark.asyncio
async def test_list_markets():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/markets?limit=10")
    assert r.status_code == 200
```

## 5. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| fastapi | ^0.115 | pydantic v2 only |
| pydantic | ^2.9 | pair with fastapi |
| uvicorn[standard] | ^0.32 | includes uvloop on unix, websockets |
| starlette | >=0.40,<1 | peer |
| python | 3.12.x | declared |
| httpx | ^0.27 | for tests |
