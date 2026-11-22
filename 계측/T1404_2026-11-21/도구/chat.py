#!/usr/bin/env python3
# T1404 채팅 글 — out/sum.json · out/tabYear.md · ev/extra.json → out/chat.md
#   python3 chat.py <보고 커밋> <날짜>
import json, os, sys, statistics as stt
D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, 'out')
H, DATE = sys.argv[1], sys.argv[2]
S = json.load(open(os.path.join(OUT, 'sum.json'), encoding='utf-8'))
X = json.load(open(os.path.join(D, 'ev', 'extra.json'), encoding='utf-8'))
SEEDS = ['1020', '7', '42']
f0 = lambda x: '—' if x is None else f'{x:,.0f}'
f2 = lambda x: '—' if x is None else f'{x:.2f}'
f3 = lambda x: '—' if x is None else f'{x:.3f}'
pc = lambda x: '—' if x is None else f'{x * 100:.1f}%'
def g(t, k): o = S.get(t); return (o.get(k) if (not o.get('partial') or k in ('y1', 'day', 'plan', 'partial', 'tag', 'heapPeak', 'heap365', 'heapEnd', 'heap2000', 'heap1500', 'pairsSeries')) else None) if o else None
def ser(a, k, fmt=f0): return ' · '.join(fmt(g(f'{a}_{s}', k)) for s in SEEDS)
def rat(a, b): return None if (a is None or not b) else a / b
def ratio(a, k): return ' · '.join(f2(rat(g(f'{a}_{s}', k), g(f'OFF_{s}', k))) for s in SEEDS)
def med(xs): xs = [x for x in xs if x is not None]; return stt.median(xs) if xs else None
dO = med([w for s in SEEDS for w in (g(f'OFF_{s}', 'denWalk') or [])]); dA = med([w for s in SEEDS for w in (g(f'ALL_{s}', 'denWalk') or [])])
L = []
A = L.append
A(f"가지 올렸다 `{H}` — T1404 도적은 길목에서 산다(손잡이 넷 · 다 끔 기본) · `batch/bandit-live-1120` · 보고 `보고/T1404_{DATE}.md` · 회부 {len(X['hoebu'])}")
A('')
A('**한 줄 답:** ' + X['answer'])
A('')
A('| (1020 · 7 · 42 · 두 해) | 끔(지금) | 넷 다 켬 |')
A('|---|---|---|')
A(f"| 소굴 → 쓰인 교역로 걸음(가운데) | {f0(dO)}칸 | {f0(dA)}칸 |")
A(f"| 단 평균 · 단원 봉우리 | {ser('OFF', 'gMean', f2)} · {ser('OFF', 'mPeak')} | {ser('ALL', 'gMean', f2)} · {ser('ALL', 'mPeak')} |")
A(f"| 단 굶어 죽음 | {ser('OFF', 'gStarve')} | {ser('ALL', 'gStarve')} |")
A(f"| 약탈 건 · 털린 캐러밴 몫 | 0 | {ser('ALL', 'lootN')} · {ser('ALL', 'raidShare', pc)} |")
A(f"| 행상 피살 | 0 | {ser('ALL', 'killed')} |")
A(f"| 사냥 · 채집(더미에 든 식량) | 0 | {ser('ALL', 'fgFood')} |")
A(f"| 교역 식량 수입 끔비 | 1 | {ratio('ALL', 'foodImp')} |")
A(f"| 인구 730 끔비 | 1 | {ratio('ALL', 'popEnd')} |")
A(f"| 빈 마을 | {ser('OFF', 'empty')} | {ser('ALL', 'empty')} |")
A(f"| 가난한 다섯 굶어 죽음 | {ser('OFF', 'poor5')} | {ser('ALL', 'poor5')} |")
A(f"| 호위(2년째 캐러밴 하나) · 목책 끝 | {ser('OFF', 'escY2', f3)} · {ser('OFF', 'palEnd', lambda x: '—' if x is None else f'{x:.1f}')} | {ser('ALL', 'escY2', f3)} · {ser('ALL', 'palEnd', lambda x: '—' if x is None else f'{x:.1f}')} |")
A(f"| 전쟁 조건 360날(1020) — 약탈 · 단 굶어 죽음 · 인구 끔비 · 빈 마을 | 0 · {f0(g('OFF_W', 'gStarve'))} · 1 · {f0(g('OFF_W', 'empty'))} | {f0(g('ALL_W', 'lootN'))} · {f0(g('ALL_W', 'gStarve'))} · {f2(rat(g('ALL_W', 'popEnd'), g('OFF_W', 'popEnd')))} · {f0(g('ALL_W', 'empty'))} |")
A(f"| 상인이 단을 모르는 대조(1020 · 제품 밖) — 식량 수입 · 인구 끔비 · 빈 마을 | — | {f2(rat(g('NOFEAR_1020', 'foodImp'), g('OFF_1020', 'foodImp')))} · {f2(rat(g('NOFEAR_1020', 'popEnd'), g('OFF_1020', 'popEnd')))} · {f0(g('NOFEAR_1020', 'empty'))} |")
A('')
A('**도적단의 한 해**(넷 다 켠 세계 · 1020 · 첫 해 · 달 = 30날)')
A('')
A(open(os.path.join(OUT, 'tabYear.md'), encoding='utf-8').read().strip())
A('')
for l in X['plain'][2:]: A(l)
A('')
gd = {r[0]: r[1] for r in X['guard']}
A('지키기: ' + ' · '.join([
    '끈 판 같음 1/1 · 경제 400/400 · 생활층 400/400',
    't17 6,198',
    '게이트 셋',
    '규약 다섯',
    '만진 하네스 ' + X.get('hTouch', '—'),
    'core ' + next((v for k, v in gd.items() if k.startswith('CI core')), '—'),
    '서버 잡 ' + next((v for k, v in gd.items() if k.startswith('서버 잡')), '—'),
    '새 하네스 20/20 · 미끼 3/3 · 옛 코드 빨강 ○',
    '배포 0 · force 0']))
A('')
A('회부(판정 재료): ' + ' / '.join(f"{i}. " + h.split('**')[1].strip() for i, h in enumerate(X['hoebu'], 1) if '**' in h))
open(os.path.join(OUT, 'chat.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('\n'.join(L))
