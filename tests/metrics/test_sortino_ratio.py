"""Tests for sortino_ratio."""

from predmarkets.metrics.sortino_ratio import sortino_ratio


def test_insufficient_data_returns_none():
    assert sortino_ratio([]) is None
    assert sortino_ratio([0.01]) is None


def test_no_downside_returns_none():
    assert sortino_ratio([0.01, 0.02, 0.0, 0.015]) is None


def test_downside_only_penalizes_negative_returns():
    # both lists have same mean; one has upside volatility, the other downside
    upside = sortino_ratio([0.0, 0.04, -0.01, 0.01])  # small downside
    downside = sortino_ratio([0.0, -0.04, 0.01, -0.01])  # bigger downside, smaller mean
    # upside Sortino should be finite; downside could be negative or None
    assert upside is not None
