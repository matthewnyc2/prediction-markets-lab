# SQLAlchemy 2.x — Tech KB

**Version pinning**: `sqlalchemy@2.0.x` (2.0.36+), `aiosqlite@0.20.x` (SQLite async driver), `asyncpg@0.29.x` (Postgres async, when upgraded). Use typed `Mapped[...]` style (DeclarativeBase).

## 1. API surface overview

- `DeclarativeBase` — subclass for model base
- `Mapped[T]`, `mapped_column(...)` — typed column declaration
- `relationship(...)` — relationships (with `Mapped[list[T]]` or `Mapped[T | None]`)
- `create_async_engine(...)` + `async_sessionmaker(...)`
- `select(...)`, `insert(...)`, `update(...)`, `delete(...)` — 2.0 unified query API
- `session.execute(stmt)` returns `Result`; `.scalars().all()`, `.scalar_one_or_none()`, `.scalar()`
- `selectinload`, `joinedload` — eager loading strategies
- Lazy loading in async **MUST** be eager or explicit — no implicit lazy in async

## 2. Code examples

### Example 1 — Engine + session factory

```python
# backend/app/db.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

DATABASE_URL = "sqlite+aiosqlite:///./local.db"
# Upgrade path: "postgresql+asyncpg://user:pass@localhost/predmkt"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    # For sqlite, check_same_thread is handled by aiosqlite
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
```

### Example 2 — Declarative models

```python
# backend/app/models.py
from __future__ import annotations
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Market(Base):
    __tablename__ = "markets"

    id:         Mapped[str]      = mapped_column(String, primary_key=True)
    platform:   Mapped[str]      = mapped_column(String(20), index=True)
    title:      Mapped[str]      = mapped_column(String(500))
    yes_price:  Mapped[float]    = mapped_column(Float)
    no_price:   Mapped[float]    = mapped_column(Float)
    volume_24h: Mapped[float]    = mapped_column(Float, default=0.0)
    closes_at:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ticks: Mapped[list["PriceTick"]] = relationship(back_populates="market", cascade="all, delete-orphan")

class PriceTick(Base):
    __tablename__ = "price_ticks"

    id:        Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    market_id: Mapped[str]      = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), index=True)
    ts:        Mapped[datetime] = mapped_column(DateTime, index=True)
    yes:       Mapped[float]    = mapped_column(Float)
    no:        Mapped[float]    = mapped_column(Float)

    market: Mapped[Market] = relationship(back_populates="ticks")

    __table_args__ = (Index("ix_market_ts", "market_id", "ts"),)
```

### Example 3 — CRUD with async session

```python
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Market, PriceTick

async def upsert_market(session: AsyncSession, m: dict) -> Market:
    existing = await session.get(Market, m["id"])
    if existing is None:
        existing = Market(**m)
        session.add(existing)
    else:
        for k, v in m.items():
            setattr(existing, k, v)
    await session.commit()
    await session.refresh(existing)
    return existing

async def list_ticks(session: AsyncSession, market_id: str, limit: int = 1000) -> list[PriceTick]:
    stmt = select(PriceTick).where(PriceTick.market_id == market_id).order_by(PriceTick.ts.desc()).limit(limit)
    res = await session.execute(stmt)
    return list(res.scalars().all())

async def count_ticks_by_platform(session: AsyncSession) -> dict[str, int]:
    stmt = (
        select(Market.platform, func.count(PriceTick.id))
        .join(PriceTick, PriceTick.market_id == Market.id)
        .group_by(Market.platform)
    )
    res = await session.execute(stmt)
    return {platform: count for platform, count in res.all()}
```

### Example 4 — Eager loading (avoid lazy-load errors in async)

```python
from sqlalchemy.orm import selectinload

async def get_market_with_ticks(session: AsyncSession, market_id: str) -> Market | None:
    stmt = select(Market).where(Market.id == market_id).options(selectinload(Market.ticks))
    res = await session.execute(stmt)
    return res.scalar_one_or_none()
```

### Example 5 — Bulk insert (performance path for tick ingestion)

```python
from sqlalchemy import insert

async def insert_ticks(session: AsyncSession, market_id: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    stmt = insert(PriceTick).values([{"market_id": market_id, **r} for r in rows])
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount or 0
```

### Example 6 — Transaction scope

```python
async def replay_fills(session: AsyncSession, fills: list[dict]) -> None:
    async with session.begin():  # auto-commit on exit, rollback on exception
        for f in fills:
            session.add(PaperFill(**f))
    # No explicit commit needed.
```

## 3. Gotchas / pitfalls

- **No implicit lazy loading in async.** Accessing `market.ticks` after session close raises `MissingGreenlet`. Use `selectinload` / `joinedload`, or query explicitly.
- **`expire_on_commit=False`** on session factory lets you access attributes after commit without refetch — recommended for web contexts.
- **SQLite + async** uses `aiosqlite` driver. It serialises writes — do not expect real write concurrency.
- **`Mapped[str | None]`** syntax requires `from __future__ import annotations` on Python < 3.12; on 3.12 works natively.
- **Don't share `AsyncSession` across tasks**. One session per request/task.
- **Use `scalar_one_or_none()`** rather than `.first()` — clearer intent and avoids tuple unwrapping.
- **`session.get(Model, pk)`** is faster than a `select(...).where(id==pk)` for primary-key lookups.
- **Upgrade path to Postgres**: switch URL to `postgresql+asyncpg://...`; increase pool size (`pool_size=10, max_overflow=20`). Remove SQLite-only features (e.g., busy_timeout) if any.

## 4. Typing + mypy

```python
# pyproject.toml
[tool.mypy]
plugins = ["sqlalchemy.ext.mypy.plugin"]  # 2.x also has native Mapped[] typing
strict = true
```

## 5. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| sqlalchemy | ^2.0.36 | typed Mapped API |
| aiosqlite | ^0.20 | SQLite async driver |
| asyncpg | ^0.29 | Postgres async (upgrade) |
| alembic | ^1.13 | migrations — see alembic.md |
| python | 3.12 | required |
