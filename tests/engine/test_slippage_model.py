"""Tests for slippage_fill_price."""

import pytest

from predmarkets.engine.slippage_model import slippage_fill_price


def test_buy_small_size_adds_one_cent():
    assert slippage_fill_price(0.50, 10, "buy", 100) == pytest.approx(0.51)


def test_sell_small_size_subtracts_one_cent():
    assert slippage_fill_price(0.50, 10, "sell", 100) == pytest.approx(0.49)


def test_buy_larger_than_top_walks_book():
    # 300 vs top 100 → 2 excess tiers → +2¢ extra → 0.50 + 0.01 + 0.02 = 0.53
    assert slippage_fill_price(0.50, 300, "buy", 100) == pytest.approx(0.53)


def test_clamps_at_one():
    assert slippage_fill_price(0.99, 10, "buy", 100) == 1.0


def test_clamps_at_zero():
    assert slippage_fill_price(0.005, 10, "sell", 100) == 0.0


def test_bad_inputs_raise():
    with pytest.raises(ValueError):
        slippage_fill_price(1.5, 10, "buy", 100)
    with pytest.raises(ValueError):
        slippage_fill_price(0.5, 0, "buy", 100)
    with pytest.raises(ValueError):
        slippage_fill_price(0.5, 10, "maybe", 100)  # type: ignore[arg-type]
