#!/usr/bin/env python3
# T1419 그림 — 랩 800날 세 시드(1020 굵게 · 7 · 42 가늘게) · 팔 셋(끔 회색 점선 · (가) 파랑 · (나) 주황)
#   ① 사람 ② 굶어 죽음 누계 ③ 나무꾼 0 마을-날 %(100날 창) ④ 곳간 나무 1 밑 마을 ⑤ 식량 날치 가운데 ⑥ 광산 일곱 사람 합
import json, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
O = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs'); OUT = sys.argv[1] if len(sys.argv) > 1 else 'T1419_01_식량30.png'
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
ST = {'off': dict(c='#8a8984', ls=(0, (5, 3)), lab='끔(지금 main · 30날치)'), 'harv': dict(c='#2a78d6', ls='-', lab='(가) 버틸 날(세계에서 유도)'), 'flow': dict(c='#eb6834', ls='-', lab='(나) 문 걷기 · 먹은 흐름')}
PRE = {'off': 'Loff', 'harv': 'Lharv', 'flow': 'Lflow'}
D = {}
for a in ST:
    for s in ('1020', '7', '42'):
        f = f'{O}/{PRE[a]}-{s}.t1419.json'
        if os.path.exists(f): D[(a, s)] = json.load(open(f))['marks']
P = [('pop', '① 사람', '명', None), ('fdDead', '② 굶어 죽음(누계)', '명', None), ('lj0', '③ 나무꾼 0 마을-날 %(100날 창)', '%', None),
     ('wood0', '④ 곳간 나무 1 밑 마을(51곳 중)', '곳', None), ('fdMed', '⑤ 식량 날치 가운데(곳간 ÷ 사람)', '날', None), ('mines', '⑥ 광산 일곱 사람 합(T1384 자)', '명', None)]
fig, axs = plt.subplots(3, 2, figsize=(12, 13), facecolor=SURF)
axs = axs.flatten()
for ax, (k, title, unit, _) in zip(axs, P):
    ax.set_facecolor(SURF)
    ends = []
    for a, st in ST.items():
        for s in ('1020', '7', '42'):
            m = D.get((a, s))
            if not m: continue
            xs = [0] + [x['day'] for x in m]
            def val(x):
                return sum(v or 0 for v in x['mines']) if k == 'mines' else x[k]
            first = {'pop': None, 'fdDead': 0, 'lj0': None, 'wood0': None, 'fdMed': None, 'mines': None}[k]
            ys = [first] + [val(x) for x in m]
            if first is None: xs, ys = xs[1:], ys[1:]
            thick = s == '1020'
            ax.plot(xs, ys, color=st['c'], ls=st['ls'], lw=2.4 if thick else 1.0, alpha=1.0 if thick else 0.55, label=st['lab'] if thick else None, zorder=3 if thick else 2)
            if thick: ends.append((xs[-1], ys[-1], st['c']))
    for yb in (365, 730):
        ax.axvline(yb, color=INK2, lw=0.7, ls=':', zorder=1)
    for y0 in (275, 640):
        ax.axvspan(y0, y0 + 89, color='#eef3fb', lw=0, zorder=0)
    ax.set_xlim(0, 880); ax.grid(axis='y', color=GRID, lw=0.6); ax.tick_params(colors=INK2, labelsize=9)
    for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
    for sp in ('left', 'bottom'): ax.spines[sp].set_color('#b9b8b2')
    ax.set_title(title, loc='left', fontsize=11.5, color=INK, pad=6); ax.set_ylabel(unit, color=INK2, fontsize=9.5)
    ax.set_xlabel('날(겨울 12 ~ 2월 띠 · 점선 = 해 바뀜)', color=INK2, fontsize=9)
    lo, hi = ax.get_ylim(); gap = (hi - lo) * 0.07; ys_used = []
    for x, y, c in sorted(ends, key=lambda t: t[1]):
        yy = y if not ys_used or y - ys_used[-1] >= gap else ys_used[-1] + gap
        ys_used.append(yy)
        ax.annotate(f'{y:,.0f}' if (abs(y) >= 10 or float(y).is_integer()) else f'{y:.1f}', (x, y), xytext=(x + 14, yy), textcoords='data', color=INK2, fontsize=8.5, va='center', arrowprops=dict(arrowstyle='-', color=c, lw=1.1, shrinkA=0, shrinkB=0))
axs[0].legend(loc='upper left', frameon=False, fontsize=9)
fig.suptitle('T1419 식량 30날치를 걷는다 — 랩 800날 · 굵은 선 시드 1020 · 가는 선 7 · 42(값 글 = 1020 끝)', x=0.04, ha='left', fontsize=13.5, color=INK, y=0.995)
fig.tight_layout(rect=(0, 0, 1, 0.975))
fig.savefig(OUT, dpi=110, facecolor=SURF)
print('wrote', OUT)
