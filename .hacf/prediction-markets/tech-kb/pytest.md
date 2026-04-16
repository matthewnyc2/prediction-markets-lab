# pytest — Tech KB

**Version pinning**: `pytest@8.3.x`, `pytest-asyncio@0.24.x`, `pytest-cov@5.0.x`, `httpx@0.27.x`. Python 3.12.

## 1. API surface overview

- `pytest` — test discovery, `test_*.py` files and `test_*`/`*_test` funcs
- Fixtures: `@pytest.fixture` (scopes: function/class/module/session)
- Parametrisation: `@pytest.mark.parametrize`
- Async: `pytest-asyncio` with `@pytest.mark.asyncio`, or set `asyncio_mode = "auto"` in config
- Custom markers: `@pytest.mark.<name>` + registration in `pyproject.toml`
- `conftest.py` — shared fixtures, auto-discovered
- Plugins: `pytest-cov`, `pytest-xdist` (parallel), `pytest-randomly`, `pytest-freezegun`

## 2. Project config (`pyproject.toml`)

```toml
[tool.pytest.ini_options]
minversion = "8.0"
testpaths = ["tests"]
asyncio_mode = "auto"              # no need to mark every async test
addopts = "-ra --strict-markers --strict-config --cov=backend --cov-report=term-missing"
markers = [
  "unit: fast unit tests",
  "integration: tests that hit a real DB / HTTP",
  "slow: >1s runtime",
]
filterwarnings = [
  "error",
  "ignore::DeprecationWarning:some_noisy_dep.*",
]
```

## 3. Code examples

### Example 1 — Basic fixture + parametrize

```python
# tests/test_kelly.py
import pytest
from backend.app.quant.kelly import kelly_fraction

@pytest.mark.parametrize(
    ("p", "b", "expected"),
    [
        (0.6, 1.0, 0.2),
        (0.5, 1.0, 0.0),
        (0.4, 1.0, 0.0),  # clamped to 0
        (0.7, 2.0, 0.55),
    ],
)
def test_kelly_fraction(p: float, b: float, expected: float) -> None:
    assert kelly_fraction(p, b) == pytest.approx(expected, rel=1e-3)
```

### Example 2 — Session-scoped async DB fixture

```python
# tests/conftest.py
from collections.abc import AsyncIterator
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from backend.app.models import Base

@pytest_asyncio.fixture(scope="session")
async def engine():
    e = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with e.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield e
    await e.dispose()

@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
        await s.rollback()
```

### Example 3 — Async FastAPI endpoint test

```python
# tests/test_markets_api.py
import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

@pytest.mark.asyncio
async def test_list_markets_empty() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/api/markets")
    assert r.status_code == 200
    assert r.json() == []
```

### Example 4 — Factory fixture

```python
# tests/conftest.py
from datetime import datetime, timezone
import pytest
from backend.app.models import Market

@pytest.fixture
def make_market():
    def _make(**overrides):
        defaults = dict(
            id="kalshi:TEST-1",
            platform="kalshi",
            title="Test market",
            yes_price=0.5, no_price=0.5, volume_24h=0,
            closes_at=datetime(2026, 12, 31, tzinfo=timezone.utc),
        )
        return Market(**{**defaults, **overrides})
    return _make
```

### Example 5 — Property-ish parametrize with IDs

```python
@pytest.mark.parametrize(
    "returns, expected_sharpe_gt",
    [
        pytest.param([0.01] * 100, 5.0, id="constant-positive"),
        pytest.param([0.0]  * 100, 0.0, id="zero-vol"),
        pytest.param([-0.01, 0.02] * 50, 1.0, id="alternating"),
    ],
)
def test_sharpe_ratio(returns, expected_sharpe_gt):
    import pandas as pd
    from backend.app.quant.metrics import sharpe
    s = sharpe(pd.Series(returns))
    assert s >= expected_sharpe_gt or expected_sharpe_gt == 0
```

### Example 6 — Markers + skip conditions

```python
import pytest, sys

@pytest.mark.integration
@pytest.mark.skipif(sys.platform == "win32", reason="uvloop not on windows")
def test_live_adapter_kalshi():
    ...

# run only fast tests:  pytest -m "not integration and not slow"
```

### Example 7 — Freeze time for time-based logic

```python
# requires `pytest-freezegun` or `freezegun`
from freezegun import freeze_time
from backend.app.quant.rules import news_spike_cutoff

@freeze_time("2026-04-16 12:00:00")
def test_news_spike_cutoff_15min():
    assert news_spike_cutoff().isoformat().startswith("2026-04-16T12:15")
```

### Example 8 — Mocking external HTTP

```python
import respx, httpx, pytest
from backend.adapters.polymarket import fetch_market

@pytest.mark.asyncio
async def test_polymarket_adapter(respx_mock):
    respx_mock.get("https://gamma-api.polymarket.com/markets/abc").mock(
        return_value=httpx.Response(200, json={"id": "abc", "outcomePrices": ["0.6", "0.4"]})
    )
    m = await fetch_market("abc")
    assert m.yes_price == pytest.approx(0.6)
```

## 4. Running tests

```bash
# all tests
pytest

# by marker
pytest -m unit

# single test
pytest tests/test_kelly.py::test_kelly_fraction

# parallel (pytest-xdist)
pytest -n auto

# watch mode (pytest-watcher)
ptw --runner "pytest --lf"

# with coverage gate
pytest --cov=backend --cov-fail-under=80
```

## 5. Gotchas / pitfalls

- **`asyncio_mode = "auto"`** removes the need to mark every async test; but fixtures still need `@pytest_asyncio.fixture` (not `@pytest.fixture`).
- **Function-scope fixtures are the default** — don't make DB fixtures session-scoped unless you truly want state to persist.
- **`pytest.approx(..., rel=..., abs=...)`** — for floats; `==` will burn you.
- **`parametrize` IDs**: use `pytest.param(..., id="...")` for readable failure output.
- **Fixture finalisation**: use `yield` instead of `request.addfinalizer` for clarity.
- **`conftest.py` location matters**: the closest one wins; can shadow session fixtures.
- **Collecting test files**: names must start with `test_`. Classes must start with `Test` and cannot have `__init__`.
- **`monkeypatch.setenv`** auto-reverts — safer than direct `os.environ` edits.

## 6. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| pytest | ^8.3 | |
| pytest-asyncio | ^0.24 | pairs with pytest 8 |
| pytest-cov | ^5.0 | |
| pytest-xdist | ^3.6 | optional parallel |
| respx | ^0.21 | httpx mocking |
| freezegun | ^1.5 | time freeze |
| python | 3.12 | declared |
