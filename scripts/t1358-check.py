#!/usr/bin/env python3
"""T1358 requested focused gates. Preserve each command's real exit code and log."""
import subprocess, json, time, argparse
from pathlib import Path
p=argparse.ArgumentParser(); p.add_argument('--out',type=Path,required=True); a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parent.parent
commands=[('new-harness',['node','scripts/test-t1358-terr-stake.js']),
 ('touched',['node','scripts/touched-harness.js','origin/main','--run']),
 ('build-haul',['bash','scripts/run-regress.sh','test-t1181-build-defaults.js']),
 ('bundle',['node','sim/build-econ-bundle.js','--check']),
 ('inline',['node','sim/inline-engine.js','--check']),
 ('wiring',['node','scripts/lab-wiring-check.js']),
 ('t17',['node','scripts/t17-metrics.js','800','1020']),
 ('ci-list',['bash','scripts/run-regress.sh','test-ci-list.js'])]
res=[]
for name,cmd in commands:
 start=time.monotonic()
 with (a.out/(name+'.log')).open('wb') as log:r=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT)
 res.append(dict(name=name,cmd=cmd,exit=r.returncode,seconds=time.monotonic()-start))
 (a.out/'status.json').write_text(json.dumps(res,indent=1))
 print(name,'exit',r.returncode,flush=True)
raise SystemExit(int(any(r['exit'] for r in res)))
