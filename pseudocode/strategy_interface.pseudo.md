# Strategy interface — pseudocode

Contract derivation: tech-stack.json.strategy_plugin_interface.

## Abstract base

```
ABSTRACT CLASS Strategy:
    strategy_id: str                 # e.g. "kelly-sizing"
    display_name: str
    parameters_schema: dict          # JSON schema of valid param names + types

    ABSTRACT METHOD decide(market_state) -> list[Order]:
        # Called once per market-data-event.
        # Returns zero or more orders to submit.
        # Must NOT touch external services.

    ABSTRACT METHOD on_fill(paper_fill) -> None:
        # Called after each paper-fill produced by this strategy's order.
        # Used for bookkeeping (inventory, exposure) — no return value.
```

## Invariants
- Strategy methods are PURE from the engine's view; all state lives on `self`
- `decide()` must run in O(markets × O(1)) per event; no network, no DB
- Order.strategy_id must equal self.strategy_id (traceability)

## Verification checks
1. Subclass without decide() raises TypeError on instantiation
2. Subclass without on_fill() raises TypeError on instantiation
3. decide() returning non-list raises at engine boundary
