# (@regress 없음 — 계측기 · 러너 밖 · T1445 · 판정 0)
# === scripts/t1445-heap-own.py — 큰 V8 힙 스냅숏에서 가장 큰 노드들의 "누가 쥐나"(잡는 쪽 사슬 · 칸 이름) ===
#   쓰는 법: python3 scripts/t1445-heap-own.py <파일.heapsnapshot> [위 N=25] [올라갈 층=6]
#   · numpy 로 nodes · edges 를 흘려 읽는다(수 GB · 몇 분) · 잡는 쪽은 약한 칸(weak)을 뺀 첫 잡는 쪽을 따라 올라간다.
import sys, re, json, numpy as np
P = sys.argv[1]; TOP = int(sys.argv[2]) if len(sys.argv) > 2 else 25; UP = int(sys.argv[3]) if len(sys.argv) > 3 else 6
import mmap
_F = open(P, 'rb'); raw = mmap.mmap(_F.fileno(), 0, access=mmap.ACCESS_READ)
meta = json.loads(re.search(rb'"meta":(\{.*?\}),"node_count"', raw[:1 << 20], re.S).group(1))
def ints(a, b, step=1 << 25):   # [a, b) 글자의 쉼표 · 줄바꿈 수 열 → int32 (조각마다 numpy 로 · 메모리 작게)
    out = []; i = a
    while i < b:
        j = min(b, i + step)
        if j < b: j = raw.rfind(b',', i, j) + 1
        u = np.frombuffer(raw[i:j], dtype=np.uint8); dig = (u >= 48) & (u <= 57)
        sep = ~dig; start = dig & np.concatenate([[True], sep[:-1]])
        sid = np.cumsum(start) - 1; di = np.nonzero(dig)[0]; g = sid[di]
        n = g[-1] + 1 if len(g) else 0; v = np.zeros(n, np.int64)
        # 자리 값: 그 수의 끝에서 몇째 자리인가
        endpos = np.zeros(n, np.int64); np.maximum.at(endpos, g, di)
        pw = endpos[g] - di; np.add.at(v, g, (u[di] - 48).astype(np.int64) * (10 ** pw))
        out.append(v.astype(np.int32)); i = j
    return np.concatenate(out) if out else np.zeros(0, np.int32)
NF, EF = meta['node_fields'], meta['edge_fields']; NT, ET = meta['node_types'][0], meta['edge_types'][0]
def arr(key):
    a = raw.find(b'"' + key + b'":['); b = raw.find(b']', a)
    return ints(a + len(key) + 4, b), b
nodes, nb = arr(b'nodes'); edges, eb = arr(b'edges')
nf, ef = len(NF), len(EF); N = nodes.reshape(-1, nf); E = edges.reshape(-1, ef)
iT, iN, iS, iC = NF.index('type'), NF.index('name'), NF.index('self_size'), NF.index('edge_count')
# strings
sa = raw.find(b'"strings":[', eb); strings = json.loads(raw[sa + 10: raw.rfind(b']') + 1])
frm = np.repeat(np.arange(len(N), dtype=np.int32), N[:, iC])                       # 칸마다 잡는 쪽 노드
to = E[:, 2] // nf; et = E[:, 0]; en = E[:, 1]
weak = ET.index('weak')
order = np.argsort(to, kind='stable'); to_s = to[order]
def holders(i):
    lo, hi = np.searchsorted(to_s, i), np.searchsorted(to_s, i, 'right')
    ks = order[lo:hi]; return [k for k in ks if et[k] != weak]
def nm(i):
    t = NT[N[i, iT]]; s = strings[N[i, iN]] if N[i, iN] < len(strings) else '?'
    return f'{t}:{s[:50]!r}'
def ename(k):
    t = ET[et[k]]
    return f'[{en[k]}]' if t in ('element', 'hidden') else f'.{strings[en[k]][:40]}' if en[k] < len(strings) else f'.{en[k]}'
big = np.argsort(-N[:, iS])[:TOP]
for i in big:
    line = [f'{N[i, iS] / 1e6:8.1f} MB {nm(i)}']; cur = i; seen = {i}
    for _ in range(UP):
        hs = holders(cur)
        if not hs: break
        k = hs[0]; p = frm[k]
        if p in seen: break
        seen.add(p); line.append(f'{ename(k)} ← {nm(p)}' + (f' (+{len(hs) - 1})' if len(hs) > 1 else '')); cur = p
    print('\n    '.join(line))
# ── 묶음 셈(`AGG=1`): 노드마다 첫 잡는 칸(약한 칸 포함 · 쌓인 차례 첫째) — (노드 종류:이름 · 칸 이름 · 잡는 쪽 종류:이름) 마다 수 · 자기 크기 합
import os
if os.environ.get('AGG'):
    import collections
    has = np.ones(len(to_s), bool); has[1:] = to_s[1:] != to_s[:-1]
    fe = order[has]; tgt = to_s[has]                      # 노드 tgt 의 첫 잡는 칸 fe
    key = collections.Counter(); sz = collections.Counter()
    S_ = N[:, iS]
    # 큰 몫만(노드 자기 크기 ≥ 16 바이트) — 이름 문자열은 첫 40 자
    for k, t in zip(fe.tolist(), tgt.tolist()):
        s = int(S_[t])
        if s < 16: continue
        p = int(frm[k]); en_ = ename(k); en_ = '[]' if en_.startswith('[') or en_[1:].isdigit() else en_
        kk = (NT[N[t, iT]] + ':' + strings[N[t, iN]][:30], en_[:30], NT[N[p, iT]] + ':' + strings[N[p, iN]][:30])
        key[kk] += 1; sz[kk] += s
    for kk, z in sz.most_common(int(os.environ.get('AGG'))): print(f'{z / 1e6:8.1f} MB {key[kk]:>9,}  {kk[0]!r:34s} {kk[1]:30s} ← {kk[2]!r}')
