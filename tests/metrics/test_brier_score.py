"""Tests for brier_score. Mirrors src/predmarkets/metrics/brier_score.py 1:1."""

import pytest

from predmarkets.metrics.brier_score import brier_score


def test_empty_input_returns_none():
    assert brier_score([], []) is None


def test_perfect_calibration_returns_zero():
    assert brier_score([1.0, 0.0, 1.0, 0.0], [1, 0, 1, 0]) == 0.0


def test_coin_flip_forecasts_on_balanced_outcomes():
    # forecast 0.5 on (win, loss, win, loss) gives (0.5)^2 each = 0.25
    assert brier_score([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0]) == pytest.approx(0.25)


def test_overconfident_wrong_forecasts_yield_high_brier():
    # forecast 0.9 that it wins, actually loses 4 times → each term = 0.81
    assert brier_score([0.9, 0.9, 0.9, 0.9], [0, 0, 0, 0]) == pytest.approx(0.81)


def test_length_mismatch_raises():
    with pytest.raises(ValueError, match="length mismatch"):
        brier_score([0.5], [0, 1])


def test_out_of_range_forecast_raises():
    with pytest.raises(ValueError, match="forecast out of"):
        brier_score([1.5], [1])


def test_non_binary_outcome_raises():
    with pytest.raises(ValueError, match="outcome not binary"):
        brier_score([0.5], [2])
