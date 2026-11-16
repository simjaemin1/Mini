#!/usr/bin/env python3
# (러너 밖 · T1323) 판정 칸 쓰기 자리 전수 — 걸음 문 안(npcStep · 결정 · 생활층 한 몸 틱에서만 닿는 함수) / 문 밖(그 밖에서도 닿는 함수)으로 가른다.
#   정적 · 이름 부름 그래프(`이름(` · `.이름(` 토큰) · 최상위 함수 단위. 쓰기 = `<몸 변수>.<칸> =` · `++` · `--` · `+=` · `-=`.
import re, glob, json, sys, collections, os
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
F = ['canadiaVillage','nextDecisionAt','simEvacUntil','behavior','npcHomeX','npcHomeY','npcBedX','npcBedY','simLonOff','_t720','targetX','targetY','gatherTarget','harvestTarget',
     'canadiaTask','path','_t791P','_t791Pn','_t791Px','_t791Py','pathIndex','x','y','_t670TkX','_t670TkY','_t670Tk','_pathFor','_stuckN','vx','vy','hp','_stuckPos','simVillageId','simJob','floor','onStairId']
W = re.compile(r'\b(npc|p|b|body|pp|ep|bd|nb|q2)\.(' + '|'.join(map(re.escape, F)) + r')\s*(=(?!=)|\+\+|--|\+=|-=)')
FN = re.compile(r'^(?:async\s+)?function\s+([\w$]+)\s*\(')
STEP_ROOTS = {'npcStep', 'decideNpcBehavior', 'npcLifeTick', 'detectStuck', 'unstuckNpc', 'followNpcPath', 'computeNpcPath', '_t1145Detect', '_t1145Follow', '_t1140Detect', '_t670Stuck', '_t1145Stuck', '_t791Mir', '_desTimed'}
funcs = {}   # name -> (file, start, end, text)
for f in sorted(glob.glob(os.path.join(ROOT, 'server', '*.js'))):
    L = open(f, encoding='utf8').read().split('\n'); cur = None; st = 0
    for i, l in enumerate(L):
        m = FN.match(l)
        if m: cur = m.group(1); st = i
        elif cur and l == '}':
            funcs.setdefault(cur, (os.path.basename(f), st + 1, i + 1, '\n'.join(L[st:i + 1]))); cur = None
names = set(funcs)
NC = lambda t: re.sub(r'(?<![:\'"\\])//[^\n]*', '', t)   # 줄 주석 뺌(이름이 주석에만 나오면 부름 · 넘김이 아니다)
callers = collections.defaultdict(set)
tok = re.compile(r'(?<![\w$])([\w$]+)\s*\(')
for n, (_, _, _, t) in funcs.items():
    body = NC(t.split('\n', 1)[1] if '\n' in t else '')
    for m in tok.finditer(body):
        c = m.group(1)
        if c in names and c != n: callers[c].add(n)
    # 값으로 넘김(콜백 · deps) — `이름,` `: 이름` 은 문 밖 부름으로 본다
# 최상위 코드(함수 밖)에서 부르거나 값으로 넘긴 이름 = 문 밖 입구
top_ref = set()
for f in glob.glob(os.path.join(ROOT, 'server', '*.js')):
    L = open(f, encoding='utf8').read().split('\n'); inF = False; inX = False
    for l in L:
        if FN.match(l): inF = True; continue
        if inF and l == '}': inF = False; continue
        if re.match(r'^module\.exports\s*=\s*\{', l): inX = True   # 내보내기 덩이(하네스 탐침 람다 포함) — 입구는 다른 서버 파일의 실제 부름으로만 센다
        if inX:
            if re.match(r'^\}', l): inX = False
            continue
        if not inF and not re.match(r'^\s*(module\.exports|init, |[\w$]+(, [\w$]+)*,?\s*(//.*)?$)', l):   # 내보내기 줄(이름 목록)은 입구가 아니다 — 다른 파일이 실제로 부르는 것만(아래)
            for m in re.finditer(r'(?<![\w$])([\w$]+)(?![\w$])', NC(l)):
                if m.group(1) in names: top_ref.add(m.group(1))
# 다른 파일이 `.이름(` 으로 부르는 것 = 입구(존 → `SimVillages.이름(` · deps 등)
for f in glob.glob(os.path.join(ROOT, 'server', '*.js')):
    T = NC(open(f, encoding='utf8').read())
    for m in re.finditer(r'\.([\w$]+)\s*\(', T):
        n = m.group(1)
        if n in names and funcs[n][0] != os.path.basename(f) and n not in STEP_ROOTS: top_ref.add(n)
# 값으로 넘김(함수 안에서 `이름` 이 부름 아닌 꼴로 나옴) = 문 밖 입구로 친다(콜백이 어디서 불릴지 모른다)
for n, (_, _, _, t) in funcs.items():
    for m in re.finditer(r'(?<![\w$.])([\w$]+)(?![\w$])(?!\s*\()', NC(t.split('\n', 1)[1] if '\n' in t else '')):
        c = m.group(1)
        if c in names and c != n and c not in STEP_ROOTS: top_ref.add(c)
# 걸음 문 안 = 걸음 뿌리이거나, 모든 부르는 이가 걸음 문 안(고정점) · 문 밖 입구가 아니다
inside = set(STEP_ROOTS)
changed = True
while changed:
    changed = False
    for n in names:
        if n in inside or n in top_ref: continue
        cs = callers.get(n, set())
        if cs and all(c in inside for c in cs): inside.add(n); changed = True
rows = []
for n, (f, a, b, t) in funcs.items():
    for j, l in enumerate(t.split('\n')):
        for m in W.finditer(NC(l)):
            rows.append({'file': f, 'line': a + j, 'fn': n, 'field': m.group(2), 'inside': n in inside})
def cat(r):
    fn, f = r['fn'], r['file']
    if f == 'villages.js':
        if re.search(r'war|War|muster|Muster|_mu|evac|Evac|battle|Battle|_t1104|_t1041|_bx', fn): return '전쟁'
        if re.search(r'aravan|_t775|trade|Trade|_t1080|_t1136', fn): return '캐러밴'
        if re.search(r'house|House|_t400|_t707|build|Build|_t1181|bed|Bed|_t1039|_t765|_xz', fn): return '집 행위 · 짓기 · 몸 잇기'
        return '생활층(그 밖)'
    if f == 'zone.js': return '존'
    return f.replace('.js', '')
out = [r for r in rows if not r['inside']]
C = collections.Counter(cat(r) for r in out)
print(f'판정 칸 쓰기 {len(rows)} · 걸음 문 안 {len(rows) - len(out)} · 문 밖 {len(out)}')
for k, v in C.most_common(): print(f'  {k:16s} {v}')
FC = collections.Counter((cat(r), r['fn']) for r in out)
print('\n문 밖 함수(쓰기 수):')
for (c, fn), v in FC.most_common(80): print(f'  {v:3d} {c} · {fn} ({funcs[fn][0]}:{funcs[fn][1]}) — {",".join(sorted(set(r["field"] for r in out if r["fn"] == fn)))}')
if len(sys.argv) > 2: json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
