"""Tests for kelly_fraction."""

import pytest

from predmarkets.metrics.kelly_fraction import kelly_fraction


def test_no_edge_yields_zero():
    assert kelly_fraction(0.5, 0.5, "yes") == 0.0


def test_positive_edge_yes():
    # p=0.7, market=0.5 on YES → full Kelly ≈ 0.4
    f = kelly_fraction(0.7, 0.5, "yes")
    assert 0.3 <= f <= 0.45


def test_wrong_side_yes_yields_zero():
    # p=0.3 on YES where market thinks 0.5 → wrong direction
    assert kelly_fraction(0.3, 0.5, "yes") == 0.0


def test_positive_edge_no():
    # p=0.3 means market overpriced YES at 0.5 → NO has edge
    f = kelly_fraction(0.3, 0.5, "no")
    assert f > 0


def test_extreme_prices_return_zero():
    assert kelly_fraction(0.9, 0.0, "yes") == 0.0
    assert kelly_fraction(0.9, 1.0, "yes") == 0.0


def test_out_of_range_p_raises():
    with pytest.raises(ValueError):
        kelly_fraction(1.5, 0.5, "yes")


def test_bad_side_raises():
    with pytest.raises(ValueError):
        kelly_fraction(0.5, 0.5, "maybe")  # type: ignore[arg-type]
