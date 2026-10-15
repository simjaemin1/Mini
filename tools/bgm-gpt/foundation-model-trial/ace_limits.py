"""Hard resource bounds for one private, offline inference process (no server)."""
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import shutil
import sys
import threading
import time

GIB = 1024 ** 3


@dataclass(frozen=True)
class ResourceCaps:
    max_seconds: float = 900
    max_rss_bytes: int = 12 * GIB
    min_free_disk_bytes: int = 12 * GIB

    def __post_init__(self):
        values = (self.max_seconds, self.max_rss_bytes, self.min_free_disk_bytes)
        if any(not math.isfinite(v) or v <= 0 for v in values):
            raise ValueError("Resource caps must be finite and positive")
        if self.max_seconds > 3600 or self.max_rss_bytes > 12 * GIB:
            raise ValueError("Pilot ceiling is 60 minutes / 12 GiB RSS")
        if self.min_free_disk_bytes < 12 * GIB:
            raise ValueError("Keep at least 12 GiB free disk")


def cap_violation(caps, *, elapsed, rss_bytes, free_disk_bytes, mps_driver_bytes=0):
    if elapsed > caps.max_seconds:
        return "wall_time_cap"
    if rss_bytes > caps.max_rss_bytes:
        return "process_rss_cap"
    if rss_bytes + mps_driver_bytes > caps.max_rss_bytes:
        return "rss_plus_mps_driver_conservative_cap"
    if free_disk_bytes < caps.min_free_disk_bytes:
        return "free_disk_floor"
    return None


class ResourceGuard:
    """Poll the actual process; a hard breach terminates it, never retries MPS.

    Use only in a disposable inference process. SIGALRM cannot reliably stop
    a blocked native kernel. This daemon instead emits a minimal diagnostic
    to stderr and calls os._exit(124). The parent must preserve stderr.
    RSS + driver pool is a conservative bound which may double-count; it is
    explicitly not a measurement of total physical unified-memory usage.
    """
    def __init__(self, output_dir, caps=None):
        self.output_dir = Path(output_dir).resolve(strict=True)
        self.caps = caps or ResourceCaps()
        self.stop = threading.Event()

    def snapshot(self):
        import psutil
        torch = sys.modules.get("torch")
        mps_bytes = 0
        if torch is not None and torch.backends.mps.is_available():
            mps_bytes = int(torch.mps.driver_allocated_memory())
        return {"elapsed": time.monotonic() - self.started,
                "rss_bytes": psutil.Process().memory_info().rss,
                "mps_driver_bytes": mps_bytes,
                "free_disk_bytes": shutil.disk_usage(self.output_dir).free}

    def __enter__(self):
        self.started = time.monotonic()
        self.initial = self.snapshot()
        reason = cap_violation(self.caps, **self.initial)
        if reason:
            raise RuntimeError(reason)
        self.thread = threading.Thread(target=self._watch, daemon=True)
        self.thread.start()
        return self

    def _watch(self):
        while not self.stop.wait(0.5):
            try:
                state = self.snapshot()
                reason = cap_violation(self.caps, **state)
            except Exception as exc:
                state, reason = {"error_type": type(exc).__name__}, "watchdog_failed"
            if reason:
                print(json.dumps({"status": "resource_aborted", "reason": reason,
                                  **state}), file=sys.stderr, flush=True)
                os._exit(124)

    def __exit__(self, *_exc):
        self.stop.set()
        self.thread.join(timeout=1)
        self.final = self.snapshot()
        reason = cap_violation(self.caps, **self.final)
        if reason:
            raise RuntimeError(reason)
