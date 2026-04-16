# kelly_fraction — pseudocode

Contract derivation: STR-01, feature-discoveries.strategy_specs.

## Inputs
- p: float — strategy's estimated true probability ∈ [0, 1]
- market_price: float — current market yes-price ∈ [0, 1]
- side: Literal["yes", "no"]

## Outputs
- f_star: float ∈ [0, 1] — optimal Kelly fraction; 0 if no edge

## Algorithm
```
IF side == "yes":
    # payoff odds b = (1 - market_price) / market_price
    # edge: p > market_price
    IF market_price >= 1 OR market_price <= 0: RETURN 0
    b = (1 - market_price) / market_price
    q = 1 - p
    f_star = (b * p - q) / b
ELSE:  # "no" — payoff odds b = market_price / (1 - market_price)
    IF market_price >= 1 OR market_price <= 0: RETURN 0
    p_no = 1 - p
    b = market_price / (1 - market_price)
    q_no = 1 - p_no
    f_star = (b * p_no - q_no) / b

IF f_star <= 0: RETURN 0      # no edge; don't trade
IF f_star > 1: RETURN 1       # cap at full bankroll
RETURN f_star
```

## Postconditions
- Returns 0 when no edge (p == market_price or wrong direction)
- Returns value in (0, 1] when edge exists
- Symmetric for yes/no under probability inversion

## Verification checks
1. kelly(p=0.7, market=0.5, "yes") > 0 (positive edge)
2. kelly(p=0.5, market=0.5, "yes") == 0 (no edge)
3. kelly(p=0.3, market=0.5, "yes") == 0 (wrong side)
4. kelly(p=0.3, market=0.5, "no")  > 0 (edge on NO side)
5. Extreme prices 0 or 1 return 0 (undefined)
