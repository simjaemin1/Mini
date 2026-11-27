"""Rare completion/liveness check; deliberately does not read game logs."""
import json
import os
from pathlib import Path
import subprocess

out = Path(os.environ.get("T1481_OUT", "/workspace/scratch/t1481-main870"))
pid = int((out / "pid").read_text())
rows = subprocess.check_output(
    ["ps", "-eo", "pid,ppid,sid,state,etime,time,pcpu,rss,args", "--no-headers"],
    text=True,
).splitlines()
found = {}
for row in rows:
    fields = row.split(None, 8)
    if len(fields) != 9:
        continue
    p, parent, sid, state, elapsed, cpu, pct, rss, args = fields
    role = None
    if int(p) == pid:
        role = "controller"
    elif Path(args.split()[0]).name == "node":
        if "t1308-long-run.js 872 42" in args and str(out) in args:
            role = "runner"
        elif str(Path(__file__).resolve().parents[2] / "server/zone.js") in args:
            role = "zone"
    if role:
        found[role] = dict(pid=int(p), state=state, alive=state != "Z", elapsed=elapsed,
                           cpu=cpu, cpuPct=float(pct), rssKB=int(rss), sid=int(sid))
done = (out / "done").read_text().strip() if (out / "done").exists() else None
print(json.dumps({"done": done, "processes": found}, ensure_ascii=False))
