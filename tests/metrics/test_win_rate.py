"""Tests for win_rate."""

from predmarkets.metrics.win_rate import win_rate


def test_empty_returns_none():
    assert win_rate([]) is None


def test_all_cancelled_returns_none():
    assert win_rate([(0.0, True), (0.0, True)]) is None


def test_pnl_zero_counts_as_loss():
    assert win_rate([(0.0, False), (5.0, False)]) == 0.5


def test_three_wins_out_of_five_eligible():
    data = [(10.0, False), (-5.0, False), (20.0, False), (2.0, False), (-1.0, False)]
    assert win_rate(data) == 0.6


def test_cancelled_excluded_from_denominator():
    data = [(10.0, False), (0.0, True), (0.0, True)]  # 1 win out of 1 eligible
    assert win_rate(data) == 1.0
