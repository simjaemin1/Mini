"""Detached run owner. Completion is recorded even when the shell runner fails."""
import json
import os
from pathlib import Path
import signal
import subprocess
import time

root = Path(__file__).resolve().parents[2]
out = Path(os.environ.get("T1481_OUT", "/workspace/scratch/t1481-main870"))
out.mkdir(parents=True, exist_ok=True)
status = {"pid": os.getpid(), "started": time.time(), "exit": None}
(out / "controller.json").write_text(json.dumps(status) + "\n")
(out / "pid").write_text(str(os.getpid()) + "\n")


def interrupted(signum, _frame):
    raise SystemExit(128 + signum)


signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGHUP, interrupted)
rc = 1
try:
    with (out / "launcher.log").open("ab", buffering=0) as log:
        rc = subprocess.run(
            ["bash", str(root / "계측/T1481_2026-11-25/run-diagnosis.sh")],
            cwd=root, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
            check=False,
        ).returncode
except BaseException as exc:
    status["exception"] = repr(exc)
    if isinstance(exc, SystemExit) and isinstance(exc.code, int):
        rc = exc.code
finally:
    status.update(exit=rc, finished=time.time())
    (out / "controller.json").write_text(json.dumps(status) + "\n")
    (out / "done").write_text(str(rc) + "\n")
raise SystemExit(rc)
