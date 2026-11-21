#!/usr/bin/env python3
"""Run the T1411 focused gates sequentially, preserving every actual return code."""
import argparse, json, os, subprocess, time
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parent.parent
commands = [
    ('new-harness', ['node', 'scripts/test-t1411-terr-cpu.js']),
    ('old-code-red', ['bash', 'scripts/pm-old-code-red.sh', 'origin/main', 'test-t1411-terr-cpu.js']),
    ('touched', ['node', 'scripts/touched-harness.js', 'origin/main', '--run']),
    ('bundle', ['node', 'sim/build-econ-bundle.js', '--check']),
    ('inline', ['node', 'sim/inline-engine.js', '--check']),
    ('wiring', ['node', 'scripts/lab-wiring-check.js']),
    ('t17', ['node', 'scripts/t17-metrics.js', '800', '1020']),
    ('ci-list', ['bash', 'scripts/run-regress.sh', 'test-ci-list.js']),
    ('official-off', ['node', 'scripts/server-baseline-check.js',
                      '계측/서버기준선_2026-11-18.json', '--vclock', '--plan', '1020:400', '--par', '1']),
]
results = []
for name, command in commands:
    env = dict(os.environ)
    if name == 'old-code-red':
        env['OUT'] = str((a.out/'old-code-red-result.log').resolve())
    if name == 't17':
        env['T17_JSON'] = str((a.out/'t17.json').resolve())
    if name == 'touched':
        i = int(env.get('GIT_CONFIG_COUNT', '0'))
        env.update(GIT_CONFIG_COUNT=str(i + 1))
        env[f'GIT_CONFIG_KEY_{i}'] = 'core.quotePath'
        env[f'GIT_CONFIG_VALUE_{i}'] = 'false'
        plan = subprocess.run(['node', 'scripts/touched-harness.js', 'origin/main', '--json'],
                              cwd=root, env=env, capture_output=True, text=True, check=True)
        parsed = json.loads(plan.stdout)
        assert '_t1411StakeQuote' in parsed['names'], 'selector must see the actual product changes'
        (a.out/'touched-plan.json').write_text(json.dumps(parsed, ensure_ascii=False, indent=1))
    start = time.monotonic()
    with (a.out/(name+'.log')).open('wb') as log:
        r = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    if name == 'old-code-red' and r.returncode == 0:
        proof = (a.out/'old-code-red-result.log').read_text()
        assert '빨강 1 · 크래시 0 · 초록 0 · 모름 0' in proof, proof
    if name == 't17' and r.returncode == 0:
        measured = json.loads((a.out/'t17.json').read_text())
        assert sum(v['pop'] for v in measured['vpop']) == 6198, measured['vpop']
    results.append(dict(name=name, command=command, exit=r.returncode, seconds=time.monotonic()-start))
    (a.out/'status.json').write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(name, 'exit', r.returncode, flush=True)
raise SystemExit(int(any(row['exit'] for row in results)))
