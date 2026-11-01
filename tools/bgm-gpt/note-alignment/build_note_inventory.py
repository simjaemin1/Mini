#!/usr/bin/env python3
"""Read every predeclared TRAIN MIDI into compact nominal notes, not labels.

No WAV payload/header/SHA read, acoustic alignment, extraction or output-file
write. Exact MIDI member CRC/SHA and immutable source archive identity remain
checked through the frozen read-only auditor. JSON is emitted only to stdout.
"""
import sys
sys.dont_write_bytecode = True

from collections import Counter
import base64
import hashlib
import json
from pathlib import Path
import time
import zlib

import audit_note_pairs as audit

MAX_REPORT_BYTES = 1_000_000
MAX_DECODED_BYTES = 8_000_000
DECODED_SCHEMA = "mini.private-TRAIN-nominal-note-inventory.v1"
PACKED_SCHEMA = "mini.private-TRAIN-nominal-note-inventory-packed.v1"
NOTE_COLUMNS = ["start_tick", "end_tick", "start_seconds", "end_seconds", "track", "channel", "pitch",
    "velocity", "status", "release_velocity", "note_index", "duration_seconds", "note_off_kind"]
SHARED_KEYS = ("schema", "status", "tempo_policy", "time_integration", "note_pairing_policy", "limits",
    "acoustic_alignment_validated", "solo_verified", "note_pitch_is_nominal_not_performed_F0", "audio_or_model_loaded")


def choose_all_training(manifest, split, manifest_sha256):
    count = split.get("training_song_groups")
    if type(count) is not int or count != 15 or split.get("training_wavs") != 216 or split.get("heldout_wavs") != 34:
        raise ValueError("frozen216TRAIN34heldout15training_groups_required")
    representatives = audit.choose_records(manifest, split, manifest_sha256, count=count)
    training = set(split["training_files"])
    chosen = [row for row in manifest["records"] if row["output_file"] in training]
    if len(chosen) != 216 or len({r["song_index"] for r in chosen}) != len(representatives):
        raise ValueError("all_predeclared_training_records_required")
    for record in chosen:
        value = record.get("output_sha256")
        if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise ValueError("manifest_declared_prepared_WAV_SHA_required_not_reverified")
    return chosen


def compact_notes(parsed):
    notes = parsed.get("notes", [])
    if any(set(row) != set(NOTE_COLUMNS) for row in notes):
        raise ValueError("frozen_parser_note_columns_changed_no_silent_field_loss")
    return [[row[key] for key in NOTE_COLUMNS] for row in notes]


def encoded_report(report):
    if not isinstance(report, dict) or report.get("schema") != DECODED_SCHEMA:
        raise ValueError("complete_nominal_inventory_schema_required")
    decoded = json.dumps(report, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
    if len(decoded) > MAX_DECODED_BYTES:
        raise ValueError("eight_MB_decoded_inventory_limit_no_notes_dropped")
    envelope = dict(schema=PACKED_SCHEMA, decoded_schema=DECODED_SCHEMA, decoded_bytes=len(decoded),
        decoded_sha256=hashlib.sha256(decoded).hexdigest(), compression="zlib/base64",
        payload_base64=base64.b64encode(zlib.compress(decoded)).decode("ascii"))
    payload = json.dumps(envelope, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if len(payload.encode()) + 1 > MAX_REPORT_BYTES:  # final stdout newline
        raise ValueError("one_MB_packed_inventory_limit_no_notes_dropped")
    return payload


def decode_report(payload):
    """Bounded lossless decoder; no data/file/model access or silent truncation."""
    if not isinstance(payload, str) or len(payload.encode()) > MAX_REPORT_BYTES:
        raise ValueError("bounded_one_MB_packed_JSON_string_required")
    envelope = json.loads(payload)
    keys = {"schema", "decoded_schema", "decoded_bytes", "decoded_sha256", "compression", "payload_base64"}
    if (not isinstance(envelope, dict) or set(envelope) != keys or envelope.get("schema") != PACKED_SCHEMA
            or envelope.get("decoded_schema") != DECODED_SCHEMA or envelope.get("compression") != "zlib/base64"
            or type(envelope.get("decoded_bytes")) is not int or not 0 < envelope["decoded_bytes"] <= MAX_DECODED_BYTES
            or not isinstance(envelope.get("decoded_sha256"), str) or len(envelope["decoded_sha256"]) != 64
            or not isinstance(envelope.get("payload_base64"), str)):
        raise ValueError("exact_bounded_packed_inventory_envelope_required")
    try:
        compressed = base64.b64decode(envelope["payload_base64"], validate=True)
        decoder = zlib.decompressobj()
        decoded = decoder.decompress(compressed, MAX_DECODED_BYTES + 1)
    except (ValueError, zlib.error) as error:
        raise ValueError("valid_base64_zlib_inventory_required") from error
    if (len(decoded) > MAX_DECODED_BYTES or decoder.unconsumed_tail or not decoder.eof or decoder.unused_data
            or len(decoded) != envelope["decoded_bytes"]):
        raise ValueError("complete_zlib_stream_without_trailing_data_and_exact_decoded_size_required")
    if hashlib.sha256(decoded).hexdigest() != envelope["decoded_sha256"]:
        raise ValueError("decoded_inventory_SHA256_mismatch")
    report = json.loads(decoded)
    if not isinstance(report, dict) or report.get("schema") != DECODED_SCHEMA:
        raise ValueError("decoded_nominal_inventory_schema_required")
    return report


def build(prepared_manifest, split_path, source_tar):
    if "torch" in sys.modules:
        raise ValueError("fresh_noTorch_metadata_only_process_required")
    with audit.ReadOnlyBudget() as budget:
        manifest_path, split_path, source_tar = map(Path, (prepared_manifest, split_path, source_tar))
        manifest, split = audit.read_json(manifest_path), audit.read_json(split_path)
        code = [Path(__file__), Path(audit.__file__), Path(audit.parse_midi.__file__), Path(audit.source.__file__),
            audit.HERE.parent / "aihub-readiness/inspect_source_tar.py"]
        bindings = {str(path.resolve()): audit.sha256(path) for path in [manifest_path, split_path, *code]}
        selected = choose_all_training(manifest, split, bindings[str(manifest_path.resolve())])
        identity = audit.archive_identity(source_tar)
        cases, shared, by_title, totals = [], {}, {}, Counter()
        warnings = Counter()
        for expected, yielded in zip(selected, audit.read_midis(source_tar, selected), strict=True):
            record, raw, member = yielded
            if record != expected:
                raise ValueError("manifest_training_order_or_case_changed")
            title = by_title.setdefault(record["song_index"], dict(song_index=record["song_index"], files=0,
                parsed_files=0, parse_refused_files=0, nominal_score_candidates=0, note_on_count=0, paired_note_count=0))
            title["files"] += 1
            case = dict(sample=record["output_file"], source_stem=record["source_stem"], song_index=record["song_index"],
                split="training", source_MIDI=member, prepared_WAV_SHA_manifest_declared=record["output_sha256"],
                prepared_WAV_SHA_independently_reverified_this_phase=False)
            try:
                parsed = audit.parse_midi.parse_midi(raw)
            except audit.parse_midi.MidiParseError as error:
                case.update(status="MIDI_parse_refused_case_preserved", error_category=str(error),
                    eligible_nominal_score=False, note_rows=[], parsed_metadata=None)
                title["parse_refused_files"] += 1
                totals["parse_refused_files"] += 1
            else:
                shared_now = {key: parsed[key] for key in SHARED_KEYS if key in parsed}
                if not shared:
                    shared = shared_now
                case.update(status="parsed_nominal_notes_not_acoustically_aligned", note_rows=compact_notes(parsed),
                    parsed_metadata={key: value for key, value in parsed.items()
                        if key != "notes" and (key not in shared or value != shared[key])},
                    shared_parser_metadata_applies=True, eligible_nominal_score=parsed.get("alignment_candidate") is True)
                title["parsed_files"] += 1
                title["nominal_score_candidates"] += case["eligible_nominal_score"]
                title["note_on_count"] += parsed["note_on_count"]
                title["paired_note_count"] += parsed["paired_note_count"]
                totals["parsed_files"] += 1
                totals["eligible_nominal_score_count"] += case["eligible_nominal_score"]
                totals["note_on_count"] += parsed["note_on_count"]
                totals["paired_note_count"] += parsed["paired_note_count"]
                totals["unmatched_note_on_count"] += parsed["unmatched_note_on_count"]
                totals["unmatched_note_off_count"] += parsed["unmatched_note_off_count"]
                for warning in parsed["warnings"]:
                    warnings[warning["code"]] += warning["count"]
            cases.append(case)
        if len(cases) != 216 or sum(r["files"] for r in by_title.values()) != 216:
            raise ValueError("all216_fixed_cases_must_be_preserved")
        if any(audit.sha256(path) != digest for path, digest in bindings.items()) or audit.archive_identity(source_tar) != identity:
            raise ValueError("bound_source_code_or_archive_changed")
        report = dict(schema="mini.private-TRAIN-nominal-note-inventory.v1", status="nominal_score_inventory_not_audio_alignment",
            source_credit=audit.SOURCE_CREDIT, note_columns=NOTE_COLUMNS, shared_parser_metadata=shared,
            training_files_read=216, training_song_groups=15, heldout_files_read=0, heldout_files_preserved=34,
            selection="ALL existing training filenames in original prepared-manifest order; no replacement for parser refusal",
            input_bindings=bindings, source_tar_path=str(source_tar),
            source_tar_identity_before_after={key: str(value) for key, value in identity.items()},
            archive_identity_integers_serialized_as_decimal_strings=True,
            complete_source_tar_SHA_computed=False, exact_selected_MIDI_payloads_hashed=True,
            MIDI_member_CRC_checked=True, prepared_WAV_payloads_read=0, prepared_WAV_headers_read=0,
            prepared_WAV_hashes_independently_reverified_this_phase=False, prepared_WAV_hashes_are_manifest_declarations=True,
            totals=dict(totals), warnings_total=dict(warnings), by_song_index=list(by_title.values()), cases=cases,
            aligned_training_pairs_approved=0, acoustic_alignment_validated=False, training_accepted=False,
            existing_split_changed=False, audio_or_model_loaded=False, Torch_imported=False, GPU_used=False,
            optimizer_updates=0, output_files_written=0, original_files_modified=False,
            max_report_bytes=MAX_REPORT_BYTES, max_report_bytes_applies_to_packed_stdout_envelope=True,
            max_decoded_report_bytes=MAX_DECODED_BYTES, lossless_report_compression="zlib/base64",
            elapsed_seconds=time.monotonic() - budget.started,
            limits=["Nominal MIDI note events are not synchronized acoustic training labels or verified solo daegeum.",
                "All notes/tracks/channels, unmatched events, pedal/bends/controllers, tempo/meta and warnings are retained.",
                "End-of-track duration includes possible trailing silence; duration difference alone is not tempo evidence.",
                "Only selected MIDI members are CRC/SHA checked; prepared WAV hashes remain declarations, not newly reverified.",
                "No waveform, feature extraction, alignment search, model, training or render occurs in this phase."])
        encoded_report(report)
        return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared-manifest", required=True, type=Path)
    parser.add_argument("--split", required=True, type=Path)
    parser.add_argument("--source-tar", required=True, type=Path)
    args = parser.parse_args()
    print(encoded_report(build(args.prepared_manifest, args.split, args.source_tar)))
