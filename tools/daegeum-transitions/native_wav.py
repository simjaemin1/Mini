#!/usr/bin/env python3
"""Read direct WAV recordings without changing their native timeline.

R&D-06 needs source coordinates that remain meaningful when a transition is
reviewed later.  General-purpose audio readers often hide a resample, a mono
downmix, or a conversion behind a convenient API.  This module deliberately
does none of those things:

* only RIFF/RF64 WAVE files are accepted (not converted derivatives),
* the metadata descriptor records native frames, sample rate and encoding,
* :func:`read_native_wav` decodes PCM or IEEE float samples at that rate, and
* the one analysis downmix policy is explicit and carried in the descriptor.

The public descriptors intentionally contain no filesystem path.  A catalog
builder can add a source-relative identifier of its own, while a report never
accidentally publishes a user's absolute Downloads path.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
from typing import TYPE_CHECKING, Any, BinaryIO, Iterable, Mapping

if TYPE_CHECKING:
    import numpy as np


SCHEMA_VERSION = 1
COPY_BUFFER_BYTES = 1024 * 1024
DEFAULT_MAX_DECODE_BYTES = 1024 * 1024 * 1024
_WAVE_FORMAT_PCM = 0x0001
_WAVE_FORMAT_IEEE_FLOAT = 0x0003
_WAVE_FORMAT_EXTENSIBLE = 0xFFFE
_EXTENSIBLE_GUID_TAIL = bytes.fromhex("00001000800000aa00389b71")
_MAX_TEXT_METADATA_BYTES = 16 * 1024
_MAX_RIFF_METADATA_CHUNK_BYTES = 1024 * 1024
_ABSOLUTE_PATH_TEXT = re.compile(
    r"(?<![A-Za-z0-9_.-])(?:/(?:[^\s/][^\s]*)|[A-Za-z]:[\\/][^\s]*)"
)


class NativeWavError(ValueError):
    """A WAV cannot safely be used as a native R&D source."""


def _numpy() -> Any:
    """Load NumPy only for sample decoding, not metadata cataloging.

    R&D-06's catalog/dry-run should be runnable with the system Python.  The
    actual waveform analysis environment has NumPy, but it is intentionally
    not a dependency of :func:`inspect_wav`.
    """

    try:
        import numpy
    except ModuleNotFoundError as exc:
        raise NativeWavError(
            "native sample decoding requires NumPy; inspect_wav() does not"
        ) from exc
    return numpy


@dataclass(frozen=True)
class _Format:
    audio_format_code: int
    effective_format_code: int | None
    encoding: str
    channels: int
    sample_rate_hz: int
    byte_rate: int
    block_align: int
    bits_per_sample: int
    valid_bits_per_sample: int | None
    channel_mask: int | None
    supported_for_decode: bool


@dataclass(frozen=True)
class _Layout:
    container_id: str
    riff_declared_size: int
    file_size: int
    data_offset_bytes: int
    data_byte_length: int
    frame_count: int
    fmt: _Format
    chunks: tuple[dict[str, Any], ...]
    riff_metadata: dict[str, Any]


@dataclass(frozen=True)
class NativeWav:
    """A direct WAV at its original rate, plus its declared analysis stream.

    ``samples`` always has shape ``(frames, channels)`` and float32 values.
    It has not been resampled, clipped, normalized, or trimmed.  ``analysis_mono``
    is a separate arithmetic channel mean for transition analysis only.
    """

    samples: np.ndarray
    analysis_mono: np.ndarray
    metadata: Mapping[str, Any]


def _safe_name(path: Path) -> str:
    """Use a non-sensitive label in errors; never echo an absolute path."""

    return path.name or "WAV source"


def _require_direct_wav(path: Path) -> None:
    if path.suffix.lower() != ".wav":
        raise NativeWavError(
            f"direct WAV required; {_safe_name(path)!r} does not have a .wav extension"
        )
    if not path.is_file():
        raise NativeWavError(f"WAV source does not exist: {_safe_name(path)!r}")


def _read_exact(source: BinaryIO, size: int, label: str) -> bytes:
    data = source.read(size)
    if len(data) != size:
        raise NativeWavError(f"truncated {label}")
    return data


def _fourcc(raw: bytes) -> str:
    # latin-1 is a one-to-one byte mapping and cannot fail.  JSON will escape
    # any control character rather than emitting raw bytes into a catalog.
    return raw.decode("latin-1")


def _safe_text(raw: bytes, *, limit: int = _MAX_TEXT_METADATA_BYTES) -> tuple[str, bool]:
    """Decode BWF/INFO text without retaining an unbounded opaque payload."""

    truncated = len(raw) > limit
    raw = raw[:limit]
    raw = raw.split(b"\0", 1)[0]
    text = raw.decode("latin-1", errors="replace")
    # Preserve printable metadata but avoid embedding control codes in reports.
    text = "".join(ch if ch >= " " or ch in "\t\n\r" else "�" for ch in text)
    # BWF description/coding-history fields are producer-controlled.  They
    # occasionally contain DAW file locations, so do not let an otherwise
    # path-free catalog leak one through embedded text.
    text = _ABSOLUTE_PATH_TEXT.sub("[redacted-absolute-path]", text)
    return text.rstrip(), truncated


def _parse_bext(data: bytes) -> dict[str, Any]:
    """Parse the fixed BWF Broadcast Extension fields when they are present."""

    result: dict[str, Any] = {"byte_length": len(data)}
    if len(data) < 602:
        result["truncated"] = True
        return result

    description, description_truncated = _safe_text(data[0:256])
    originator, originator_truncated = _safe_text(data[256:288])
    reference, reference_truncated = _safe_text(data[288:320])
    date, date_truncated = _safe_text(data[320:330])
    time, time_truncated = _safe_text(data[330:338])
    version = struct.unpack_from("<H", data, 346)[0]
    time_reference_samples = struct.unpack_from("<Q", data, 338)[0]
    umid = data[348:412]
    history, history_truncated = _safe_text(data[602:])

    result.update(
        {
            "description": description,
            "originator": originator,
            "originator_reference": reference,
            "origination_date": date,
            "origination_time": time,
            "time_reference_samples": time_reference_samples,
            "version": version,
            # Hex is safer and more portable than treating a UMID as text.
            "umid_hex": umid.hex() if any(umid) else None,
            "coding_history": history,
        }
    )
    if any(
        (
            description_truncated,
            originator_truncated,
            reference_truncated,
            date_truncated,
            time_truncated,
            history_truncated,
        )
    ):
        result["text_truncated"] = True
    return result


def _parse_info_list(data: bytes) -> dict[str, Any] | None:
    """Read a RIFF LIST/INFO chunk with bounds checks for every subchunk."""

    if len(data) < 4 or data[:4] != b"INFO":
        return None
    values: dict[str, str] = {}
    truncated = False
    position = 4
    while position < len(data):
        if len(data) - position < 8:
            raise NativeWavError("truncated LIST/INFO subchunk header")
        key = _fourcc(data[position : position + 4])
        size = struct.unpack_from("<I", data, position + 4)[0]
        value_start = position + 8
        value_end = value_start + size
        if value_end > len(data):
            raise NativeWavError("LIST/INFO subchunk exceeds its containing chunk")
        value, was_truncated = _safe_text(data[value_start:value_end])
        # Repeated INFO keys are legal but not useful as a bare scalar.  Keep
        # them deterministically rather than silently dropping source detail.
        existing = values.get(key)
        values[key] = value if existing is None else f"{existing}; {value}"
        truncated = truncated or was_truncated
        position = value_end + (size & 1)
        if position > len(data):
            raise NativeWavError("LIST/INFO padding exceeds its containing chunk")
    if truncated:
        values["_text_truncated"] = "true"
    return values


def _parse_format(data: bytes) -> _Format:
    if len(data) < 16:
        raise NativeWavError("truncated fmt chunk")
    (
        audio_format_code,
        channels,
        sample_rate_hz,
        byte_rate,
        block_align,
        bits_per_sample,
    ) = struct.unpack_from("<HHIIHH", data)
    if channels < 1 or channels > 64:
        raise NativeWavError("fmt chunk has an unsafe channel count")
    if sample_rate_hz < 1 or sample_rate_hz > 1_000_000:
        raise NativeWavError("fmt chunk has an unsafe sample rate")
    if bits_per_sample < 1 or bits_per_sample % 8:
        raise NativeWavError("fmt chunk has an unsupported non-byte sample width")
    bytes_per_sample = bits_per_sample // 8
    if block_align != channels * bytes_per_sample:
        raise NativeWavError("fmt block alignment does not match channels and sample width")
    if byte_rate != sample_rate_hz * block_align:
        raise NativeWavError("fmt byte rate does not match sample rate and block alignment")

    effective_format_code: int | None = audio_format_code
    valid_bits: int | None = bits_per_sample
    channel_mask: int | None = None
    if audio_format_code == _WAVE_FORMAT_EXTENSIBLE:
        if len(data) < 40:
            raise NativeWavError("truncated WAVE_FORMAT_EXTENSIBLE fmt chunk")
        extension_size = struct.unpack_from("<H", data, 16)[0]
        if extension_size < 22:
            raise NativeWavError("invalid WAVE_FORMAT_EXTENSIBLE extension size")
        valid_bits, channel_mask = struct.unpack_from("<HI", data, 18)
        guid = data[24:40]
        if valid_bits < 1 or valid_bits > bits_per_sample:
            raise NativeWavError("invalid WAVE_FORMAT_EXTENSIBLE valid bit count")
        if len(guid) != 16 or guid[4:] != _EXTENSIBLE_GUID_TAIL:
            effective_format_code = None
        else:
            effective_format_code = struct.unpack_from("<I", guid, 0)[0]

    encoding_names = {
        _WAVE_FORMAT_PCM: "PCM",
        _WAVE_FORMAT_IEEE_FLOAT: "IEEE_FLOAT",
    }
    encoding = encoding_names.get(
        effective_format_code,
        f"UNSUPPORTED_0x{audio_format_code:04X}",
    )
    if audio_format_code == _WAVE_FORMAT_EXTENSIBLE and effective_format_code is not None:
        encoding = f"WAVE_FORMAT_EXTENSIBLE_{encoding}"
    supported = effective_format_code in (_WAVE_FORMAT_PCM, _WAVE_FORMAT_IEEE_FLOAT)
    return _Format(
        audio_format_code=audio_format_code,
        effective_format_code=effective_format_code,
        encoding=encoding,
        channels=channels,
        sample_rate_hz=sample_rate_hz,
        byte_rate=byte_rate,
        block_align=block_align,
        bits_per_sample=bits_per_sample,
        valid_bits_per_sample=valid_bits,
        channel_mask=channel_mask,
        supported_for_decode=supported,
    )


def _parse_rf64_ds64(data: bytes, declared_chunk_size: int) -> tuple[int, int, int]:
    if declared_chunk_size < 28 or len(data) < 28:
        raise NativeWavError("truncated RF64 ds64 chunk")
    riff_size, data_size, sample_count, table_length = struct.unpack_from("<QQQI", data)
    expected_minimum = 28 + table_length * 12
    if expected_minimum > declared_chunk_size:
        raise NativeWavError("RF64 ds64 table exceeds its containing chunk")
    return riff_size, data_size, sample_count


def _parse_layout(path: Path) -> _Layout:
    _require_direct_wav(path)
    file_size = path.stat().st_size
    if file_size < 12:
        raise NativeWavError(f"truncated RIFF header in {_safe_name(path)!r}")

    with path.open("rb") as source:
        header = _read_exact(source, 12, "RIFF header")
        container = header[0:4]
        if container == b"RIFX":
            raise NativeWavError("big-endian RIFX is not a supported direct WAV source")
        if container not in (b"RIFF", b"RF64") or header[8:12] != b"WAVE":
            raise NativeWavError("source is not a RIFF/RF64 WAVE file")
        declared_32 = struct.unpack_from("<I", header, 4)[0]
        position = 12
        rf64_data_size: int | None = None
        if container == b"RF64":
            if declared_32 != 0xFFFFFFFF or file_size < 20:
                raise NativeWavError("invalid RF64 RIFF size")
            source.seek(position)
            ds64_header = _read_exact(source, 8, "RF64 ds64 header")
            if ds64_header[:4] != b"ds64":
                raise NativeWavError("RF64 source is missing its leading ds64 chunk")
            ds64_size = struct.unpack_from("<I", ds64_header, 4)[0]
            ds64_data = _read_exact(source, min(ds64_size, 28), "RF64 ds64 chunk")
            riff_declared_size, rf64_data_size, _ = _parse_rf64_ds64(ds64_data, ds64_size)
            initial_chunks = [{"id": "ds64", "byte_length": ds64_size}]
            position += 8 + ds64_size + (ds64_size & 1)
        else:
            riff_declared_size = declared_32
            initial_chunks = []

        riff_end = 8 + riff_declared_size
        if riff_end > file_size:
            raise NativeWavError("RIFF declared size exceeds the actual file length")
        if position > riff_end:
            raise NativeWavError("RIFF metadata starts outside the declared container")

        chunks: list[dict[str, Any]] = initial_chunks
        riff_metadata: dict[str, Any] = {}
        fmt: _Format | None = None
        data_offset: int | None = None
        data_size: int | None = None
        while position < riff_end:
            if riff_end - position < 8:
                raise NativeWavError("truncated RIFF chunk header")
            source.seek(position)
            chunk_header = _read_exact(source, 8, "RIFF chunk header")
            chunk_id_raw = chunk_header[:4]
            chunk_id = _fourcc(chunk_id_raw)
            chunk_size = struct.unpack_from("<I", chunk_header, 4)[0]
            if container == b"RF64" and chunk_id_raw == b"data" and chunk_size == 0xFFFFFFFF:
                if rf64_data_size is None:
                    raise NativeWavError("RF64 data size is missing from ds64")
                chunk_size = rf64_data_size
            data_start = position + 8
            data_end = data_start + chunk_size
            if data_end > riff_end:
                raise NativeWavError(f"RIFF chunk {chunk_id!r} exceeds the declared container")
            chunks.append({"id": chunk_id, "byte_length": chunk_size})

            if chunk_id_raw == b"fmt ":
                if fmt is not None:
                    raise NativeWavError("multiple fmt chunks are ambiguous")
                source.seek(data_start)
                # Only the first 40 bytes are standardized and needed for
                # PCM/IEEE-float identification.  Do not allocate arbitrary
                # codec-private fmt extensions just to catalog a source.
                fmt = _parse_format(
                    _read_exact(source, min(chunk_size, 40), "fmt chunk")
                )
            elif chunk_id_raw == b"data":
                if data_offset is not None:
                    raise NativeWavError("multiple data chunks are ambiguous")
                data_offset, data_size = data_start, chunk_size
            elif chunk_id_raw == b"bext":
                if chunk_size > _MAX_RIFF_METADATA_CHUNK_BYTES:
                    riff_metadata["bext"] = {
                        "byte_length": chunk_size,
                        "not_parsed": "exceeds safe metadata read limit",
                    }
                else:
                    source.seek(data_start)
                    riff_metadata["bext"] = _parse_bext(
                        _read_exact(source, chunk_size, "bext chunk")
                    )
            elif chunk_id_raw == b"LIST":
                if chunk_size > _MAX_RIFF_METADATA_CHUNK_BYTES:
                    riff_metadata["list_metadata"] = {
                        "byte_length": chunk_size,
                        "not_parsed": "exceeds safe metadata read limit",
                    }
                else:
                    source.seek(data_start)
                    info = _parse_info_list(_read_exact(source, chunk_size, "LIST chunk"))
                    if info is not None:
                        riff_metadata["info"] = info
            elif chunk_id_raw == b"fact" and chunk_size >= 4:
                source.seek(data_start)
                fact = _read_exact(source, 4, "fact chunk")
                riff_metadata["fact_sample_count"] = struct.unpack("<I", fact)[0]

            position = data_end + (chunk_size & 1)
            if position > riff_end:
                raise NativeWavError(f"RIFF chunk {chunk_id!r} padding exceeds the container")

    if fmt is None:
        raise NativeWavError("WAVE source has no fmt chunk")
    if data_offset is None or data_size is None:
        raise NativeWavError("WAVE source has no data chunk")
    if data_size % fmt.block_align:
        raise NativeWavError("data chunk has a partial sample frame")
    frame_count = data_size // fmt.block_align
    return _Layout(
        container_id=_fourcc(container),
        riff_declared_size=riff_declared_size,
        file_size=file_size,
        data_offset_bytes=data_offset,
        data_byte_length=data_size,
        frame_count=frame_count,
        fmt=fmt,
        chunks=tuple(chunks),
        riff_metadata=riff_metadata,
    )


def sha256_file(path: str | Path) -> str:
    """Return the SHA-256 of unmodified source bytes."""

    source_path = Path(path)
    _require_direct_wav(source_path)
    digest = hashlib.sha256()
    with source_path.open("rb") as source:
        for chunk in iter(lambda: source.read(COPY_BUFFER_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _analysis_mono_descriptor(channels: int, mono_policy: str) -> dict[str, Any]:
    if mono_policy != "mean_channels":
        raise NativeWavError(
            f"unsupported analysis mono policy {mono_policy!r}; use 'mean_channels'"
        )
    return {
        "id": "mean_channels",
        "operation": "arithmetic_mean_across_input_channels",
        "input_channels": channels,
        "output_channels": 1,
        "normalization": "divide_by_input_channel_count",
        "resampled": False,
        "timeline": "native_sample_frames",
    }


def _descriptor(layout: _Layout, digest: str, mono_policy: str) -> dict[str, Any]:
    fmt = layout.fmt
    descriptor: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "sha256": digest,
        "byte_length": layout.file_size,
        "container": {
            "id": layout.container_id,
            "byte_order": "little_endian",
            "declared_riff_size": layout.riff_declared_size,
        },
        "native_audio": {
            "audio_format_code": fmt.audio_format_code,
            "effective_format_code": fmt.effective_format_code,
            "encoding": fmt.encoding,
            "supported_for_decode": fmt.supported_for_decode,
            "channels": fmt.channels,
            "sample_rate_hz": fmt.sample_rate_hz,
            "byte_rate": fmt.byte_rate,
            "block_align_bytes": fmt.block_align,
            "bits_per_sample": fmt.bits_per_sample,
            "valid_bits_per_sample": fmt.valid_bits_per_sample,
            "channel_mask": fmt.channel_mask,
            "frame_count": layout.frame_count,
            "duration_seconds": layout.frame_count / fmt.sample_rate_hz,
            "data_offset_bytes": layout.data_offset_bytes,
            "data_byte_length": layout.data_byte_length,
            "resampled": False,
        },
        "riff_chunks": list(layout.chunks),
        "analysis_mono_policy": _analysis_mono_descriptor(fmt.channels, mono_policy),
    }
    if layout.riff_metadata:
        descriptor["riff_metadata"] = layout.riff_metadata
    return descriptor


def inspect_wav(path: str | Path, *, mono_policy: str = "mean_channels") -> dict[str, Any]:
    """Inspect a direct WAV and return a JSON-safe, path-free descriptor.

    This function intentionally does not decode or resample the audio.  It
    accepts valid RIFF metadata even when the encoding is unsupported, marking
    it ``supported_for_decode: false`` for a catalog to handle explicitly.
    """

    source_path = Path(path)
    layout = _parse_layout(source_path)
    digest = sha256_file(source_path)
    return _descriptor(layout, digest, mono_policy)


def _decode_pcm(raw: bytes, bits_per_sample: int) -> np.ndarray:
    np = _numpy()
    if bits_per_sample == 8:
        return (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    if bits_per_sample == 16:
        values = np.frombuffer(raw, dtype="<i2")
        return values.astype(np.float32) / float(1 << 15)
    if bits_per_sample == 24:
        packed = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        values = (
            packed[:, 0].astype(np.int32)
            | (packed[:, 1].astype(np.int32) << 8)
            | (packed[:, 2].astype(np.int32) << 16)
        )
        values = (values ^ (1 << 23)) - (1 << 23)
        return values.astype(np.float32) / float(1 << 23)
    if bits_per_sample == 32:
        values = np.frombuffer(raw, dtype="<i4")
        return values.astype(np.float32) / float(1 << 31)
    if bits_per_sample == 64:
        values = np.frombuffer(raw, dtype="<i8")
        return values.astype(np.float32) / float(1 << 63)
    raise NativeWavError(f"PCM {bits_per_sample}-bit decoding is not supported")


def _decode_float(raw: bytes, bits_per_sample: int) -> np.ndarray:
    np = _numpy()
    if bits_per_sample == 32:
        values = np.frombuffer(raw, dtype="<f4")
    elif bits_per_sample == 64:
        values = np.frombuffer(raw, dtype="<f8")
    else:
        raise NativeWavError(f"IEEE float {bits_per_sample}-bit decoding is not supported")
    if not np.all(np.isfinite(values)):
        raise NativeWavError("IEEE float WAV contains non-finite audio samples")
    return values.astype(np.float32, copy=False)


def read_native_wav(
    path: str | Path,
    *,
    mono_policy: str = "mean_channels",
    max_decode_bytes: int = DEFAULT_MAX_DECODE_BYTES,
) -> NativeWav:
    """Decode PCM/IEEE-float WAV samples at their native sample rate.

    The decoder never resamples, trims, normalizes, or writes to the source.
    ``max_decode_bytes`` is a deliberate memory-safety gate; callers dealing
    with an unusually long approved recording can raise it explicitly.
    """

    if max_decode_bytes < 0:
        raise NativeWavError("max_decode_bytes must be non-negative")
    source_path = Path(path)
    layout = _parse_layout(source_path)
    fmt = layout.fmt
    if not fmt.supported_for_decode:
        raise NativeWavError(
            f"unsupported WAV encoding {fmt.encoding}; only PCM and IEEE float are allowed"
        )
    if layout.data_byte_length > max_decode_bytes:
        raise NativeWavError(
            "data chunk exceeds max_decode_bytes; raise the limit explicitly for this source"
        )
    with source_path.open("rb") as source:
        source.seek(layout.data_offset_bytes)
        raw = _read_exact(source, layout.data_byte_length, "data chunk")
    if fmt.effective_format_code == _WAVE_FORMAT_PCM:
        flat = _decode_pcm(raw, fmt.bits_per_sample)
    elif fmt.effective_format_code == _WAVE_FORMAT_IEEE_FLOAT:
        flat = _decode_float(raw, fmt.bits_per_sample)
    else:  # Defensive: supported_for_decode above should make this unreachable.
        raise NativeWavError("unsupported WAV encoding")
    if flat.size != layout.frame_count * fmt.channels:
        raise NativeWavError("decoded sample count does not match native frame metadata")
    samples = flat.reshape(layout.frame_count, fmt.channels)
    np = _numpy()
    analysis_policy = _analysis_mono_descriptor(fmt.channels, mono_policy)
    analysis_mono = samples.mean(axis=1, dtype=np.float32)
    descriptor = _descriptor(layout, sha256_file(source_path), mono_policy)
    # Assert this visible field stays exactly tied to the decoder choice.
    descriptor["analysis_mono_policy"] = analysis_policy
    return NativeWav(samples=samples, analysis_mono=analysis_mono, metadata=descriptor)


def _relative_source_id(path: Path, root: Path | None) -> str:
    """Return only a portable relative identity for a CLI JSON report."""

    resolved_path = path.resolve()
    if root is None:
        return path.name
    try:
        return resolved_path.relative_to(root.resolve()).as_posix()
    except ValueError as exc:
        raise NativeWavError("source is outside the supplied report root") from exc


def _iter_wavs(paths: Iterable[Path]) -> Iterable[Path]:
    for path in paths:
        if path.is_dir():
            yield from sorted(candidate for candidate in path.rglob("*") if candidate.is_file())
        else:
            yield path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Inspect direct WAV recordings without exposing absolute paths."
    )
    parser.add_argument("paths", nargs="+", type=Path, help="WAV file(s) or folders")
    parser.add_argument(
        "--root",
        type=Path,
        help="root used only to emit a source-relative identifier in JSON",
    )
    parser.add_argument(
        "--indent", type=int, default=2, help="JSON indentation (default: 2)"
    )
    args = parser.parse_args(argv)

    reports: list[dict[str, Any]] = []
    try:
        for source_path in _iter_wavs(args.paths):
            if source_path.suffix.lower() != ".wav":
                continue
            report = inspect_wav(source_path)
            report["source"] = _relative_source_id(source_path, args.root)
            reports.append(report)
    except NativeWavError as exc:
        print(f"native_wav: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(reports, ensure_ascii=False, indent=args.indent, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
