"""Tests for sharpe_ratio."""

import math

import pytest

from predmarkets.metrics.sharpe_ratio import sharpe_ratio


def test_insufficient_data_returns_none():
    assert sharpe_ratio([]) is None
    assert sharpe_ratio([0.01]) is None


def test_zero_variance_returns_none():
    assert sharpe_ratio([0.01, 0.01, 0.01]) is None


def test_positive_mean_positive_sharpe():
    val = sharpe_ratio([0.01, 0.02, 0.015, 0.005])
    assert val is not None and val > 0


def test_negated_returns_negates_sharpe():
    a = sharpe_ratio([0.01, 0.02, -0.01])
    b = sharpe_ratio([-0.01, -0.02, 0.01])
    assert a is not None and b is not None
    assert a == pytest.approx(-b, rel=1e-9)


def test_annualization_factor_applied():
    rets = [0.01, 0.02, -0.005, 0.015]
    s1 = sharpe_ratio(rets, annualization_factor=1)
    s252 = sharpe_ratio(rets, annualization_factor=252)
    assert s1 is not None and s252 is not None
    assert s252 == pytest.approx(s1 * math.sqrt(252), rel=1e-9)


def test_bad_annualization_raises():
    with pytest.raises(ValueError):
        sharpe_ratio([0.01, 0.02], annualization_factor=0)
