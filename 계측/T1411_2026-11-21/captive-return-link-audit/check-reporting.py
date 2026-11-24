"""2026-11-25: actual closed500 observations; no simulation worlds launched."""
import csv, hashlib, json, shutil, subprocess, sys, tempfile
from pathlib import Path

repo = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo/'scripts'))
from t1411_resident_audit import resident_link_audit

data = repo/'계측/T1411_2026-11-21/pair-1020-500'
with (data/'daily.csv').open() as f:
    rows = [r for r in csv.DictReader(f) if r['case'] == 'ON-1020']
assert len(rows) == 500
assert resident_link_audit([r for r in rows if int(r['day']) <= 400])['passed'] is True
try:
    resident_link_audit(rows)
except AssertionError as error:
    assert 'resident without linked physical body' in str(error)
else:
    raise AssertionError('strict default must reject actual resident identity gaps')
red = resident_link_audit(rows, report_gaps=True)
assert red['passed'] is False and red['status'] == 'RED'
assert red['affectedDays'] == [467, 490] and red['maxMissingResidents'] == 1
root = Path('/tmp/t1411')
with tempfile.TemporaryDirectory(prefix='identity-prefix500-', dir=root) as td:
    stage = Path(td)/'runs'
    output = Path(td)/'output'
    stage.mkdir()
    for name in ['ON-1020', 'OFF-1020']:
        source = root/'worlds'/name
        dest = stage/name
        dest.mkdir()
        progress = json.loads((source/'progress.json').read_text())
        assert progress['ck'] >= 500
        segments = [s for s in progress['segs'] if s['to'] <= 500]
        assert len(segments) == 50
        for segment in segments:
            for file in source.glob(f"seg-{segment['from']}.*"):
                if file.is_file():
                    (dest/file.name).symlink_to(file)
        progress.update(segs=segments, ck=500, done=False)
        (dest/'progress.json').write_text(json.dumps(progress))
        shutil.copyfile(root/'worlds'/(name+'.launch.json'), stage/(name+'.launch.json'))
    subprocess.run([sys.executable, str(repo/'scripts/t1411-collect.py'), '--runs', str(stage),
                    '--out', str(output), '--allow-live', '--report-link-gaps',
                    '--cases', 'ON-1020,OFF-1020'], check=True, stdout=subprocess.DEVNULL)
    before = json.loads((data/'summary.json').read_text())
    after = json.loads((output/'summary.json').read_text())
    for name, result in before.items():
        for key, value in result.items():
            assert after[name][key] == value, (name, key)
    assert after['ON-1020']['residentLinkAudit']['status'] == 'RED'
    assert after['ON-1020']['residentLinkAudit']['affectedDays'] == [467, 490]
    assert after['OFF-1020']['residentLinkAudit']['applicable'] is False
    assert all(not r['done'] and r['days'] == 500 and r['target'] == 730 for r in after.values())
print(json.dumps(dict(kind='offline-actual-prefix-check', physicalWorldsLaunched=0,
    strictDefaultRejectsActualGaps=True, reportModeRetainsRed=True,
    first400StrictPass=True, previous500MetricsUnchanged=True,
    incomplete730NotPromoted=True, affectedDays=red['affectedDays'],
    helperSha256=hashlib.sha256((repo/'scripts/t1411_resident_audit.py').read_bytes()).hexdigest())))
