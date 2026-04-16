# slippage_model — pseudocode

Contract derivation: disambiguated.txt slippage-model, ENG-01 slippage_model_implementation.

## Inputs
- mid_price: float ∈ (0, 1)
- order_size: int > 0
- order_side: Literal["buy", "sell"]
- book_top_size: int (top-of-book depth on aggressor side)

## Outputs
- fill_price: float ∈ [0, 1]

## Algorithm
```
# Default: mid ± 1¢ (0.01) on the aggressor side
IF order_side == "buy":
    fill = mid_price + 0.01
ELSE:
    fill = mid_price - 0.01

# Book crossing: if size > top-of-book depth, walk one level (simplified)
IF order_size > book_top_size:
    # Penalize by additional 1¢ per excess size tier
    excess_tiers = ceil((order_size - book_top_size) / max(book_top_size, 1))
    IF order_side == "buy":
        fill = fill + 0.01 * excess_tiers
    ELSE:
        fill = fill - 0.01 * excess_tiers

# Clamp to [0, 1]
fill = max(0.0, min(1.0, fill))
RETURN fill
```

## Postconditions
- Result ∈ [0, 1]
- Buy always fills >= mid + 0.01; Sell always fills <= mid - 0.01
- Larger orders cost more (more slippage) — monotone in size

## Verification checks
1. Buy with size < top: fill = mid + 0.01
2. Sell with size < top: fill = mid - 0.01
3. Buy with 2× top size: fill = mid + 0.02
4. Buy at mid=0.99: fill clamped at 1.0
