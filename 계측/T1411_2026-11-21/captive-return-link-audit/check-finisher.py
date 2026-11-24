"""Offline synthetic terminal outcomes: never launch worlds or edit the real report."""
import hashlib, json, shutil, subprocess, tempfile
from pathlib import Path

repo = Path(__file__).resolve().parents[3]
names = [f'{arm}-{seed}' for seed in [1020, 7, 42] for arm in ['ON', 'OFF']]
with tempfile.TemporaryDirectory(prefix='t1411-final-report-', dir='/tmp') as td:
    base = Path(td)
    fake, root = base/'repo', base/'root'
    (fake/'scripts').mkdir(parents=True)
    (fake/'보고').mkdir()
    data = fake/'계측/T1411_2026-11-21'
    data.mkdir(parents=True)
    worlds = root/'worlds'
    worlds.mkdir(parents=True)
    subprocess.run(['git', 'init', '-q', str(fake)], check=True)
    report = fake/'보고/T1411_2026-11-21.md'
    report.write_text('SYNTHETIC FIXTURE\n## 0. 진행 상태\n| 후보·긴 판 | 미완료 |\n| 남은 것 | 대기 |\n730날 완료·실패 비율은 아직 집계하지 않는다. 긴 판이 끝나면 실제 수치로 갱신한다.\n')
    summary = {}
    for name in names:
        arm, seed = name.split('-')
        failed = name == 'OFF-42'
        red = name == 'ON-1020'
        result = dict(done=not failed, failed=failed, days=120 if failed else 730,
            target=730, pop=123, cpuMeanAll=1.0, points={}, actualExit={'code':7 if failed else 0},
            launch=dict(days=730, every=10, seed=int(seed), arm=arm, source={},
                env={'VILLAGE_NPC_CAP':'Infinity', 'VILLAGE_DAY_MS':'1440000'}),
            residentLinkAudit=dict(passed=False if red else None, status='RED' if red else 'not-applicable',
                affectedDays=[467,490] if red else [], maxMissingResidents=1 if red else 0))
        summary[name] = result
        (worlds/name).mkdir()
        (worlds/name/'progress.json').write_text(json.dumps({'done':not failed,'ck':120 if failed else 730}))
        (worlds/(name+'.exit.json')).write_text(json.dumps(result['actualExit']))
    (root/'candidate-manifest.json').write_text(json.dumps({'featureSource':{}}))
    (root/'campaign.json').write_text(json.dumps({'stage':'worlds-finished','worlds':{n:{} for n in names}}))
    (fake/'fixture.json').write_text(json.dumps(summary))
    (fake/'scripts/t1411-collect.py').write_text('''import json,sys,pathlib
assert '--report-link-gaps' in sys.argv
out=pathlib.Path(sys.argv[sys.argv.index('--out')+1]);out.mkdir(parents=True)
(out/'summary.json').write_text(pathlib.Path('fixture.json').read_text())
''')
    subprocess.run(['python3', str(repo/'scripts/t1411-finish.py'), '--root', str(root), '--repo', str(fake)], check=True, stdout=subprocess.DEVNULL)
    text = report.read_text()
    assert '종료 실패 1/6' in text and '마을 ID 연결 빨강 1팔 · 회부 1' in text
    assert '| OFF-42 | 120 | False | True |' in text
    assert '| ON-1020 | 467, 490 | 1 |' in text
    assert '| 후보·긴 판 | 지문100/100 · 6팔 종료 관측' in text
    assert not (root/'finalized.json').exists()
print(json.dumps(dict(kind='offline-synthetic-finisher-check', physicalWorldsLaunched=0,
    realReportTouched=False, redRetained=True, failed120NotPromoted=True,
    failedExitPreserved=True, implicitCommitPush=False,
    finisherSha256=hashlib.sha256((repo/'scripts/t1411-finish.py').read_bytes()).hexdigest())))
