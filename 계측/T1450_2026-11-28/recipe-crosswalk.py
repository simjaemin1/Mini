#!/usr/bin/env python3
"""Extract T718's original recipe identities without counting repeated cost tables."""
import hashlib, json, re
from collections import Counter
from pathlib import Path

out = Path(__file__).resolve().parent
root = out.parent.parent
ref = '설계/조사_가치사슬_T718.md'
source = (root/ref).read_text()
rows = []
for line, text in enumerate(source.splitlines(), 1):
    if not text.startswith('|'):
        continue
    cells = [s.strip() for s in text.split('|')[1:-1]]
    if len(cells)<5 or not re.fullmatch(r'[ESL]\d{2}',cells[0]) or cells[1] not in ('E','S','L'):
        continue
    rows.append(dict(id=cells[0],layer=cells[1],recipe=cells[2],actor=cells[3],
        oldSource=cells[-1],referenceLine=line,referenceMarkdown=text,
        currentStatus='unreviewed',directCostGate=None,directUseGate=None,
        jobValueComparison=None,currentSource=[]))
assert len(rows)==len({r['id'] for r in rows})==83
assert Counter(r['layer'] for r in rows)==dict(E=28,S=54,L=1)
result=dict(reference=ref,referenceDate='2026-10-13',
    referenceSha256=hashlib.sha256(source.encode()).hexdigest(),
    scope='Original 83 recipe rows only, excluding repeated cost tables; current classification pending.',rows=rows)
evidence=out/'manual-recipes-evidence.json'
if evidence.exists():
    manual=json.loads(evidence.read_text())
    for file,digest in manual['sourceFiles'].items():
        assert hashlib.sha256((root/file).read_bytes()).hexdigest()==digest, file
    by_id={r['id']:r for r in rows}
    assert len(manual['rows'])==len({r['id'] for r in manual['rows']})==50
    for review in manual['rows']:
        r=by_id[review['id']]
        r.update({k:review[k] for k in ('currentStatus','directCostGate','directUseGate','jobValueComparison')})
        r['actorKind']=review['actorKind']; r['reviewNote']=review['note']
        r['currentSource']=[manual['functions'][n] for n in review['functions']]
    result['manualReviewScope']=manual['scope']
(out/'recipe-crosswalk-draft.json').write_text(json.dumps(result,ensure_ascii=False,indent=1)+'\n')
print(json.dumps(dict(originalRecipes=83,manualEntryReviews=sum(r['currentStatus']=='manual-entry-reviewed' for r in rows),
    stillUnreviewed=sum(r['currentStatus']=='unreviewed' for r in rows))))
