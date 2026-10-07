#!/usr/bin/env python3
"""Render three level-matched, 38.4-second Arirang C-major listening copies.

The two complete 19.2-second phrases of each instrument start at the same
sample. Phrase 001 is followed directly by phrase 002, without a crossfade,
time stretch, pitch change, or generated notes. Piri is heard only in 002.
Sources are read from raw/phrase or 정리/악구; only --output-dir is written.

Example (run after checking manifest and timeline alignment)::

    python3 tools/bgm-gpt/render_arirang_layers.py \
      --gugak-root /Users/simjaemin1/Mini/_bgm/국악원 \
      --output-dir /Users/simjaemin1/Mini/_bgm/gpt/청취
"""

import argparse
from array import array
from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


RATE = 44_100
CHANNELS = 2
PHRASE_SAMPLES = 19 * RATE + RATE // 5  # 19.2 seconds
TOTAL_SAMPLES = 2 * PHRASE_SAMPLES
CREDIT = "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)"
TARGET_LUFS = -20.0
TRUE_PEAK_CEILING_DBTP = -1.5
INITIAL_PEAK_MARGIN_DB = 0.5  # Room for AAC reconstruction overshoot.
GAYAGEUM_BELOW_DAEGEUM_LU = 6.0
PIRI_BELOW_DAEGEUM_LU = 10.0
AAC_BITRATE = "192k"
AUDIO_SUFFIXES = {".flac", ".wv", ".wav"}

SOURCES = {
    "daegeum": ("대금", ("w3-914-001", "w3-914-002")),
    "gayageum": ("가야금", ("s1-914-001", "s1-914-002")),
    "piri": ("피리", ("w1-914-001", "w1-914-002")),
}
VERSIONS = (
    ("004_아리랑_대금.m4a", "대금 001+002 원구절 연결"),
    ("005_아리랑_대금_가야금.m4a", "대금과 작은 가야금, 각 001+002 원구절 동시 시작"),
    ("006_아리랑_대금_가야금_후반피리.m4a",
     "대금과 작은 가야금, 후반 002에만 절제된 피리 추가"),
)
PROVENANCE_NAME = "제작정보_아리랑_004-006.json"


def run(*args, input_bytes=None):
    result = subprocess.run(args, input=input_bytes, capture_output=True)
    if result.returncode:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"Command failed: {' '.join(map(str, args))}\n{stderr}")
    return result


def ffmpeg_version():
    return run("ffmpeg", "-version").stdout.decode().splitlines()[0]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path):
    data = json.loads(run(
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
        "-of", "json", str(path),
    ).stdout)
    if len(data.get("streams", [])) != 1:
        raise ValueError(f"Expected one audio stream: {path}")
    return data


def pcm_from_le_bytes(raw):
    if len(raw) % 4:
        raise ValueError("FFmpeg returned an incomplete float32 sample")
    samples = array("f")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def pcm_to_le_bytes(samples):
    if sys.byteorder == "little":
        return samples.tobytes()
    copy = array("f", samples)
    copy.byteswap()
    return copy.tobytes()


def decode(path):
    raw = run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-ar", str(RATE), "-ac", str(CHANNELS), "-f", "f32le",
        "-acodec", "pcm_f32le", "pipe:1",
    ).stdout
    return pcm_from_le_bytes(raw)


def loudnorm_result(stderr):
    matches = re.findall(r'\{\s*"input_i".*?\}', stderr.decode(errors="replace"), re.S)
    if not matches:
        raise RuntimeError("FFmpeg did not return a loudnorm measurement")
    raw = json.loads(matches[-1])
    result = {key: float(raw[key]) for key in ("input_i", "input_tp", "input_lra")}
    if not all(math.isfinite(value) for value in result.values()):
        raise ValueError(f"Non-finite loudness measurement: {result}")
    return result


def measure(samples=None, path=None):
    if (samples is None) == (path is None):
        raise ValueError("Measure exactly one of samples or path")
    args = ["ffmpeg", "-hide_banner", "-nostats"]
    if samples is not None:
        args.extend(("-f", "f32le", "-ar", str(RATE), "-ac", str(CHANNELS),
                     "-i", "pipe:0"))
        data = pcm_to_le_bytes(samples)
    else:
        args.extend(("-i", str(path)))
        data = None
    args.extend(("-af", "loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json",
                 "-f", "null", "-"))
    return loudnorm_result(run(*args, input_bytes=data).stderr)


def validate_manifest(root):
    path = root / "gugak_manifest_phrase_full.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    wanted = {source_id: (instrument, phrase_number)
              for instrument, ids in SOURCES.values()
              for phrase_number, source_id in enumerate(ids, 1)}
    found = defaultdict(list)
    for row in rows:
        if row.get("phraseCd") in wanted:
            found[row["phraseCd"]].append(row)
    selected = {}
    for source_id, (instrument, phrase_number) in wanted.items():
        if len(found[source_id]) != 1:
            raise ValueError(f"Manifest needs exactly one row for {source_id}")
        row = found[source_id][0]
        expected_description = (
            "The first half of folksong Arirang C Major" if phrase_number == 1
            else "The latter half of folksong Arirang C Major"
        )
        checks = {
            "inst": instrument,
            "cmpstnNmKor": "아리랑",
            "phrsNmEng": f"Arirang-{phrase_number:02d}",
            "phrsNmKor": f"아리랑 {phrase_number:02d}",
            "phrsDescEng": expected_description,
            "rhythm": "세마치",
        }
        for key, expected in checks.items():
            if str(row.get(key, "")).strip() != expected:
                raise ValueError(
                    f"Manifest {source_id} {key}: {row.get(key)!r} != {expected!r}"
                )
        selected[source_id] = {key: row[key] for key in
                               ("phraseCd", "inst", "cmpstnNmKor", "phrsNmEng",
                                "phrsNmKor", "phrsDescEng", "rhythm")}
    return selected


def validate_name_map(root):
    path = root / "tools" / ".map_phrase.tsv"
    wanted = {source_id for _, ids in SOURCES.values() for source_id in ids}
    mapped = defaultdict(list)
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            fields = line.rstrip("\n").split("\t")
            if fields[0] not in wanted:
                continue
            if len(fields) != 3:
                raise ValueError(f"Malformed name map at line {line_number}")
            mapped[fields[0]].append((fields[1], fields[2]))
    for source_id in sorted(wanted):
        expected = (f"{source_id}.wav", "1")
        if mapped[source_id] != [expected]:
            raise ValueError(
                f"Name map for {source_id}: {mapped[source_id]!r} != {[expected]!r}"
            )
    return {source_id: entries[0][0] for source_id, entries in mapped.items()}


def source_candidates(root):
    """Find either raw files or their moved, instrument-labelled counterparts."""
    id_to_instrument = {source_id: instrument
                        for instrument, ids in SOURCES.values() for source_id in ids}
    found = defaultdict(list)
    locations = ((root / "raw" / "phrase", "raw"),
                 (root / "정리" / "악구", "organized"))
    for location, kind in locations:
        if not location.is_dir():
            continue
        for folder, _, filenames in os.walk(location):
            for filename in filenames:
                file_path = Path(folder) / filename
                if file_path.suffix.lower() not in AUDIO_SUFFIXES:
                    continue
                stem = file_path.stem
                source_id = stem if kind == "raw" else stem.split("__", 1)[0]
                if source_id not in id_to_instrument:
                    continue
                if kind == "organized":
                    relative_parts = file_path.relative_to(location).parts
                    if ("__" not in stem or len(relative_parts) < 2
                            or relative_parts[0] != id_to_instrument[source_id]):
                        continue
                found[source_id].append((kind, file_path))
    return found


def resolve_sources(root):
    candidates = source_candidates(root)
    selected = {}
    for _, ids in SOURCES.values():
        for source_id in ids:
            options = candidates[source_id]
            if not options:
                raise FileNotFoundError(f"No raw or organized audio for {source_id}")
            hashes = [(kind, path, sha256(path)) for kind, path in options]
            raw_by_name = defaultdict(set)
            for kind, path, digest in hashes:
                if kind == "raw":
                    raw_by_name[path.name].add(digest)
            for filename, digests in raw_by_name.items():
                if len(digests) > 1:
                    raise ValueError(
                        f"Conflicting SHA-256 values for duplicate raw name {filename}"
                    )
            if len({digest for _, _, digest in hashes}) != 1:
                raise ValueError(f"Conflicting source files for {source_id}: {hashes}")
            # Prefer the moved file when both copies still exist. Equal hashes
            # make the decoded signal independent of this location choice.
            hashes.sort(key=lambda item: (item[0] != "organized", str(item[1])))
            kind, path, digest = hashes[0]
            selected[source_id] = {
                "path": path,
                "sha256": digest,
                "location": kind,
                "identical_copies": [str(candidate) for _, candidate, _ in hashes],
            }
    return selected


def checked_source(path):
    metadata = probe(path)
    stream = metadata["streams"][0]
    if int(stream["sample_rate"]) != RATE or int(stream["channels"]) not in (1, 2):
        raise ValueError(f"Expected 44.1 kHz mono or stereo source: {path}")
    if abs(float(metadata["format"]["duration"]) - 19.2) > 1 / RATE:
        raise ValueError(f"Expected 19.2-second source: {path}")
    samples = decode(path)
    if len(samples) != PHRASE_SAMPLES * CHANNELS:
        raise ValueError(f"Unexpected decoded sample count in {path}: {len(samples)}")
    return samples, {
        "codec": stream["codec_name"],
        "original_channels": int(stream["channels"]),
        "sample_rate": RATE,
        "frames": PHRASE_SAMPLES,
        "duration_s": 19.2,
    }


def mix_two_layers(base, addition, addition_gain_db):
    scale = 10 ** (addition_gain_db / 20)
    return array("f", (first + scale * second
                       for first, second in zip(base, addition)))


def append_phrase(first, second):
    joined = array("f", first)
    joined.extend(second)
    if len(joined) != TOTAL_SAMPLES * CHANNELS:
        raise AssertionError("The two full phrases must occupy exactly 38.4 seconds")
    return joined


def write_aac(path, samples, gain_db, description):
    run(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "f32le", "-ar", str(RATE), "-ac", str(CHANNELS), "-i", "pipe:0",
        "-af", f"volume={gain_db:.8f}dB", "-ar", str(RATE), "-ac", str(CHANNELS),
        "-c:a", "aac", "-b:a", AAC_BITRATE, "-movflags", "+faststart",
        "-metadata", f"comment={CREDIT}",
        "-metadata", f"copyright={CREDIT}",
        "-metadata", f"description={description}", str(path),
        input_bytes=pcm_to_le_bytes(samples),
    )


def validate_output(path):
    metadata = probe(path)
    stream = metadata["streams"][0]
    if (stream["codec_name"] != "aac" or int(stream["sample_rate"]) != RATE
            or int(stream["channels"]) != CHANNELS):
        raise ValueError(f"Expected 44.1 kHz stereo AAC: {path}")
    # AAC stores whole 1024-sample frames; the last packet may decode with
    # padding even when the MP4 timeline reports the intended duration.
    format_duration = float(metadata["format"]["duration"])
    if abs(format_duration - 38.4) > 1024 / RATE:
        raise ValueError(f"Unexpected AAC timeline duration {format_duration}: {path}")
    decoded_frames = len(decode(path)) // CHANNELS
    if not TOTAL_SAMPLES <= decoded_frames <= TOTAL_SAMPLES + 1024:
        raise ValueError(
            f"AAC decoded to {decoded_frames} frames; expected {TOTAL_SAMPLES} "
            f"plus at most one padding frame: {path}"
        )


def render_to_stage(stage, versions, descriptions, source_mix_levels):
    initial_target = min(
        TARGET_LUFS,
        *(m["input_i"] + TRUE_PEAK_CEILING_DBTP - INITIAL_PEAK_MARGIN_DB
          - m["input_tp"] for m in source_mix_levels),
    )
    if not math.isfinite(initial_target):
        raise ValueError("Could not set a finite common loudness target")
    target = initial_target
    gains = [target - m["input_i"] for m in source_mix_levels]
    encoded_levels = None
    for _ in range(6):
        for (name, _), samples, description, gain in zip(
            VERSIONS, versions, descriptions, gains
        ):
            write_aac(stage / name, samples, gain, description)
        encoded_levels = [measure(path=stage / name) for name, _ in VERSIONS]
        peak_excess = max(0.0, *(m["input_tp"] - TRUE_PEAK_CEILING_DBTP
                                 for m in encoded_levels))
        level_error = max(abs(m["input_i"] - target) for m in encoded_levels)
        if peak_excess <= 0 and level_error <= 0.1:
            for name, _ in VERSIONS:
                validate_output(stage / name)
            return target, gains, encoded_levels
        if peak_excess > 0:
            target -= peak_excess + 0.15
        gains = [gain + target - m["input_i"]
                 for gain, m in zip(gains, encoded_levels)]
    raise RuntimeError(
        f"AAC outputs could not reach matched LUFS and true-peak ceiling: "
        f"target={target}, measurements={encoded_levels}"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gugak-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--overwrite", action="store_true",
                        help="Replace previously rendered 004-006 outputs")
    args = parser.parse_args()
    root = args.gugak_root.resolve()
    output_dir = args.output_dir.resolve()
    if (output_dir == root or output_dir == root / "raw"
            or root / "raw" in output_dir.parents
            or output_dir == root / "정리" or root / "정리" in output_dir.parents):
        parser.error("--output-dir must be outside the raw and organized sources")
    if not root.is_dir():
        parser.error(f"Gugak root does not exist: {root}")
    expected_outputs = [output_dir / name for name, _ in VERSIONS]
    expected_outputs.append(output_dir / PROVENANCE_NAME)
    if not args.overwrite:
        existing = [str(path) for path in expected_outputs if path.exists()]
        if existing:
            parser.error("Outputs already exist (use --overwrite): " + ", ".join(existing))

    manifest = validate_manifest(root)
    name_map = validate_name_map(root)
    resolved = resolve_sources(root)
    audio = {}
    sources = {}
    for instrument, (_, ids) in SOURCES.items():
        for source_id in ids:
            source = resolved[source_id]
            samples, format_info = checked_source(source["path"])
            audio[source_id] = samples
            sources[source_id] = {
                "instrument": instrument,
                "mapped_filename": name_map[source_id],
                "manifest": manifest[source_id],
                "path": str(source["path"]),
                "location": source["location"],
                "sha256": source["sha256"],
                "identical_copies": source["identical_copies"],
                **format_info,
                "loudness": measure(samples=samples),
            }

    layer_gains = {"daegeum_db": [0.0, 0.0], "gayageum_db": [],
                   "piri_db": [None, None]}
    daegeum_ids = SOURCES["daegeum"][1]
    gayageum_ids = SOURCES["gayageum"][1]
    piri_ids = SOURCES["piri"][1]
    for daegeum_id, gayageum_id in zip(daegeum_ids, gayageum_ids):
        gain = (sources[daegeum_id]["loudness"]["input_i"]
                - GAYAGEUM_BELOW_DAEGEUM_LU
                - sources[gayageum_id]["loudness"]["input_i"])
        layer_gains["gayageum_db"].append(gain)
    layer_gains["piri_db"][1] = (
        sources[daegeum_ids[1]]["loudness"]["input_i"]
        - PIRI_BELOW_DAEGEUM_LU
        - sources[piri_ids[1]]["loudness"]["input_i"]
    )

    solo = append_phrase(audio[daegeum_ids[0]], audio[daegeum_ids[1]])
    duet_phrases = [
        mix_two_layers(audio[daegeum_id], audio[gayageum_id], gain)
        for daegeum_id, gayageum_id, gain in zip(
            daegeum_ids, gayageum_ids, layer_gains["gayageum_db"]
        )
    ]
    duet = append_phrase(*duet_phrases)
    trio = append_phrase(
        duet_phrases[0],
        mix_two_layers(duet_phrases[1], audio[piri_ids[1]],
                       layer_gains["piri_db"][1]),
    )
    versions = (solo, duet, trio)
    descriptions = [description for _, description in VERSIONS]
    source_mix_levels = [measure(samples=version) for version in versions]

    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".arirang-render-", dir=output_dir) as temp:
        stage = Path(temp)
        common_target, final_gains, encoded_levels = render_to_stage(
            stage, versions, descriptions, source_mix_levels
        )
        outputs = []
        for (name, description), before, after, gain in zip(
            VERSIONS, source_mix_levels, encoded_levels, final_gains
        ):
            outputs.append({
                "filename": name,
                "description": description,
                "sha256": sha256(stage / name),
                "duration_s": 38.4,
                "sample_rate": RATE,
                "channels": CHANNELS,
                "aac_bitrate": AAC_BITRATE,
                "master_gain_db": gain,
                "mix_before_master": before,
                "encoded_loudness": after,
            })
        provenance = {
            "credit": CREDIT,
            "repertoire": "아리랑 / Arirang C Major",
            "render_policy": "Full original phrases; index-matched at sample zero; no crossfade, time stretch, pitch shift, or synthesized notes",
            "ffmpeg_version": ffmpeg_version(),
            "phrase_duration_s": 19.2,
            "output_duration_s": 38.4,
            "phrase_order": ["001", "002"],
            "piri_used_only_in_phrase": "002",
            "piri_001_validated_but_not_mixed": True,
            "settings": {
                "gayageum_below_daegeum_lu": GAYAGEUM_BELOW_DAEGEUM_LU,
                "piri_below_daegeum_lu": PIRI_BELOW_DAEGEUM_LU,
                "requested_target_lufs": TARGET_LUFS,
                "actual_common_target_lufs": common_target,
                "true_peak_ceiling_dbtp": TRUE_PEAK_CEILING_DBTP,
                "initial_peak_margin_db": INITIAL_PEAK_MARGIN_DB,
                "loudness_tolerance_lu": 0.1,
                "layer_gains_db_by_phrase_001_002": layer_gains,
            },
            "sources": sources,
            "outputs": outputs,
        }
        (stage / PROVENANCE_NAME).write_text(
            json.dumps(provenance, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        for name, _ in VERSIONS:
            os.replace(stage / name, output_dir / name)
        os.replace(stage / PROVENANCE_NAME, output_dir / PROVENANCE_NAME)
    print(json.dumps({"output_dir": str(output_dir), "outputs": outputs,
                      "provenance": str(output_dir / PROVENANCE_NAME)},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
