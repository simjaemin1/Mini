#!/usr/bin/env python3
"""Read-only completeness audit for the National Gugak Center finish.py run."""

import argparse
from collections import Counter, defaultdict
import csv
import json
import os
from pathlib import Path


KINDS = {
    "extend": ("gugak_manifest_extend.json", "id", "확장"),
    "phrase": ("gugak_manifest_phrase_full.json", "phraseCd", "악구"),
}
AUDIO_EXTS = {".flac", ".wv", ".wav", ".mp3", ".m4a"}


def inventory(root, kind, organized_name):
    found = defaultdict(set)
    places = [root / "raw" / kind, root / "정리" / organized_name]
    for place in places:
        if not place.exists():
            continue
        for folder, _, files in os.walk(place):
            for filename in files:
                if ".part" in filename or filename.startswith("."):
                    continue
                stem, ext = os.path.splitext(filename)
                ext = ext.lower()
                if ext not in AUDIO_EXTS:
                    continue
                if kind == "phrase" and "__" in stem:
                    stem = stem.split("__", 1)[0]
                found[stem.lower()].add(ext)
    return found


def map_rows(path):
    found = {}
    if not path.exists():
        return found
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            fields = line.rstrip("\n").split("\t")
            if len(fields) != 3:
                continue
            source_id, filename, wav_tag = fields
            if filename:
                found[source_id] = (filename, wav_tag)
            elif source_id not in found:
                found[source_id] = ("", wav_tag)
    return found


def check_kind(root, kind, manifest_name, id_key, organized_name):
    manifest = json.loads((root / manifest_name).read_text(encoding="utf-8"))
    ids = [str(row[id_key]) for row in manifest]
    mapping = map_rows(root / "tools" / f".map_{kind}.tsv")
    files = inventory(root, kind, organized_name)
    missing_map = [source_id for source_id in ids if source_id not in mapping]
    blank_map = [source_id for source_id in ids if source_id in mapping and not mapping[source_id][0]]
    no_file = []
    float_not_wv = []
    unknown_tag = []
    stems_to_ids = defaultdict(list)
    for source_id in ids:
        filename, tag = mapping.get(source_id, ("", ""))
        if not filename:
            continue
        stem = Path(filename).stem.lower()
        stems_to_ids[stem].append(source_id)
        available = files.get(stem, set())
        if not available:
            no_file.append(source_id)
        elif tag == "3" and ".wv" not in available:
            float_not_wv.append(source_id)
        if tag not in {"1", "3"}:
            unknown_tag.append(source_id)
    return {
        "manifest_rows": len(ids),
        "manifest_unique_ids": len(set(ids)),
        "mapped_ids": len([source_id for source_id in ids if mapping.get(source_id, ("",))[0]]),
        "unique_returned_stems": len(stems_to_ids),
        "float_tagged_ids": len([source_id for source_id in ids if mapping.get(source_id, ("", ""))[1] == "3"]),
        "duplicate_returned_stems": len([stem for stem, owners in stems_to_ids.items() if len(owners) > 1]),
        "missing_map_count": len(missing_map), "missing_map_examples": missing_map[:20],
        "blank_map_count": len(blank_map), "blank_map_examples": blank_map[:20],
        "no_file_count": len(no_file), "no_file_examples": no_file[:20],
        "float_not_wv_count": len(float_not_wv), "float_not_wv_examples": float_not_wv[:20],
        "unknown_tag_count": len(unknown_tag), "unknown_tag_examples": unknown_tag[:20],
        "observed_file_stems": len(files),
        "observed_extensions": dict(Counter(ext for extensions in files.values() for ext in extensions)),
    }


def check_organization(root):
    organized = root / "정리"
    actual_paths = set()
    if organized.exists():
        for folder, _, files in os.walk(organized):
            for filename in files:
                if filename.startswith(".") or filename == "목록표.csv":
                    continue
                actual_paths.add((Path(folder) / filename).relative_to(organized).as_posix())

    csv_path = organized / "목록표.csv"
    csv_paths = []
    invalid_paths = []
    if csv_path.exists():
        with csv_path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                relative = row.get("경로", "")
                parts = Path(relative).parts
                if not relative or Path(relative).is_absolute() or ".." in parts:
                    invalid_paths.append(relative)
                else:
                    csv_paths.append(Path(relative).as_posix())
    csv_set = set(csv_paths)

    raw_audio = []
    raw_partial = []
    for kind in ("extend", "phrase", "monotone_dl", "monotone"):
        source = root / "raw" / kind
        if not source.exists():
            continue
        for folder, _, files in os.walk(source):
            for filename in files:
                relative = str((Path(folder) / filename).relative_to(root))
                if ".part" in filename:
                    raw_partial.append(relative)
                elif Path(filename).suffix.lower() in AUDIO_EXTS:
                    raw_audio.append(relative)

    missing = sorted(csv_set - actual_paths)
    omitted = sorted(actual_paths - csv_set)
    return {
        "organized_csv_rows": len(csv_paths) + len(invalid_paths) if csv_path.exists() else None,
        "organized_file_count": len(actual_paths),
        "organized_csv_duplicate_path_count": len(csv_paths) - len(csv_set),
        "organized_csv_invalid_path_count": len(invalid_paths),
        "organized_csv_missing_file_count": len(missing),
        "organized_csv_missing_file_examples": missing[:20],
        "organized_files_not_in_csv_count": len(omitted),
        "organized_files_not_in_csv_examples": omitted[:20],
        "raw_remaining_audio_count": len(raw_audio),
        "raw_remaining_audio_examples": raw_audio[:20],
        "raw_partial_file_count": len(raw_partial),
        "raw_partial_file_examples": raw_partial[:20],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    root = args.root
    report = {kind: check_kind(root, kind, *spec) for kind, spec in KINDS.items()}
    report.update(check_organization(root))
    report["done_marker"] = (root / "정리" / ".done").exists()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    problem_fields = ("missing_map_count", "blank_map_count", "no_file_count", "float_not_wv_count")
    organization_problem_fields = (
        "organized_csv_duplicate_path_count", "organized_csv_invalid_path_count",
        "organized_csv_missing_file_count", "organized_files_not_in_csv_count",
        "raw_remaining_audio_count",
    )
    if (not report["done_marker"] or report["organized_csv_rows"] is None
            or any(report[kind][field] for kind in KINDS for field in problem_fields)
            or any(report[field] for field in organization_problem_fields)):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
