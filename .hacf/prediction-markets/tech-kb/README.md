# Tech KB — Prediction Markets Project

Generated for HACF Phase 1, Step 12a on 2026-04-16.

Stack source: `.hacf/prediction-markets/tech-stack.json` (confirmed by person via hacf-create-proposal.html §6).

> Note on generation: The Context7 MCP monthly quota was exhausted at generation time. All documents below reflect the **stable, pinned versions** declared in `tech-stack.json` using authoritative upstream references (official docs, release notes, changelogs) as of 2026-04. Cross-check the linked official docs for any version-pinned edge case. All code examples are copy-paste-ready and consistent with the project's declared defaults.

## Frontend

| Technology | File | Pinned version |
| --- | --- | --- |
| Next.js 15 (App Router) | [`nextjs.md`](./nextjs.md) | `next@15.x`, `react@19.x` |
| TypeScript 5.x + zod | [`typescript.md`](./typescript.md) | `typescript@5.6.x`, `zod@3.23.x` |
| Tailwind CSS 4.x | [`tailwind.md`](./tailwind.md) | `tailwindcss@4.0.x` |
| Recharts | [`recharts.md`](./recharts.md) | `recharts@2.13.x` |
| Vitest + Playwright | [`vitest-playwright.md`](./vitest-playwright.md) | `vitest@2.1.x`, `@playwright/test@1.48.x` |

## Backend

| Technology | File | Pinned version |
| --- | --- | --- |
| FastAPI (Python 3.12) | [`fastapi.md`](./fastapi.md) | `fastapi@0.115.x`, `pydantic@2.9+` |
| SQLAlchemy 2.x | [`sqlalchemy.md`](./sqlalchemy.md) | `sqlalchemy@2.0.36+` |
| Alembic | [`alembic.md`](./alembic.md) | `alembic@1.13.x` |
| pandas / numpy / scipy | [`pandas-numpy-scipy.md`](./pandas-numpy-scipy.md) | `pandas@2.2`, `numpy@1.26 or 2.1`, `scipy@1.14` |
| pytest | [`pytest.md`](./pytest.md) | `pytest@8.3.x`, `pytest-asyncio@0.24.x` |

## Cross-cutting defaults used in code examples

Drawn from `tech-stack.json`:

- Starting simulated bankroll: `$10,000`
- Live poll interval: `30 seconds`
- Closing-momentum window: `6 hours`
- News-fade trigger: `10% move over 15 minutes`
- Market-maker spread: `2 cents`
- Theme: dark-only
- Deployment: local (`npm run dev` + `uvicorn`)
- Database: SQLite (upgrade path: Postgres via `postgresql+asyncpg://...`)

## Each file contains

- API surface overview
- At least 5 copy-paste-ready code examples (most files ship 6–10)
- Gotchas / pitfalls
- Version pinning recommendations and compatibility matrices
- Integration notes relevant to this project's adapters, strategies, and data flow

## Sparse docs / follow-up

- **Recharts** upstream v3 exists but has breaking changes; KB recommends v2.13 for React 19 stability.
- **NumPy 2.x** is listed as optional; KB pins safe at 1.26 until all transitive deps are confirmed on NumPy 2.
- **Context7 quota** was exhausted during generation — if any ambiguity arises during Phase 3 (Build), re-run the skill with a valid Context7 API key to pull version-exact snippets.
