#!/usr/bin/env python3
"""Dependency-free contract test for the separate R&D-06 transition artifacts.

The test deliberately does not import the forthcoming builder or native WAV
reader.  That keeps the static policy check runnable without NumPy/SciPy or
the private raw corpus.  Pass ``--bundle`` after an actual build to validate
the catalog, JSONL lineage, native-frame bounds, labels, and output policy.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping


ROOT = Path(__file__).resolve().parents[1]
TRANSITIONS = ROOT / "tools" / "daegeum-transitions"
SCHEMA = TRANSITIONS / "transition-bank.schema.json"
BUILDER = TRANSITIONS / "build.py"

SCHEMA_ROOT = "durango.daegeum.transition-bank.v1"
LABEL_SCHEMA = "durango.daegeum.transition-label.v1"
SOURCE_CATALOG_SCHEMA = f"{SCHEMA_ROOT}.source-catalog.v1"
CANDIDATE_SCHEMA = f"{SCHEMA_ROOT}.candidate.v1"
APPROVED_TRANSITION_SCHEMA = f"{SCHEMA_ROOT}.approved-transition.v1"
EXPRESSION_SCHEMA = f"{SCHEMA_ROOT}.expression-manifest.v1"
COVERAGE_SCHEMA = f"{SCHEMA_ROOT}.coverage.v1"

SOURCE_KEYS = {"source_id", "sha256", "relative_path", "source_role", "rights", "native"}
SOURCE_REF_KEYS = {"source_id", "sha256", "relative_path"}
CANDIDATE_KEYS = {
    "schema", "candidate_id", "source", "region_frames", "auto_evidence", "status",
    "automatic_detection_is_not_a_musical_gesture_label",
}
LABEL_KEYS = {"schema", "label_id", "candidate_id", "source", "frames", "gesture", "pitch_anchors", "review"}
EXPRESSION_KEYS = {
    "schema", "label_id", "candidate_id", "source", "clip_frames", "gesture_class",
    "pitch_anchors", "review", "feature_file", "take_split_key",
}
REGION_KEYS = {"context_start", "boundary_center", "proposed_boundary_window", "context_end"}
FRAME_KEYS = {"clip", "pre_stable", "transition", "post_stable"}
GESTURE_KEYS = {"class", "audible_onset", "same_breath", "traditional_term"}
REVIEW_KEYS = {"state", "retrieval_eligible", "expression_eligible", "reviewer", "notes"}
AUTO_EVIDENCE_KEYS = {
    "analysis_frame_index", "detector_class", "pre_f0_hz_proxy", "post_f0_hz_proxy",
    "pre_midi_proxy", "post_midi_proxy", "f0_step_cents", "onset_flux",
    "same_pitch_onset_flux_threshold", "rms_dbfs", "rms_valley_db_relative_to_stable_anchors",
    "voicing_confidence",
}
SOURCE_ID_RE = re.compile(r"^src_[0-9a-f]{16}$")
CANDIDATE_ID_RE = re.compile(r"^cand_(src_[0-9a-f]{16})_[0-9]{3,}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
WINDOWS_ABSOLUTE_RE = re.compile(r"^[A-Za-z]:[\\/]")
GESTURE_CLASSES = {
    "continuous_pitch_change", "tongued_rearticulation", "breath_separated",
    "same_pitch_continuation", "ornament_or_sigimsae", "not_a_transition",
}
COVERAGE_TARGETS = {
    "77_to_77_rearticulation": {
        "from_midi": 77.0,
        "to_midi": 77.0,
        "required_capability": "expression_articulation",
        "gesture_classes": {"tongued_rearticulation", "same_pitch_continuation"},
    },
    "77_to_74_continuous": {"from_midi": 77.0, "to_midi": 74.0, "required_capability": "transition_retrieval", "gesture_classes": {"continuous_pitch_change"}},
    "74_to_72_continuous": {"from_midi": 74.0, "to_midi": 72.0, "required_capability": "transition_retrieval", "gesture_classes": {"continuous_pitch_change"}},
    "72_to_70_continuous": {"from_midi": 72.0, "to_midi": 70.0, "required_capability": "transition_retrieval", "gesture_classes": {"continuous_pitch_change"}},
    "70_to_72_continuous": {"from_midi": 70.0, "to_midi": 72.0, "required_capability": "transition_retrieval", "gesture_classes": {"continuous_pitch_change"}},
    "72_to_74_continuous": {"from_midi": 72.0, "to_midi": 74.0, "required_capability": "transition_retrieval", "gesture_classes": {"continuous_pitch_change"}},
    "74_to_77_continuous": {"from_midi": 74.0, "to_midi": 77.0, "required_capability": "transition_retrieval", "gesture_classes": {"continuous_pitch_change"}},
}

# Only browser-facing default runtime and its shipped 13-track surface belong
# here. R&D scripts and ignored output bundles are intentionally not runtime.
DEFAULT_TRACKS = (
    "village_day_trad", "village_day_amb", "village_day_ari", "village_day_jeongak",
    "village_night_trad", "village_night_amb", "village_night_ari",
    "battle_trad", "battle_amb", "battle_ari", "journey_trad", "journey_amb", "journey_ari",
)
RUNTIME_PROTECTED_PATHS = (
    "public/assets/audio/bgm/bgm.js",
    "public/assets/audio/bgm/bgm-loops.js",
    "public/assets/audio/bgm/render-meta.json",
    *tuple(
        f"public/assets/audio/bgm/{track}.{extension}"
        for track in DEFAULT_TRACKS
        for extension in ("ogg", "m4a")
    ),
)

passed = 0
failed = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


def is_int(value: Any) -> bool:
    return type(value) is int


def equal_keys(value: Any, expected: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == expected


def safe_relative_path(value: Any) -> bool:
    if not isinstance(value, str) or not value or value.startswith(("/", "\\", "~")):
        return False
    if WINDOWS_ABSOLUTE_RE.match(value) or "\\" in value or "//" in value:
        return False
    return all(part not in {"", ".", ".."} for part in value.split("/"))


def is_path_leak(value: str) -> bool:
    """Reject a local source root anywhere in serialized textual metadata."""
    if value.startswith(("/", "\\", "~", "file:")) or WINDOWS_ABSOLUTE_RE.match(value):
        return True
    if "\\" in value or "/Users/" in value or "/home/" in value:
        return True
    if "$GUGAK_" in value or "${" in value or "%USERPROFILE%" in value:
        return True
    return False


def walk_strings(value: Any, location: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(value, str):
        yield location, value
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk_strings(child, f"{location}[{index}]")
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from walk_strings(child, f"{location}.{key}")


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            raw = line.strip()
            if not raw:
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path.name}:{line_number} is not JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path.name}:{line_number} must be an object")
            rows.append(row)
    return rows


def finite_number(value: Any) -> bool:
    return type(value) in (int, float) and math.isfinite(float(value))


def frame_pair(value: Any, *, frame_count: int, label: str) -> tuple[tuple[int, int] | None, list[str]]:
    if not isinstance(value, list) or len(value) != 2 or not all(is_int(item) for item in value):
        return None, [f"{label} must be a two-integer native-frame interval"]
    start, end = value
    if not (0 <= start < end <= frame_count):
        return None, [f"{label} leaves its source native frame range"]
    return (start, end), []


def ref_errors(ref: Any, sources: Mapping[str, Mapping[str, Any]], label: str) -> tuple[Mapping[str, Any] | None, list[str]]:
    errors: list[str] = []
    if not equal_keys(ref, SOURCE_REF_KEYS):
        return None, [f"{label} must contain exactly source_id/sha256/relative_path"]
    source_id = ref["source_id"]
    source = sources.get(source_id) if isinstance(source_id, str) else None
    if source is None:
        return None, [f"{label}.source_id is absent from source_catalog"]
    if ref["sha256"] != source["sha256"] or ref["relative_path"] != source["relative_path"]:
        errors.append(f"{label} does not preserve catalog SHA-256/path provenance")
    return source, errors


def source_catalog_errors(catalog: Any) -> tuple[dict[str, dict[str, Any]], list[str]]:
    errors: list[str] = []
    sources: dict[str, dict[str, Any]] = {}
    if not isinstance(catalog, dict):
        return sources, ["source_catalog.json must be an object"]
    if catalog.get("schema") != SOURCE_CATALOG_SCHEMA:
        errors.append("source_catalog schema is wrong")
    if catalog.get("source_coordinate_authority") != "native direct WAV SHA-256 and frame coordinates":
        errors.append("source_catalog does not declare native SHA-256/frame authority")
    files = catalog.get("files")
    if not isinstance(files, list) or not files:
        return sources, errors + ["source_catalog.files must be a non-empty list"]
    for index, source in enumerate(files):
        location = f"source_catalog.files[{index}]"
        if not equal_keys(source, SOURCE_KEYS):
            errors.append(f"{location} has unexpected or missing provenance fields")
            continue
        source_id = source["source_id"]
        if not isinstance(source_id, str) or not SOURCE_ID_RE.fullmatch(source_id):
            errors.append(f"{location}.source_id is invalid")
        elif source_id in sources:
            errors.append(f"duplicate source_id {source_id!r}")
        if not isinstance(source["sha256"], str) or not SHA256_RE.fullmatch(source["sha256"]):
            errors.append(f"{location}.sha256 must be lower-case SHA-256")
        elif isinstance(source_id, str) and source_id != f"src_{source['sha256'][:16]}":
            errors.append(f"{location}.source_id is not derived from its SHA-256")
        if not safe_relative_path(source["relative_path"]):
            errors.append(f"{location}.relative_path is not safely root-relative")
        if not isinstance(source["source_role"], str) or not source["source_role"]:
            errors.append(f"{location}.source_role is required but is not a candidate label")
        rights = source["rights"]
        if not equal_keys(rights, {
            "status", "license_assertion", "training_or_distribution_requires_source_term_confirmation",
        }) or rights.get("status") != "unverified_local_rnd_only" \
                or rights.get("license_assertion") != "none" \
                or rights.get("training_or_distribution_requires_source_term_confirmation") is not True:
            errors.append(f"{location}.rights must retain the local-R&D-only source-term gate")
        native = source["native"]
        if not isinstance(native, dict):
            errors.append(f"{location}.native is missing")
            continue
        required_native = {
            "sample_rate_hz", "channels", "frame_count", "encoding", "bits_per_sample", "container_id",
            "analysis_mono_policy", "reader_descriptor",
        }
        if set(native) != required_native:
            errors.append(f"{location}.native must be the compact native reader descriptor")
            continue
        for field in ("sample_rate_hz", "channels", "frame_count", "bits_per_sample"):
            if not is_int(native[field]) or native[field] < 1:
                errors.append(f"{location}.native.{field} must be a positive native integer")
        if native["container_id"] not in {"RIFF", "RF64"}:
            errors.append(f"{location}.native.container_id is not a direct WAV container")
        policy = native["analysis_mono_policy"]
        if not isinstance(policy, dict) or policy.get("resampled") is not False or policy.get("timeline") != "native_sample_frames":
            errors.append(f"{location}.native analysis policy is not non-resampled native-frame analysis")
        descriptor = native["reader_descriptor"]
        if not isinstance(descriptor, dict):
            errors.append(f"{location}.native.reader_descriptor is missing")
        else:
            audio = descriptor.get("native_audio")
            if descriptor.get("sha256") != source["sha256"] or not isinstance(audio, dict):
                errors.append(f"{location}.native reader descriptor lost SHA-256/audio provenance")
            elif any(audio.get(field) != native[compact] for field, compact in (
                ("sample_rate_hz", "sample_rate_hz"), ("channels", "channels"), ("frame_count", "frame_count"),
            )):
                errors.append(f"{location}.native compact metadata disagrees with reader descriptor")
        if isinstance(source_id, str) and source_id not in sources:
            sources[source_id] = source
    return sources, errors


def candidate_errors(rows: list[dict[str, Any]], sources: Mapping[str, Mapping[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    errors: list[str] = []
    candidates: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        location = f"candidates.jsonl:{index + 1}"
        if not equal_keys(row, CANDIDATE_KEYS):
            errors.append(f"{location} must be candidate-only data; review/render fields do not belong here")
            continue
        if row.get("schema") != CANDIDATE_SCHEMA:
            errors.append(f"{location}.schema is wrong")
        candidate_id = row.get("candidate_id")
        match = CANDIDATE_ID_RE.fullmatch(candidate_id) if isinstance(candidate_id, str) else None
        if match is None:
            errors.append(f"{location}.candidate_id is invalid")
        elif candidate_id in candidates:
            errors.append(f"duplicate candidate_id {candidate_id!r}")
        source, ref_problems = ref_errors(row.get("source"), sources, f"{location}.source")
        errors.extend(ref_problems)
        if match is not None and source is not None and match.group(1) != source["source_id"]:
            errors.append(f"{location}.candidate_id does not belong to its source")
        region = row.get("region_frames")
        if not equal_keys(region, REGION_KEYS) or source is None:
            errors.append(f"{location}.region_frames is malformed")
        else:
            frame_count = int(source["native"]["frame_count"])
            start = region["context_start"]
            end = region["context_end"]
            boundary = region["proposed_boundary_window"]
            if not is_int(start) or not is_int(end) or not (0 <= start < end <= frame_count):
                errors.append(f"{location}.context is outside native source frames")
            pair, pair_errors = frame_pair(boundary, frame_count=frame_count, label=f"{location}.proposed_boundary_window")
            errors.extend(pair_errors)
            center = region["boundary_center"]
            if not is_int(center) or not (start <= center < end):
                errors.append(f"{location}.boundary_center is not inside its raw context crop")
            if pair is not None and is_int(start) and is_int(end) and not (start <= pair[0] <= center < pair[1] <= end):
                errors.append(f"{location}.proposed boundary is not inside its raw context crop")
        evidence = row.get("auto_evidence")
        if not equal_keys(evidence, AUTO_EVIDENCE_KEYS):
            errors.append(f"{location}.auto_evidence is incomplete")
        else:
            numeric_fields = AUTO_EVIDENCE_KEYS - {"detector_class"}
            if any(not finite_number(evidence[field]) for field in numeric_fields):
                errors.append(f"{location}.auto_evidence must be finite numeric proxy data")
            if not is_int(evidence["analysis_frame_index"]) or evidence["analysis_frame_index"] < 0:
                errors.append(f"{location}.analysis_frame_index must be a native-analysis integer")
            if evidence["detector_class"] not in {"f0_change_candidate", "same_pitch_onset_candidate"}:
                errors.append(f"{location}.detector_class is not a declared non-musical candidate class")
            if finite_number(evidence["voicing_confidence"]) and not 0 <= float(evidence["voicing_confidence"]) <= 1:
                errors.append(f"{location}.voicing_confidence is outside [0,1]")
        if row.get("status") != "unreviewed" or row.get("automatic_detection_is_not_a_musical_gesture_label") is not True:
            errors.append(f"{location} is not explicitly an unreviewed non-musical proposal")
        if isinstance(candidate_id, str) and candidate_id not in candidates:
            candidates[candidate_id] = row
    return candidates, errors


def label_template_errors(rows: list[dict[str, Any]], candidates: Mapping[str, Mapping[str, Any]],
                          sources: Mapping[str, Mapping[str, Any]]) -> list[str]:
    errors: list[str] = []
    template_ids: set[str] = set()
    for index, row in enumerate(rows):
        location = f"labels.template.jsonl:{index + 1}"
        if not equal_keys(row, LABEL_KEYS):
            errors.append(f"{location} has unexpected/missing label fields")
            continue
        candidate_id = row.get("candidate_id")
        candidate = candidates.get(candidate_id) if isinstance(candidate_id, str) else None
        if candidate is None:
            errors.append(f"{location}.candidate_id does not resolve to a generated candidate")
            continue
        if candidate_id in template_ids:
            errors.append(f"{location} duplicates a candidate label template")
        template_ids.add(candidate_id)
        if row.get("schema") != LABEL_SCHEMA or row.get("label_id") != "":
            errors.append(f"{location} is not a blank R&D-06 label template")
        _, ref_problems = ref_errors(row.get("source"), sources, f"{location}.source")
        errors.extend(ref_problems)
        if row.get("source") != candidate.get("source"):
            errors.append(f"{location} does not preserve its candidate source identity")
        frames = row.get("frames")
        if not equal_keys(frames, FRAME_KEYS):
            errors.append(f"{location}.frames is malformed")
        else:
            region = candidate["region_frames"]
            expected = {
                "clip": [region["context_start"], region["context_end"]],
                "pre_stable": [],
                "transition": region["proposed_boundary_window"],
                "post_stable": [],
            }
            if frames != expected:
                errors.append(f"{location} is not an unmodified native-frame candidate template")
        gesture = row.get("gesture")
        review = row.get("review")
        if not equal_keys(gesture, GESTURE_KEYS) or gesture.get("class") != "unreviewed":
            errors.append(f"{location} pre-labels a musical gesture")
        if not equal_keys(review, REVIEW_KEYS) or review.get("state") != "unreviewed" \
                or review.get("retrieval_eligible") is not False or review.get("expression_eligible") is not False:
            errors.append(f"{location} pre-authorizes an unreviewed candidate")
    if set(candidates) != template_ids:
        errors.append("labels.template.jsonl must provide exactly one unreviewed template per candidate")
    return errors


def approved_frame_errors(frames: Any, *, frame_count: int, location: str) -> tuple[dict[str, tuple[int, int]], list[str]]:
    errors: list[str] = []
    result: dict[str, tuple[int, int]] = {}
    if not equal_keys(frames, FRAME_KEYS):
        return result, [f"{location} must contain clip/pre_stable/transition/post_stable"]
    for key in ("clip", "pre_stable", "transition", "post_stable"):
        pair, pair_errors = frame_pair(frames[key], frame_count=frame_count, label=f"{location}.{key}")
        errors.extend(pair_errors)
        if pair is not None:
            result[key] = pair
    if len(result) == 4:
        clip, pre, transition, post = (result[key] for key in ("clip", "pre_stable", "transition", "post_stable"))
        if not (
            clip[0] == pre[0] < pre[1] == transition[0]
            < transition[1] == post[0] < post[1] == clip[1]
        ):
            errors.append(f"{location} does not partition one contiguous native-source span")
    return result, errors


def anchors_by_region(value: Any) -> dict[str, float]:
    anchors: dict[str, float] = {}
    if not isinstance(value, list):
        return anchors
    for item in value:
        if isinstance(item, dict) and isinstance(item.get("region"), str) and finite_number(item.get("midi")):
            anchors[item["region"]] = float(item["midi"])
    return anchors


def approved_bank_errors(rows: list[dict[str, Any]], candidates: Mapping[str, Mapping[str, Any]],
                         sources: Mapping[str, Mapping[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    errors: list[str] = []
    bank_by_label: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        location = f"transition_bank.jsonl:{index + 1}"
        if not equal_keys(row, LABEL_KEYS):
            errors.append(f"{location} has unexpected/missing approved-transition fields")
            continue
        if row.get("schema") != APPROVED_TRANSITION_SCHEMA:
            errors.append(f"{location}.schema is wrong")
        label_id = row.get("label_id")
        if not isinstance(label_id, str) or not label_id.strip():
            errors.append(f"{location}.label_id must be non-empty after approval")
        elif label_id in bank_by_label:
            errors.append(f"duplicate approved label_id {label_id!r}")
        candidate_id = row.get("candidate_id")
        candidate = candidates.get(candidate_id) if isinstance(candidate_id, str) else None
        if candidate is None:
            errors.append(f"{location}.candidate_id does not resolve to an unreviewed source candidate")
        source, ref_problems = ref_errors(row.get("source"), sources, f"{location}.source")
        errors.extend(ref_problems)
        if source is None or candidate is None:
            continue
        if row["source"] != candidate["source"]:
            errors.append(f"{location} loses candidate-to-source provenance")
        frame_count = int(source["native"]["frame_count"])
        spans, span_errors = approved_frame_errors(row.get("frames"), frame_count=frame_count, location=f"{location}.frames")
        errors.extend(span_errors)
        candidate_region = candidate["region_frames"]
        if "clip" in spans and not (candidate_region["context_start"] <= spans["clip"][0] < spans["clip"][1] <= candidate_region["context_end"]):
            errors.append(f"{location}.clip must remain inside the candidate's contiguous raw context")
        if "transition" in spans and not (spans["transition"][0] <= candidate_region["boundary_center"] < spans["transition"][1]):
            errors.append(f"{location}.transition must contain the candidate boundary center")
        gesture = row.get("gesture")
        review = row.get("review")
        if not equal_keys(gesture, GESTURE_KEYS) or gesture.get("class") != "continuous_pitch_change":
            errors.append(f"{location} is not an explicit human-approved continuous pitch change")
        if not equal_keys(review, REVIEW_KEYS) or review.get("state") != "approved" \
                or review.get("retrieval_eligible") is not True \
                or not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip():
            errors.append(f"{location} lacks approved reviewer/retrieval authorization")
        anchors = anchors_by_region(row.get("pitch_anchors"))
        if not {"pre_stable", "post_stable"}.issubset(anchors):
            errors.append(f"{location} needs human pre_stable/post_stable MIDI anchors")
        if isinstance(label_id, str) and label_id.strip() and label_id not in bank_by_label:
            bank_by_label[label_id] = row
    return bank_by_label, errors


def expression_errors(rows: list[dict[str, Any]], candidates: Mapping[str, Mapping[str, Any]],
                      sources: Mapping[str, Mapping[str, Any]], bundle: Path) -> list[str]:
    errors: list[str] = []
    labels: set[str] = set()
    for index, row in enumerate(rows):
        location = f"expression_manifest.jsonl:{index + 1}"
        if not equal_keys(row, EXPRESSION_KEYS):
            errors.append(f"{location} has unexpected/missing expression fields")
            continue
        if row.get("schema") != EXPRESSION_SCHEMA:
            errors.append(f"{location}.schema is wrong")
        label_id = row.get("label_id")
        if not isinstance(label_id, str) or not label_id.strip() or label_id in labels:
            errors.append(f"{location}.label_id must be unique and non-empty")
        labels.add(label_id) if isinstance(label_id, str) else None
        candidate_id = row.get("candidate_id")
        candidate = candidates.get(candidate_id) if isinstance(candidate_id, str) else None
        if candidate is None:
            errors.append(f"{location}.candidate_id does not resolve to a generated source candidate")
        source, ref_problems = ref_errors(row.get("source"), sources, f"{location}.source")
        errors.extend(ref_problems)
        if source is None or candidate is None:
            continue
        if row["source"] != candidate["source"]:
            errors.append(f"{location} loses candidate-to-source provenance")
        clip, pair_errors = frame_pair(row.get("clip_frames"), frame_count=int(source["native"]["frame_count"]),
                                       label=f"{location}.clip_frames")
        errors.extend(pair_errors)
        if clip is not None:
            region = candidate["region_frames"]
            if not (region["context_start"] <= clip[0] < clip[1] <= region["context_end"]):
                errors.append(f"{location}.clip_frames leave the candidate's raw context")
        gesture_class = row.get("gesture_class")
        if gesture_class not in GESTURE_CLASSES - {"not_a_transition"}:
            errors.append(f"{location}.gesture_class is not an explicit approved human class")
        anchors = anchors_by_region(row.get("pitch_anchors"))
        if not {"pre_stable", "post_stable"}.issubset(anchors):
            errors.append(f"{location}.pitch_anchors needs human pre_stable/post_stable MIDI anchors")
        review = row.get("review")
        if not equal_keys(review, REVIEW_KEYS) or review.get("state") != "approved" \
                or review.get("expression_eligible") is not True \
                or not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip():
            errors.append(f"{location} lacks approved reviewer/expression authorization")
        feature_file = row.get("feature_file")
        expected_feature = f"features/{source['source_id']}.npz"
        if feature_file != expected_feature or not safe_relative_path(feature_file) or not (bundle / expected_feature).is_file():
            errors.append(f"{location}.feature_file is not the matching local feature cache")
        if row.get("take_split_key") != source["source_id"]:
            errors.append(f"{location}.take_split_key must preserve source take identity")
    return errors


def coverage_errors(coverage: Any, bank: Mapping[str, Mapping[str, Any]],
                    expression_rows: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    if not isinstance(coverage, dict) or coverage.get("schema") != COVERAGE_SCHEMA:
        return ["coverage.json schema is wrong"]
    if coverage.get("unreviewed_candidates_do_not_close_coverage") is not True:
        errors.append("coverage.json permits unreviewed candidates to close coverage")
    rows = coverage.get("targets")
    if not isinstance(rows, list):
        return errors + ["coverage.json.targets must be a list"]
    seen: set[str] = set()
    expression_by_label = {
        row.get("label_id"): row for row in expression_rows
        if isinstance(row.get("label_id"), str)
    }
    for index, row in enumerate(rows):
        location = f"coverage.json.targets[{index}]"
        if not isinstance(row, dict):
            errors.append(f"{location} is not an object")
            continue
        try:
            target_id = str(row["target_id"])
            from_midi = float(row["from_midi"])
            to_midi = float(row["to_midi"])
            required_capability = str(row["required_capability"])
            gesture_classes = set(row["gesture_classes"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"{location} has no valid target edge")
            continue
        expected = COVERAGE_TARGETS.get(target_id)
        if target_id in seen:
            errors.append(f"duplicate coverage target {target_id!r}")
        seen.add(target_id)
        if expected is None or (from_midi, to_midi, required_capability, gesture_classes) != (
            expected["from_midi"], expected["to_midi"], expected["required_capability"], expected["gesture_classes"],
        ):
            errors.append(f"{location} does not match the R&D-06 target/capability contract")
        status = row.get("status")
        label_ids = row.get("approved_label_ids")
        missing_status = (
            "missing_native_transition" if required_capability == "transition_retrieval"
            else "missing_native_expression_evidence"
        )
        covered_status = (
            "covered_by_approved_native_transition" if required_capability == "transition_retrieval"
            else "covered_by_approved_native_expression_evidence"
        )
        if status not in {missing_status, covered_status} or not isinstance(label_ids, list):
            errors.append(f"{location} has invalid coverage status")
            continue
        if status == missing_status and label_ids:
            errors.append(f"{location} says missing but names approved labels")
        if status == covered_status:
            if not label_ids:
                errors.append(f"{location} calls an empty label set coverage")
            for label_id in label_ids:
                record = bank.get(label_id) if required_capability == "transition_retrieval" else expression_by_label.get(label_id)
                if record is None:
                    expected_artifact = "transition_bank.jsonl" if required_capability == "transition_retrieval" else "expression_manifest.jsonl"
                    errors.append(f"{location} cites label {label_id!r} outside {expected_artifact}")
                    continue
                if required_capability == "transition_retrieval" and record.get("gesture", {}).get("class") != "continuous_pitch_change":
                    errors.append(f"{location} treats a non-continuous gesture as transition retrieval")
                if required_capability == "expression_articulation" and record.get("gesture_class") not in gesture_classes:
                    errors.append(f"{location} expression label gesture does not match its target")
                anchors = anchors_by_region(record.get("pitch_anchors"))
                if abs(anchors.get("pre_stable", math.inf) - from_midi) > 0.5 \
                        or abs(anchors.get("post_stable", math.inf) - to_midi) > 0.5:
                    errors.append(f"{location} cites an approved label with different MIDI anchors")
    if seen != set(COVERAGE_TARGETS):
        errors.append("coverage.json target grid does not match the R&D-06 score coverage contract")
    return errors


def provenance_errors(provenance: Any, *, source_count: int, candidate_count: int,
                      bank_count: int, expression_count: int,
                      bank: Mapping[str, Mapping[str, Any]], expression_rows: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    if not isinstance(provenance, dict):
        return ["provenance.json must be an object"]
    expected = {
        "schema": SCHEMA_ROOT,
        "actual_direct_wav_read": True,
        "raw_source_modified": False,
        "source_root_not_embedded": True,
        "automatic_candidates_are_unreviewed": True,
        "source_catalog": "source_catalog.json",
        "labels_template": "labels.template.jsonl",
    }
    for key, value in expected.items():
        if provenance.get(key) != value:
            errors.append(f"provenance.json.{key} violates the R&D-06 policy")
    counts = {
        "candidate_count": candidate_count,
        "approved_transition_count": bank_count,
        "expression_training_item_count": expression_count,
    }
    for key, value in counts.items():
        if provenance.get(key) != value:
            errors.append(f"provenance.json.{key} disagrees with generated artifacts")
    approved_ids = set(bank) | {
        row.get("label_id") for row in expression_rows if isinstance(row.get("label_id"), str)
    }
    approved_count = provenance.get("approved_label_count")
    if not is_int(approved_count) or approved_count < len(approved_ids):
        errors.append("provenance.json.approved_label_count cannot account for generated approved evidence")
    feature_files = provenance.get("feature_files")
    if not isinstance(feature_files, list) or len(feature_files) != source_count:
        errors.append("provenance.json.feature_files does not cover the direct source catalog")
    policy = provenance.get("review_policy")
    if not isinstance(policy, dict) or policy.get("no_per_candidate_gain_pitch_or_time_processing") is not True:
        errors.append("provenance.json does not forbid processed review crops")
    rights = provenance.get("rights_policy")
    if not equal_keys(rights, {
        "status", "license_assertion", "training_or_distribution_requires_source_term_confirmation",
    }) or rights.get("status") != "unverified_local_rnd_only" \
            or rights.get("license_assertion") != "none" \
            or rights.get("training_or_distribution_requires_source_term_confirmation") is not True:
        errors.append("provenance.json.rights_policy lost the local-R&D-only source-term gate")
    source_policy = provenance.get("source_policy")
    if not isinstance(source_policy, dict) or source_policy.get("direct_wav_only") is not True \
            or source_policy.get("original_source_resampling_or_normalization") != "forbidden" \
            or source_policy.get("absolute_source_paths_in_output") != "forbidden":
        errors.append("provenance.json.source_policy no longer protects direct source identity")
    reproducibility = provenance.get("reproducibility")
    if not isinstance(reproducibility, dict):
        errors.append("provenance.json.reproducibility is missing")
    else:
        for key in ("builder_sha256", "native_wav_reader_sha256"):
            if not isinstance(reproducibility.get(key), str) or not SHA256_RE.fullmatch(reproducibility[key]):
                errors.append(f"provenance.json.reproducibility.{key} is not SHA-256")
        if not isinstance(reproducibility.get("python_version"), str) or not reproducibility["python_version"]:
            errors.append("provenance.json.reproducibility.python_version is missing")
        dependencies = reproducibility.get("analysis_dependency_versions")
        if not isinstance(dependencies, dict) or not all(isinstance(dependencies.get(key), str) and dependencies[key]
                                                        for key in ("numpy", "scipy")):
            errors.append("provenance.json.reproducibility lacks NumPy/SciPy versions")
        config = reproducibility.get("candidate_detector_config")
        required_config = {
            "feature_hop_s", "feature_window_s", "feature_working_rate_hz", "f0_range_hz",
            "minimum_voicing_confidence", "pitch_change_minimum_step_cents", "same_pitch_maximum_step_cents",
            "same_pitch_onset_flux_quantile", "same_pitch_minimum_relative_valley_db",
            "minimum_candidate_gap_s", "context_s_each_side", "boundary_half_window_s",
        }
        if not isinstance(config, dict) or not required_config <= set(config):
            errors.append("provenance.json.reproducibility lacks the detector configuration")
        labels = reproducibility.get("labels")
        if not isinstance(labels, dict) or type(labels.get("supplied")) is not bool \
                or not is_int(labels.get("record_count")) or labels["record_count"] < 0:
            errors.append("provenance.json.reproducibility.labels is malformed")
        elif labels["supplied"]:
            if not isinstance(labels.get("sha256"), str) or not SHA256_RE.fullmatch(labels["sha256"]):
                errors.append("provenance.json labels provenance lacks supplied-label SHA-256")
        elif labels.get("sha256") is not None or labels["record_count"] != 0:
            errors.append("provenance.json labels provenance claims unsupplied labels")
    return errors


def bundle_errors(bundle: Path) -> list[str]:
    errors: list[str] = []
    required = (
        "source_catalog.json", "candidates.jsonl", "labels.template.jsonl", "transition_bank.jsonl",
        "expression_manifest.jsonl", "coverage.json", "provenance.json",
    )
    if not bundle.is_dir():
        return [f"bundle does not exist or is not a directory: {bundle}"]
    missing = [name for name in required if not (bundle / name).is_file()]
    if missing:
        return [f"bundle is missing required artifact(s): {', '.join(missing)}"]
    try:
        catalog = read_json(bundle / "source_catalog.json")
        candidates_rows = read_jsonl(bundle / "candidates.jsonl")
        template_rows = read_jsonl(bundle / "labels.template.jsonl")
        bank_rows = read_jsonl(bundle / "transition_bank.jsonl")
        expression_rows = read_jsonl(bundle / "expression_manifest.jsonl")
        coverage = read_json(bundle / "coverage.json")
        provenance = read_json(bundle / "provenance.json")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return [str(exc)]

    # A literal root can differ across hosts, so scan all text rather than
    # relying on one machine-specific path value.
    named_values = {
        "source_catalog.json": catalog,
        "candidates.jsonl": candidates_rows,
        "labels.template.jsonl": template_rows,
        "transition_bank.jsonl": bank_rows,
        "expression_manifest.jsonl": expression_rows,
        "coverage.json": coverage,
        "provenance.json": provenance,
    }
    for filename, value in named_values.items():
        for location, string in walk_strings(value, filename):
            if is_path_leak(string):
                errors.append(f"absolute/local source path leaked at {location}: {string!r}")

    sources, source_problems = source_catalog_errors(catalog)
    errors.extend(source_problems)
    candidates, candidate_problems = candidate_errors(candidates_rows, sources)
    errors.extend(candidate_problems)
    errors.extend(label_template_errors(template_rows, candidates, sources))
    bank, bank_problems = approved_bank_errors(bank_rows, candidates, sources)
    errors.extend(bank_problems)
    errors.extend(expression_errors(expression_rows, candidates, sources, bundle))
    errors.extend(coverage_errors(coverage, bank, expression_rows))
    errors.extend(provenance_errors(
        provenance,
        source_count=len(sources),
        candidate_count=len(candidates_rows),
        bank_count=len(bank_rows),
        expression_count=len(expression_rows),
        bank=bank,
        expression_rows=expression_rows,
    ))
    return errors


def protected_runtime_changes() -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", *RUNTIME_PROTECTED_PATHS],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return [f"git diff failed: {result.stderr.strip()}"]
    return [line for line in result.stdout.splitlines() if line]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path,
                        help="actual fresh R&D-06 output directory to validate in addition to static contracts")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    print("=== BGM R&D-06 — Daegeum transition-bank contract ===\n")
    try:
        schema = read_json(SCHEMA)
        builder_source = BUILDER.read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  ✗ cannot load R&D-06 contract files — {exc}")
        return 1

    definitions = schema.get("$defs", {}) if isinstance(schema, dict) else {}
    check(
        schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"
        and {"source_catalog", "candidate", "label", "approved_transition", "expression_manifest", "coverage", "provenance"}
        <= set(definitions),
        "① schema names every separate catalog/candidate/label/bank artifact",
    )
    source_schema = definitions.get("source_item", {})
    native_schema = definitions.get("native_provenance", {})
    check(
        source_schema.get("additionalProperties") is False
        and {"sha256", "relative_path", "rights", "native"} <= set(source_schema.get("required", []))
        and {"sample_rate_hz", "frame_count", "reader_descriptor"} <= set(native_schema.get("required", [])),
        "② source provenance fixes SHA-256, portable path, rights gate, and native frame authority",
    )
    candidate_schema = definitions.get("candidate", {})
    check(
        candidate_schema.get("properties", {}).get("status", {}).get("const") == "unreviewed"
        and candidate_schema.get("properties", {}).get("automatic_detection_is_not_a_musical_gesture_label", {}).get("const") is True
        and "boundary_center" in candidate_schema.get("properties", {}).get("region_frames", {}).get("required", [])
        and "review" not in candidate_schema.get("properties", {}),
        "③ automatic candidates cannot be reviews or renderer authorizations",
    )
    approved_schema = definitions.get("approved_transition", {})
    expression_schema = definitions.get("expression_manifest", {})
    check(
        approved_schema.get("properties", {}).get("schema", {}).get("const") == APPROVED_TRANSITION_SCHEMA
        and {"label_id", "candidate_id", "pitch_anchors", "review"} <= set(approved_schema.get("required", []))
        and expression_schema.get("properties", {}).get("schema", {}).get("const") == EXPRESSION_SCHEMA
        and {"candidate_id", "pitch_anchors", "review"} <= set(expression_schema.get("required", [])),
        "④ approved retrieval and expression evidence remain distinct JSONL records",
    )
    required_outputs = {
        "source_catalog.json", "candidates.jsonl", "labels.template.jsonl", "transition_bank.jsonl",
        "expression_manifest.jsonl", "coverage.json", "provenance.json",
    }
    check(
        required_outputs <= {match.group(1) for match in re.finditer(r'"([^" ]+\.(?:json|jsonl))"', builder_source)},
        "⑤ builder declares the complete separate-artifact bundle",
    )
    check(
        all(token in builder_source for token in (
            "automatic_detection_is_not_a_musical_gesture_label", "continuous_pitch_change",
            "retrieval_eligible", "pre_stable", "post_stable", "reviewer",
        )),
        "⑥ builder carries explicit unreviewed, continuous-retrieval, anchor, and reviewer policy",
    )
    runtime_changes = protected_runtime_changes()
    check(
        not runtime_changes,
        "⑦ R&D-06 has not changed browser runtime or the 13 default BGM assets",
        ", ".join(runtime_changes),
    )

    if args.bundle is None:
        check(True, "⑧ static contract is dependency-free; pass --bundle for an actual R&D output audit")
    else:
        problems = bundle_errors(args.bundle.resolve())
        check(
            not problems,
            "⑧ generated bundle preserves source lineage, native frames, approval gate, and no-path-leak policy",
            "; ".join(problems[:12]) + (f" (+{len(problems) - 12} more)" if len(problems) > 12 else ""),
        )

    print(f"\n=== PASS {passed} / FAIL {failed} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
