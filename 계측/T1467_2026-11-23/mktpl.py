# 틀 세계 몸 늘리기(계측 전용) — 마을마다 주민 기록을 되풀이해 붙인다(새 id) · 인구 · 집 · 곳간 · 금고 수 × 배율
import sqlite3, json, sys, shutil
src, dst, f = sys.argv[1], sys.argv[2], float(sys.argv[3])
for s in ['', '-wal', '-shm']:
    try: shutil.copyfile(src + s, dst + s)
    except FileNotFoundError: pass
d = sqlite3.connect(dst); nid = 900000; tot = 0
def scale(o):
    for k, v in list(o.items()):
        if isinstance(v, (int, float)) and not isinstance(v, bool): o[k] = v * f
for vid, es in d.execute('select id, econ_state from villages').fetchall():
    e = json.loads(es); P = e['npcs']; n0 = len(P); want = round(n0 * f); i = 0
    while len(P) < want:
        c = json.loads(json.dumps(P[i % n0])); c['id'] = 'n%d' % nid; nid += 1; P.append(c); i += 1
    if isinstance(e.get('housing'), (int, float)): e['housing'] = round(e['housing'] * f)
    for k in ('storage', 'treasury'):
        if isinstance(e.get(k), dict): scale(e[k])
    tot += len(P)
    d.execute('update villages set econ_state=?, population=? where id=?', (json.dumps(e, ensure_ascii=False), len(P), vid))
d.commit(); d.execute('pragma wal_checkpoint(TRUNCATE)'); d.close(); print(dst, '주민 기록', tot)
