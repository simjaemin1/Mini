#!/usr/bin/env python3
"""Integration gate for actual-sample head/steady entry modes.

This deliberately requires a restored local ``samples_jdae`` bank rather
than creating a fake tone.  It verifies the property that matters to the
R&D-02 listening test: a chosen sample whose hold begins late still keeps its
recorded head when the renderer explicitly asks for ``entry_mode='head'``.

Example:

    PYTHONPATH=public/assets/audio/bgm \\
      /tmp/durango-bgm-rnd-venv/bin/python scripts/test-daegeum-entry-mode.py \\
      --bank /tmp/durango-bgm-samples/samples_jdae
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "public" / "assets" / "audio" / "bgm"))

try:
    import gugak as G  # noqa: E402
    from sampler import Bank, SR  # noqa: E402
except ModuleNotFoundError as exc:  # pragma: no cover - environment diagnostic
    raise SystemExit(
        "This actual-audio integration gate needs the existing sampler dependencies "
        "(NumPy and SciPy). Run it in the BGM R&D virtual environment."
    ) from exc


passed = 0
failed = 0


def check(condition: bool, label: str) -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}")


def expect_value_error(label: str, fn) -> None:
    try:
        fn()
    except ValueError:
        check(True, label)
    else:
        check(False, label)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify explicit head/steady entry against a restored JDAE bank."
    )
    parser.add_argument("--bank", type=Path, required=True,
                        help="restored samples_jdae directory containing _index.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.bank.expanduser().resolve()
    if not (root / "_index.json").is_file() or not (root / "_hold.json").is_file():
        raise SystemExit(f"not a restored samples_jdae bank: {root}")

    bank = Bank(root)
    entries = bank.by_inst.get("daegeum", [])
    delayed = [entry for entry in entries if entry[2].get("hold", [0])[0] >= 0.15]
    if not delayed:
        raise SystemExit("bank has no delayed-hold Daegeum sample; cannot exercise the regression")
    midi, _samples, meta = delayed[0]
    art = meta["art"]
    hold_start = float(meta["hold"][0])
    duration = 0.40

    print("=== BGM R&D-02 — recorded head/steady entry gate ===\n")
    print(f"sample: {meta['wav']}  midi={midi:.2f}  hold={meta['hold']}")

    head = bank.note("daegeum", midi, duration, art=art, ring=0.0,
                     entry_mode="head")
    check(head is not None and len(head) == int(duration * SR),
          "① explicit head renders a real selected sample at the requested duration")
    check(G.LAST_ENTRY == "head" and abs(G.LAST_SKIP) < 1e-12,
          "② explicit head does not silently crop to the delayed hold span")

    steady = bank.note("daegeum", midi, duration, art=art, ring=0.0,
                       legato=0.030, entry_mode="steady")
    check(steady is not None and len(steady) == int(duration * SR),
          "③ explicit steady renders the same actual-sample route")
    check(G.LAST_ENTRY == "mid" and G.LAST_SKIP >= hold_start - 1 / SR,
          "④ explicit steady begins at the recorded hold span")
    check(bool((head != steady).any()),
          "⑤ head and steady are materially different recordings, not two flags on one oscillator")

    expect_value_error(
        "⑥ head rejects a contradictory legato crossfade request",
        lambda: bank.note("daegeum", midi, duration, art=art, legato=0.030,
                          entry_mode="head"),
    )
    expect_value_error(
        "⑦ unknown entry mode is rejected rather than guessed",
        lambda: bank.note("daegeum", midi, duration, art=art, entry_mode="maybe"),
    )

    print(f"\n=== PASS {passed} / FAIL {failed} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
