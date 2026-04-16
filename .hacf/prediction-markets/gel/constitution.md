# Constitution — Architectural Invariants (GEL-4)

Architectural invariants enforced at every Checkpoint (CEP-2).
Append-only; invariants can be relaxed only via explicit escalation-to-user.

## Invariants

- INV-1: Monotonic Growth — constraint surface grows only, never shrinks.
- INV-2: Harness-as-Infrastructure — reliability enforced by external hooks, not agent self-policing.
- INV-3: Immutable Observation — Verify-phase agents cannot modify the running program.
- Provider Agnosticism — no vendor lock-in beyond selected-tech-stack.json.
- Tests and contracts are immutable once written.
- No mocks, stubs, or fake data generators in production code.
- Every external call must pass First-Use External Call Verification (FUEC).

## Project-Specific Invariants

<!-- Populated during Create Step 15 (Boundary) and append-only thereafter. -->
