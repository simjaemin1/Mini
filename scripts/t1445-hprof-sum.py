# (@regress 없음 — 계측기 · 러너 밖 · T1445 · 판정 0)
# === scripts/t1445-hprof-sum.py — 힙 표본 프로파일(HeapProfiler.stopSampling 의 profile)을 함수 · 쌓인 자리마다 산 몫으로 ===
#   쓰는 법: python3 scripts/t1445-hprof-sum.py <hprof.json> [위 N=30]
#   · 자기 몫(selfSize · 그 함수가 바로 만든 것) · 포함 몫(그 함수 아래 전부)을 함수 이름 · 파일:줄마다 합한다.
import sys, json, collections, os
P = sys.argv[1]; TOP = int(sys.argv[2]) if len(sys.argv) > 2 else 30
prof = json.load(open(P)); root = prof['head']
self_ = collections.Counter(); incl = collections.Counter(); tot = 0
def key(cf): return f"{cf['functionName'] or '(익명)'} {os.path.basename(cf['url'] or '?')}:{cf['lineNumber'] + 1}"
def walk(n, stack):
    global tot
    k = key(n['callFrame']); s = n.get('selfSize', 0); tot += s; self_[k] += s
    st = stack + [k]
    sub = s
    for c in n.get('children', []): sub += walk(c, st)
    return sub
def walk2(n, seen):
    k = key(n['callFrame']); sub = n.get('selfSize', 0) + sum(walk2(c, seen | {k}) for c in n.get('children', []))
    if k not in seen: incl[k] += 0   # 자리만
    return sub
# 포함 몫(재귀 없이 — 한 줄기에서 같은 함수는 한 번)
def inc(n, seen):
    k = key(n['callFrame']); s = n.get('selfSize', 0)
    for c in n.get('children', []): s += inc(c, seen | {k})
    if k not in seen: incl[k] += s
    return s
walk(root, []); inc(root, frozenset())
print(f'산 표본 합 {tot / 1e6:.1f} MB')
print('\n자기 몫 위:'); [print(f'  {v / 1e6:8.1f} MB  {k}') for k, v in self_.most_common(TOP)]
print('\n포함 몫 위:'); [print(f'  {v / 1e6:8.1f} MB  {k}') for k, v in incl.most_common(TOP)]
