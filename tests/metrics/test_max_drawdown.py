"""Tests for max_drawdown."""

import pytest

from predmarkets.metrics.max_drawdown import max_drawdown


def test_empty_returns_zero():
    assert max_drawdown([]) == 0.0


def test_monotone_increase_zero_drawdown():
    assert max_drawdown([100, 110, 120, 125]) == 0.0


def test_fifty_percent_drawdown():
    assert max_drawdown([100, 50]) == pytest.approx(0.5)


def test_max_is_largest_peak_to_trough():
    # peak 200 → 100 = 50%; peak 100 → 90 = 10%. Max is 50%
    assert max_drawdown([100, 50, 200, 100]) == pytest.approx(0.5)


def test_single_point_zero():
    assert max_drawdown([100]) == 0.0
