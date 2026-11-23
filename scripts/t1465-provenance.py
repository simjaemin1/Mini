#!/usr/bin/env python3
"""Seal completed evidence; never include unfinished runs as accepted results."""
import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
card = root / '계측/T1465_2026-11-23'
read = lambda name: json.loads((card / name).read_text())
assert read('결과.json')['complete']
assert read('하네스-집계.json')['complete']
assert len(read('자연물-대조-결과.json')) == 2
assert len(read('슬롯-대조-결과.json')) == 2
assert len(read('존주소-대조-결과.json')['controls']) == 2
assert len(read('광맥별-장기-합계검증.json')['checks']) == 6
provenance = read('출처.json')
provenance['remoteLong']['completion'] = 'Both OFF/ON completed10950days,30annualrows; ON daily exhaustion witness10950days; retained3650/10585/10950 canonical snapshots independently checked.'
provenance['remoteLong']['protocol'] = provenance['remoteLong']['protocol'].replace(' Completion validation pending.', '')
detail = ' Final initial-red and controlled-rerun counts are in 하네스-집계.json; no failed initial result was replaced.'
if detail not in provenance['localTouchedRuntime']:
    provenance['localTouchedRuntime'] += detail
provenance['evidenceAssembledAtCommit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
provenance['acceptedResult'] = '결과.json'
detail = '; 중단-장기판 is explicitly incomplete, never accepted as30years.'
if detail not in provenance['excluded']:
    provenance['excluded'] += detail
skip = {'출처.json', '자료-해시.json', '결과-진행.json'}
hashes = {str(p.relative_to(card)): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in sorted(card.rglob('*')) if p.is_file() and p.name not in skip}
manifest = card / '자료-해시.json'
manifest.write_text(json.dumps({'algorithm': 'sha256', 'files': hashes}, ensure_ascii=False, indent=2)+'\n')
provenance['evidenceHashManifest'] = {'file': manifest.name, 'sha256': hashlib.sha256(manifest.read_bytes()).hexdigest(), 'files': len(hashes)}
(card / '출처.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2)+'\n')
print('Sealed', len(hashes), 'completed and explicitly classified evidence files.')
