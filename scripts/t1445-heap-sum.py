# (@regress 없음 — 계측기 · 러너 밖 · T1445 · 판정 0)
# === scripts/t1445-heap-sum.py — 큰 V8 힙 스냅숏(.heapsnapshot · 수 GB)을 흘려 읽어 생성자 · 종류마다 자기 크기 합 ===
#   쓰는 법: python3 scripts/t1445-heap-sum.py <파일.heapsnapshot> [위 N=40]
#   · JSON 을 통째로 안 읽는다 — "nodes" 배열을 조각으로 흘려 (종류, 이름 칸) 마다 셈 · 크기를 모으고, 끝의 "strings" 에서 이름만 찾는다.
#   · 문자열 노드(종류 string · concatenated string · sliced string)는 이름 = 글자 앞부분 — 같은 글자 앞부분끼리 묶인다(어떤 글자가 큰가).
import sys, re, json, collections
P = sys.argv[1]; TOP = int(sys.argv[2]) if len(sys.argv) > 2 else 40
f = open(P, 'rb')
head = f.read(1 << 20).decode('utf8', 'replace')
m = re.search(r'"meta":(\{.*?\}),"node_count"', head, re.S)
meta = json.loads(m.group(1))
NF = meta['node_fields']; TYPES = meta['node_types'][0]; nf = len(NF)
iT, iN, iS = NF.index('type'), NF.index('name'), NF.index('self_size')
f.seek(0); buf = b''
# "nodes":[ 찾기
while True:
    c = f.read(1 << 22)
    if not c: raise SystemExit('nodes 없음')
    buf += c; k = buf.find(b'"nodes":[')
    if k >= 0: buf = buf[k + 9:]; break
    buf = buf[-16:]
agg = collections.defaultdict(lambda: [0, 0]); tot = collections.defaultdict(lambda: [0, 0]); row = []; done = False; n = 0
num = re.compile(rb'-?\d+')
while not done:
    e = buf.find(b']')
    part, rest = (buf, b'') if e < 0 else (buf[:e], buf[e + 1:])
    # 조각 끝의 잘린 수는 다음 조각으로
    if e < 0:
        cut = max(part.rfind(b','), 0); part, rest = part[:cut], part[cut:]
    for x in num.findall(part):
        row.append(int(x))
        if len(row) == nf:
            t = TYPES[row[iT]]; key = (t, row[iN]); a = agg[key]; a[0] += 1; a[1] += row[iS]; b = tot[t]; b[0] += 1; b[1] += row[iS]; row = []; n += 1
    if e >= 0: done = True; buf = rest; break
    buf = rest + f.read(1 << 22)
    if not buf: break
# "strings":[ 찾기 — 필요한 이름만
need = set(k[1] for k, v in sorted(agg.items(), key=lambda kv: -kv[1][1])[:TOP * 3])
while True:
    k = buf.find(b'"strings":[')
    if k >= 0: buf = buf[k + 11:]; break
    c = f.read(1 << 24)
    if not c: raise SystemExit('strings 없음')
    buf = buf[-16:] + c
names = {}; idx = 0
dec = json.JSONDecoder()
s = buf.decode('utf8', 'replace'); pos = 0
while True:
    while pos < len(s) and s[pos] in ' ,\n\r\t': pos += 1
    if pos >= len(s) or s[pos] == ']':
        if pos < len(s) or not (c := f.read(1 << 24)): break
        s = s[pos:] + c.decode('utf8', 'replace'); pos = 0; continue
    try: v, end = dec.raw_decode(s, pos)
    except ValueError:
        c = f.read(1 << 24)
        if not c: break
        s = s[pos:] + c.decode('utf8', 'replace'); pos = 0; continue
    if idx in need: names[idx] = v[:80]
    idx += 1; pos = end
    if idx > max(need) and len(names) >= len(need): break
print(f'노드 {n:,} · 종류마다(자기 크기 MB):')
for t, (c, z) in sorted(tot.items(), key=lambda kv: -kv[1][1]): print(f'  {t:20s} {c:>12,} {z / 1e6:10.1f}')
print(f'\n위 {TOP} (종류 · 이름 → 수 · MB):')
for (t, ni), (c, z) in sorted(agg.items(), key=lambda kv: -kv[1][1])[:TOP]: print(f'  {t:12s} {repr(names.get(ni, ni))[:70]:72s} {c:>10,} {z / 1e6:9.1f}')
