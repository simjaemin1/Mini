#!/usr/bin/env python3
# T1342 그림 — 두 해 판(800날) · 묶음 세계 · 세 시드 합(세 시드가 다 있는 팔만) — 훅(`sbc-<시드>.json.t1275.json` 날 줄 · `.t1342.json` 마을-날 줄)만 읽는다
#   줄 셋(같은 날 축 · 축 하나씩): ① 인구(마을 명부 합 · 세 시드 합) ② K 위 죽음(인구 식이 가장 늙은 사람을 끌어낸 죽음 · 열흘 합) ③ 불행 이탈 떠남 · 문 앞에서 집으로 돌아옴(열흘 합)
#     ② ③ 은 t1342 훅이 있는 두 시드(1020 · 42) 합 — 묶음 그대로 7 은 T1334 판(훅 없음)이다
#   선 = 끔(기준선 · 회색 점선 — 견줄 자리라 일부러 회색) · 묶음 그대로(T1334 권고 줄 · 주홍 실선) · 묶음 + 문 앞에서 집으로(고침 · 파랑 굵은 실선) · ③ 의 돌아옴은 파랑 점선
#   ⚠색만으로 가르지 않는다(선 꼴 · 끝 값 글자) · 두 색(주홍 #D55E00 · 파랑 #0072B2)은 dataviz 검증기 여섯 검사 통과(색약 ΔE 21.9 · 정상 31.2)
#   옅은 띠 = 겨울(12 ~ 2월 · 날 275 ~ 364 · 640 ~ 729) · 가는 세로줄 = 해 바뀜(날 365 · 730 = 3월 1일) · ② ③ 은 열흘이 다 찬 칸만(판 끝 반 칸은 뺀다)
# 실행: python3 t1342_plot.py <판 지도 JSON> <출력 폴더>
import json, sys, os, collections
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
MAP = json.load(open(sys.argv[1])); OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
p = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if os.path.exists(p): fm.fontManager.addfont(p)
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'DejaVu Sans']; plt.rcParams['axes.unicode_minus'] = False
SEEDS = ['1020', '7', '42']
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
ARMS = [('off', '끔(기준선)', '#6B7280', ':', 1.5), ('BKAM', '묶음 그대로(T1334 권고 줄)', '#D55E00', '-', 1.8), ('BKG2', '묶음 + 문 앞에서 집으로(고침)', '#0072B2', '-', 2.4)]
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5); ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
    for a, b in ((275, 364), (640, 729)): ax.axvspan(a, b, color='#EEF2F7', zorder=0, linewidth=0)
    for d in (365, 730): ax.axvline(d, color='#9CA3AF', linewidth=0.8, zorder=1)
S2 = ['1020', '42']
def load(a):
    e = (MAP.get(a) or {}).get('seeds') or {}
    if not all(s in e and e[s].get('dir') for s in SEEDS): return None
    pop = collections.Counter(); kov = collections.Counter(); dep = collections.Counter(); back = collections.Counter()
    mx = 10 ** 9
    for s in SEEDS:
        d = e[s]['dir']
        for q in json.load(open(os.path.join(d, f'sbc-{s}.json.t1275.json')))['days']: pop[q[0]] += q[1]
    for s in S2:
        d = e[s]['dir']
        J = json.load(open(os.path.join(d, f'sbc-{s}.json.t1342.json'))); C = {c: i for i, c in enumerate(J['cols'])}
        for r in J['rows']: kov[r[C['day']] // 10 * 10] += r[C['kovD']] or 0; dep[r[C['day']] // 10 * 10] += r[C['dep']] or 0
        for t in J['trips']:
            if t[1] == t[3]: back[t[2] // 10 * 10] += 1
        mx = min(mx, max(r[C['day']] for r in J['rows']))
    cut = lambda c: collections.Counter({x: v for x, v in c.items() if x + 9 <= mx})   # 열흘이 다 찬 칸만(판 끝 반 칸은 뺀다)
    return pop, cut(kov), cut(dep), cut(back)
D = {a: load(a) for a, *_ in ARMS}
fig, axs = plt.subplots(3, 1, figsize=(10.5, 10.2), sharex=True, gridspec_kw={'hspace': 0.28})
ax = axs[0]; style(ax)
for a, lab, c, ls, lw in ARMS:
    if not D[a]: continue
    P = D[a][0]; xs = sorted(P); ax.plot(xs, [P[x] for x in xs], color=c, linestyle=ls, linewidth=lw, label=lab)
    ax.annotate(f'{P[xs[-1]]:,}', (xs[-1], P[xs[-1]]), xytext=(4, 0), textcoords='offset points', fontsize=8.5, color=INK, va='center')
ax.set_title('① 인구(마을 명부 합 · 세 시드 합 · 명)', loc='left', fontsize=11, color=INK)
ax.legend(loc='upper left', fontsize=8.5, frameon=False)
ax = axs[1]; style(ax)
for a, lab, c, ls, lw in ARMS:
    if not D[a]: continue
    K = D[a][1]; xs = sorted(K); ax.plot([x + 5 for x in xs], [K[x] for x in xs], color=c, linestyle=ls, linewidth=lw, label=lab)
ax.set_title('② K 위 죽음(땅 · 땔감 K 를 넘긴 마을에서 인구 식이 끌어낸 가장 늙은 사람 · 열흘 합 · 1020 · 42 합 · 명)', loc='left', fontsize=11, color=INK)
ax = axs[2]; style(ax)
if D['BKAM']:
    G = D['BKAM'][2]; xs = sorted(G); ax.plot([x + 5 for x in xs], [G[x] for x in xs], color='#D55E00', linewidth=1.8, label='떠남 — 묶음 그대로')
if D['BKG2']:
    G = D['BKG2'][2]; xs = sorted(G); ax.plot([x + 5 for x in xs], [G[x] for x in xs], color='#0072B2', linewidth=2.4, label='떠남 — 고침')
    B = D['BKG2'][3]; xs = sorted(B); ax.plot([x + 5 for x in xs], [B[x] for x in xs], color='#0072B2', linestyle='--', linewidth=1.6, label='문 앞에서 집으로 돌아옴 — 고침')
ax.set_title('③ 불행 이탈 — 떠남 · 문 앞에서 집으로 돌아옴(열흘 합 · 1020 · 42 합 · 명)', loc='left', fontsize=11, color=INK)
ax.legend(loc='upper left', fontsize=8.5, frameon=False)
ax.set_xlabel('날(날 0 = 1년 3월 1일 · 365 · 730 = 3월 1일 · 옅은 띠 = 겨울 12 ~ 2월)', fontsize=9.5, color=INK2)
ax.set_xlim(0, 812)
fig.suptitle('T1342 두 해 판 — 묶음 세계 · 무리가 든 마을의 K 위 죽음과 문 앞에서 집으로', fontsize=13, color=INK, x=0.06, ha='left')
out = os.path.join(OUT, 'T1342_01_무리와문.png'); fig.savefig(out, dpi=150, bbox_inches='tight'); print(out)
