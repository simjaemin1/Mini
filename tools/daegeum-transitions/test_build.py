#!/usr/bin/env python3
"""End-to-end approval-gate tests for the R&D-06 transition-bank builder.

The tests deliberately create a tiny synthetic *direct* WAV in a temporary
directory instead of reading a user's Gugak archive.  Its two clear pitched
regions provide one automatic candidate; the assertions then exercise the
important boundary between an automatic candidate and reusable human-approved
evidence.

Run this with the R&D Python environment, which supplies NumPy and SciPy:

    /tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/test_build.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import subprocess
import struct
import sys
import tempfile
import unittest
import wave
from typing import Any, Mapping, Sequence


TOOL_DIR = Path(__file__).resolve().parent
BUILD = TOOL_DIR / "build.py"
CONTRACT_TEST = TOOL_DIR.parents[1] / "scripts" / "test-daegeum-transition-bank.py"


def _jsonl_rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _write_direct_test_wav(
    path: Path,
    *,
    rate: int = 12_000,
    frequencies: tuple[float, float, float] = (440.0, 523.2511306, 440.0),
) -> None:
    """Write an isolated temporary two-pitch source with a clear F0 change.

    The filename selected by the caller intentionally maps to the builder's
    ``continuous_performance_candidate`` role.  This is test-only evidence,
    never a musical asset or an input to the game.
    """

    # A reasonably long stable region on each side keeps the detector's
    # 120-ms stable anchors and 750-ms review context away from source edges.
    regions = tuple((frequency, duration_s) for frequency, duration_s in zip(frequencies, (2.0, 2.0, 1.0)))
    values: list[int] = []
    for frequency, duration_s in regions:
        count = int(round(rate * duration_s))
        for index in range(count):
            # Resetting phase at the note boundary makes an intentionally
            # obvious candidate.  Whether a real recording is slurred or
            # tongued is exactly what a human label must decide later.
            sample = 0.42 * math.sin(2.0 * math.pi * frequency * index / rate)
            values.append(max(-32768, min(32767, int(round(sample * 32767.0)))))
    payload = struct.pack(f"<{len(values)}h", *values)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(payload)


class BuildApprovalGateTests(unittest.TestCase):
    """Run the CLI against a direct temporary source and inspect its artifacts."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._temporary = tempfile.TemporaryDirectory(prefix="rnd06-build-gates-")
        cls.root = Path(cls._temporary.name)
        cls.raw = cls.root / "direct"
        cls.raw.mkdir()
        cls.source = cls.raw / "Sanjo_deageum_2.wav"
        _write_direct_test_wav(cls.source)
        cls.source_sha_before = hashlib.sha256(cls.source.read_bytes()).hexdigest()

        # A second root deliberately has a different source name and waveform:
        # it must remain a separately provable direct source, not a copied or
        # renamed duplicate of the Sanjo fixture above.
        cls.secondary_raw = cls.root / "direct-jeongak"
        cls.secondary_raw.mkdir()
        cls.secondary_source = cls.secondary_raw / "Jeongakdaegeum.wav"
        _write_direct_test_wav(
            cls.secondary_source,
            rate=16_000,
            frequencies=(391.99543598, 466.16376152, 391.99543598),
        )
        cls.secondary_source_sha_before = hashlib.sha256(cls.secondary_source.read_bytes()).hexdigest()

        # This is the stable filename family used by the official NGC extended
        # Sanjo phrase collection.  The builder may offer it to the *review*
        # queue, never auto-label it as a true transition.
        cls.extended_phrase_raw = cls.root / "direct-extended-sanjo"
        cls.extended_phrase_raw.mkdir()
        cls.extended_phrase_source = cls.extended_phrase_raw / "Daegeum_SJ_001_(3_4th_bpm84).wav"
        _write_direct_test_wav(
            cls.extended_phrase_source,
            rate=11_025,
            frequencies=(466.16376152, 391.99543598, 466.16376152),
        )
        cls.extended_phrase_source_sha_before = hashlib.sha256(cls.extended_phrase_source.read_bytes()).hexdigest()

        cls.baseline_output, baseline = cls._invoke("baseline")
        if baseline.returncode != 0:
            raise AssertionError(cls._failure_detail(baseline))
        cls.candidates = _jsonl_rows(cls.baseline_output / "candidates.jsonl")
        if not cls.candidates:
            raise AssertionError("test WAV did not produce an automatic candidate")
        native_frames = 12_000 * 5
        # Pick a candidate whose review context is safely internal.  The
        # context/center-escape tests below must fail the builder's own gates,
        # rather than the temporary source's frame-bound check.
        cls.candidate = next(
            (
                candidate
                for candidate in cls.candidates
                if int(candidate["region_frames"]["context_start"]) > 100
                and int(candidate["region_frames"]["context_end"]) < native_frames - 100
            ),
            None,
        )
        if cls.candidate is None:
            raise AssertionError("test WAV produced no internally-contextualized candidate")
        if hashlib.sha256(cls.source.read_bytes()).hexdigest() != cls.source_sha_before:
            raise AssertionError("builder modified the temporary direct WAV")

    @classmethod
    def tearDownClass(cls) -> None:
        cls._temporary.cleanup()

    @classmethod
    def _failure_detail(cls, result: subprocess.CompletedProcess[str]) -> str:
        return (
            f"build command failed (exit {result.returncode})\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )

    @classmethod
    def _invoke(
        cls,
        name: str,
        labels: list[Mapping[str, Any]] | None = None,
        raw_dirs: Sequence[Path] | None = None,
    ) -> tuple[Path, subprocess.CompletedProcess[str]]:
        output = cls.root / f"bundle-{name}"
        command = [sys.executable, str(BUILD)]
        for raw_dir in (cls.raw,) if raw_dirs is None else raw_dirs:
            command.extend(("--raw-daegeum-dir", str(raw_dir)))
        command.extend(("--output-dir", str(output)))
        if labels is not None:
            label_path = cls.root / f"labels-{name}.jsonl"
            label_path.write_text(
                "".join(json.dumps(label, sort_keys=True) + "\n" for label in labels), encoding="utf-8"
            )
            command.extend(("--labels", str(label_path)))
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        return output, result

    @classmethod
    def _approved_label(
        cls,
        *,
        label_id: str = "approved-test-transition",
        gesture_class: str = "continuous_pitch_change",
        retrieval_eligible: Any = True,
        expression_eligible: Any = False,
        clip_start: int | None = None,
        transition_bounds: tuple[int, int] | None = None,
    ) -> dict[str, Any]:
        candidate = cls.candidate
        region = candidate["region_frames"]
        context_start = int(region["context_start"])
        context_end = int(region["context_end"])
        center = int(region["boundary_center"])
        actual_clip_start = context_start if clip_start is None else clip_start
        if transition_bounds is None:
            transition_bounds = (center - 12, center + 12)
        transition_start, transition_end = transition_bounds
        if not (actual_clip_start < transition_start < transition_end < context_end):
            raise AssertionError("test label fixture is not an ordered frame partition")
        return {
            "schema": "durango.daegeum.transition-label.v1",
            "label_id": label_id,
            "candidate_id": candidate["candidate_id"],
            "source": dict(candidate["source"]),
            "frames": {
                "clip": [actual_clip_start, context_end],
                "pre_stable": [actual_clip_start, transition_start],
                "transition": [transition_start, transition_end],
                "post_stable": [transition_end, context_end],
            },
            "gesture": {
                "class": gesture_class,
                "audible_onset": "other",
                "same_breath": "unknown",
                "traditional_term": "",
            },
            "pitch_anchors": [
                {"region": "pre_stable", "midi": 69.0},
                {"region": "post_stable", "midi": 72.0},
            ],
            "review": {
                "state": "approved",
                "retrieval_eligible": retrieval_eligible,
                "expression_eligible": expression_eligible,
                "reviewer": "test-listener",
                "notes": "Synthetic gate-test label; not musical evidence.",
            },
        }

    def _assert_rejected(self, name: str, labels: list[Mapping[str, Any]], fragment: str) -> None:
        output, result = self._invoke(name, labels)
        self.assertEqual(result.returncode, 2, self._failure_detail(result))
        self.assertIn(fragment, result.stderr)
        self.assertFalse(output.exists(), "failed approval input must not leave a partial bank")
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.source_sha_before)

    def _assert_contract_bundle(self, output: Path) -> None:
        """Keep builder output and the dependency-free artifact contract aligned."""
        contract = subprocess.run(
            [sys.executable, str(CONTRACT_TEST), "--bundle", str(output)],
            cwd=TOOL_DIR.parents[1],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(
            contract.returncode,
            0,
            "R&D-06 artifact contract rejected the builder's approved bundle\n"
            f"stdout:\n{contract.stdout}\nstderr:\n{contract.stderr}",
        )

    def test_unreviewed_label_produces_empty_banks(self) -> None:
        label = self._approved_label()
        label["label_id"] = ""
        label["review"] = {
            "state": "unreviewed",
            "retrieval_eligible": False,
            "expression_eligible": False,
            "reviewer": "",
            "notes": "Still an automatic candidate.",
        }
        output, result = self._invoke("unreviewed", [label])
        self.assertEqual(result.returncode, 0, self._failure_detail(result))
        self.assertTrue(_jsonl_rows(output / "candidates.jsonl"))
        self.assertEqual(_jsonl_rows(output / "transition_bank.jsonl"), [])
        self.assertEqual(_jsonl_rows(output / "expression_manifest.jsonl"), [])
        provenance = json.loads((output / "provenance.json").read_text(encoding="utf-8"))
        self.assertEqual(provenance["approved_label_count"], 0)
        self.assertEqual(provenance["approved_transition_count"], 0)

    def test_valid_approved_continuous_pitch_change_enters_transition_bank(self) -> None:
        label = self._approved_label()
        output, result = self._invoke("approved-continuous", [label])
        self.assertEqual(result.returncode, 0, self._failure_detail(result))
        bank = _jsonl_rows(output / "transition_bank.jsonl")
        self.assertEqual(len(bank), 1)
        self.assertEqual(bank[0]["label_id"], label["label_id"])
        self.assertEqual(bank[0]["gesture"]["class"], "continuous_pitch_change")
        self.assertEqual(bank[0]["pitch_anchors"], label["pitch_anchors"])
        self.assertEqual(_jsonl_rows(output / "expression_manifest.jsonl"), [])
        self._assert_contract_bundle(output)

    def test_approved_tongued_onset_can_be_expression_evidence_only(self) -> None:
        label = self._approved_label(
            label_id="approved-expression-onset",
            gesture_class="tongued_rearticulation",
            retrieval_eligible=False,
            expression_eligible=True,
        )
        output, result = self._invoke("approved-expression", [label])
        self.assertEqual(result.returncode, 0, self._failure_detail(result))
        self.assertEqual(_jsonl_rows(output / "transition_bank.jsonl"), [])
        expression = _jsonl_rows(output / "expression_manifest.jsonl")
        self.assertEqual(len(expression), 1)
        self.assertEqual(expression[0]["candidate_id"], label["candidate_id"])
        self.assertEqual(expression[0]["gesture_class"], "tongued_rearticulation")
        self.assertEqual(expression[0]["review"], label["review"])
        self.assertEqual(expression[0]["pitch_anchors"], label["pitch_anchors"])
        self._assert_contract_bundle(output)

    def test_string_boolean_is_rejected_before_approval(self) -> None:
        label = self._approved_label(retrieval_eligible="false")
        self._assert_rejected("string-false", [label], "retrieval_eligible: expected a JSON boolean")

    def test_tongued_retrieval_is_rejected(self) -> None:
        label = self._approved_label(gesture_class="tongued_rearticulation")
        self._assert_rejected("tongue-retrieval", [label], "only an approved continuous_pitch_change")

    def test_context_and_boundary_center_escapes_are_rejected(self) -> None:
        context_start = int(self.candidate["region_frames"]["context_start"])
        self._assert_rejected(
            "context-escape",
            [self._approved_label(clip_start=context_start - 1)],
            "approved clip must stay inside its generated candidate context",
        )

        center = int(self.candidate["region_frames"]["boundary_center"])
        self._assert_rejected(
            "center-escape",
            [self._approved_label(transition_bounds=(center - 240, center - 120))],
            "approved transition must contain its candidate boundary center",
        )

    def test_duplicate_approved_candidate_is_rejected(self) -> None:
        first = self._approved_label(label_id="approved-duplicate-a")
        second = self._approved_label(label_id="approved-duplicate-b")
        self._assert_rejected(
            "duplicate-candidate",
            [first, second],
            "a candidate may have only one approved review",
        )

    def test_multiple_explicit_direct_roots_form_one_path_free_catalog(self) -> None:
        """Both continuous source roots must retain independent provenance.

        This exercises the repeatable CLI flag rather than calling ``build``
        directly, so accidental argparse regressions cannot silently restore
        its former single-root behavior.
        """

        output, result = self._invoke(
            "three-roots",
            raw_dirs=(self.raw, self.secondary_raw, self.extended_phrase_raw),
        )
        self.assertEqual(result.returncode, 0, self._failure_detail(result))

        catalog = json.loads((output / "source_catalog.json").read_text(encoding="utf-8"))
        files = catalog["files"]
        self.assertEqual(len(files), 3)
        expected_by_path = {
            "Sanjo_deageum_2.wav": self.source_sha_before,
            "Jeongakdaegeum.wav": self.secondary_source_sha_before,
            "Daegeum_SJ_001_(3_4th_bpm84).wav": self.extended_phrase_source_sha_before,
        }
        self.assertEqual(
            {item["relative_path"]: item["sha256"] for item in files},
            expected_by_path,
        )
        self.assertEqual(
            {item["source_role"] for item in files},
            {"continuous_performance_candidate", "continuous_phrase_candidate"},
        )

        candidates = _jsonl_rows(output / "candidates.jsonl")
        candidate_source_paths = {item["source"]["relative_path"] for item in candidates}
        self.assertEqual(candidate_source_paths, set(expected_by_path))
        self.assertTrue(candidates, "each direct continuous source must contribute review candidates")

        # The build's own source check is augmented here with the original
        # byte hashes, and every browser/readable artifact must remain
        # portable rather than accidentally retaining either local root.
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.source_sha_before)
        self.assertEqual(
            hashlib.sha256(self.secondary_source.read_bytes()).hexdigest(),
            self.secondary_source_sha_before,
        )
        self.assertEqual(
            hashlib.sha256(self.extended_phrase_source.read_bytes()).hexdigest(),
            self.extended_phrase_source_sha_before,
        )
        for artifact in output.rglob("*"):
            if not artifact.is_file() or artifact.suffix.lower() not in {".json", ".jsonl", ".html", ".svg", ".tsv"}:
                continue
            text = artifact.read_text(encoding="utf-8")
            self.assertNotIn(str(self.raw.resolve()), text, artifact.name)
            self.assertNotIn(str(self.secondary_raw.resolve()), text, artifact.name)
            self.assertNotIn(str(self.extended_phrase_raw.resolve()), text, artifact.name)
        self._assert_contract_bundle(output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
