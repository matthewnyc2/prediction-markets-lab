"""Auto-load user strategies from a directory of .py files.

Usage:

    from predmarkets import load_user_strategies
    strategies = load_user_strategies("src/predmarkets/strategies")
    # strategies is {strategy_id: strategy_class}
"""

from __future__ import annotations

import importlib.util
import inspect
import sys
from pathlib import Path

from predmarkets.strategies.base import Strategy


def load_user_strategies(directory: str | Path) -> dict[str, type[Strategy]]:
    """Return a dict of strategy_id → class for every .py in the directory.

    Scans *.py files, imports each module, and collects every class that
    subclasses Strategy and has a non-empty strategy_id. Skips the abstract
    base itself, skips files whose name starts with '_' or 'test_'.
    """
    directory = Path(directory)
    if not directory.is_dir():
        raise FileNotFoundError(f"strategies directory not found: {directory}")

    found: dict[str, type[Strategy]] = {}
    for py_file in sorted(directory.glob("*.py")):
        name = py_file.stem
        if name.startswith("_") or name.startswith("test_") or name == "base" or name == "loader":
            continue
        module = _load_module(py_file, f"predmarkets_user_strategies.{name}")
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is Strategy or not issubclass(cls, Strategy):
                continue
            sid = getattr(cls, "strategy_id", "") or ""
            if sid and sid not in found:
                found[sid] = cls
    return found


def _load_module(path: Path, module_name: str) -> object:
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load spec for {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module
