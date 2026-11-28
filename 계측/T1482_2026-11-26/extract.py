"""Read preserved T1481 checkpoint, never mutate it; emit bounded diagnostic tables."""
import collections
import hashlib
import json
from pathlib import Path
import sqlite3
import shutil
import sys

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
scratch = Path(sys.argv[3])
scratch.mkdir(parents=True, exist_ok=True)
hashes = json.loads((src.parent / 'saved-870-sha256.json').read_text())
verified = {}
for name, expected in hashes.items():
    h = hashlib.sha256()
    with (src / name).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    verified[name] = {'expected': expected, 'actual': h.hexdigest(), 'same': expected == h.hexdigest()}
assert all(x['same'] for name, x in verified.items() if name != 'w.db-shm'), 'checkpoint data checksum mismatch'
(out / 'checkpoint-hashes.json').write_text(json.dumps(verified, indent=2) + '\n')
for name in ['w.db', 'w.db-wal', 'w.db-shm']:
    shutil.copyfile(src / name, scratch / name)
c = sqlite3.connect('file:' + str(scratch / 'w.db') + '?mode=ro', uri=True)
m = json.loads(c.execute('select data from world_meta where zone=?', ('hanbando',)).fetchone()[0])
war = next(w for w in m['t1167'] if w['id'] == 44)
vils = []
for name in [war['atk'], war['def']]:
    row = c.execute('select id,name,cx,cy,econ_state,day from villages where name=?', (name,)).fetchone()
    vils.append(dict(zip(['dbId', 'name', 'ccx', 'ccy', 'econ', 'day'], row)))
    vils[-1]['econ'] = json.loads(vils[-1]['econ'])
(scratch / 'input.json').write_text(json.dumps({'meta': {'anchor': m['anchor'], 't1167': m['t1167']}, 'villages': vils}))
keys = {'rng', 'seed', 'fight', 'ctx', 'warBodies', '_t821s', '_t804p', '_t804f', 'arrows', 'cd', 'mrl', '_mrl', 'advanceA', 'sides'}
def scan(obj):
    hits = collections.Counter()
    def walk(v):
        if isinstance(v, dict):
            for k, w in v.items():
                if k in keys: hits[k] += 1
                walk(w)
        elif isinstance(v, list):
            for w in v: walk(w)
    walk(obj)
    return dict(hits)
sidecars = {}
for name in ['state.json', 'keep-870.json', 'stop-870.json', 'phase-870.json']:
    x = json.loads((src / name).read_text())
    sidecars[name] = {'bytes': (src / name).stat().st_size, 'keys': list(x), 'relevantKeyCounts': scan(x)}
(out / 'storage-audit.json').write_text(json.dumps({
    'source': str(src), 'day': m['anchor']['day'], 'metaKeys': list(m),
    'warKeys': list(war), 'warArrowsLedger': war['arrows'], 'defAmmoLedger': war.get('_defAmmo'),
    'warRosterCount': len(war['_t1167Sol']), 'econRng': m['rng'], 'sidecars': sidecars,
    'bodyAllKeyUnion': sorted({k for v in vils for b in v['econ']['_t747Body']['rows'] for k in b.get('$all', {})}),
}, ensure_ascii=False, indent=2) + '\n')
print('checksum', sum(x['same'] for x in verified.values()), '/', len(verified), 'same; SHM lock metadata differs; input extracted; sidecars audited')
