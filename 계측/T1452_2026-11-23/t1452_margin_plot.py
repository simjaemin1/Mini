#!/usr/bin/env python3
# T1452 여유분 그림 — 여유분(뜻밖의 누적 줄의 한 해 낙폭)이 무엇으로 크나
#   ① 밭 세계 재는 판(1020 · 420날 · 장부 셈 자 `tr` 칸) — 마을 꼴 넷(사람 가운데 마을)의 뜻밖의 누적 줄 x(날치)
#   ② 랩 재는 판(1020 · 450날)의 x — 밭 없음 · 첫 해((가) 흐름) 내리막 → 둘째 해(지난 해 같은 날) 오르막
#   ③ 세 세계 여유분(장부 · 날 366 ~ 400 · 690 ~ 729) ↔ 같은 판의 겪은 낙폭(T1437 — 곳간 꼭대기 → 바닥 · 둘째 해) — 가운데 · 열에 아홉(t1452_extra.py)
#   색 = 여유분 앞 창 파랑(#2a78d6) · 뒤 창 보라(#6250d6) · 겪은 낙폭 주황(#eb6834) · 마을 꼴 넷 = 파랑 · 주황 · 초록(#1baf7a) · 보라(#6250d6)(검사 `dataviz/validate_palette.js` 통과 · 초록 대비 경고 → 선 이름을 칸 안에 바로 적는다)
# 쓰는 법: python3 t1452_margin_plot.py <out.png> <farm bench.json> <lab bench.json> <extra.json>
import json, sys, re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

OUT, FB, EB, EX = sys.argv[1:5]
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
CT = {'농촌': '#2a78d6', '어촌': '#eb6834', '광산': '#1baf7a', '임업': '#6250d6'}
typ = lambda n: re.sub(r'[0-9]+$', '', n or '')

def pick(tr):   # 마을 꼴마다 사람 가운데 마을 하나(끝까지 산 마을)
    by = {}
    for nm, rows in tr.items():
        if len(rows) < 60: continue
        by.setdefault(typ(nm), []).append((sorted(r[9] for r in rows)[len(rows) // 2], nm))
    out = []
    for t in ('농촌', '어촌', '광산', '임업'):
        L = sorted(by.get(t, []))
        if L: out.append((t, L[len(L) // 2][1]))
    return out

def series(rows):
    xs = [r[1] for r in rows]; x0 = [r[2] for r in rows]; x1 = [x0[0]]; miss = []
    for k in range(1, len(rows)):
        a, b = rows[k - 1], rows[k]; dx = b[2] - a[2]
        fmA = (a[5] or 0) + (a[6] or 0); hv = (b[8] or 0) - (a[8] or 0)
        m = fmA > 0 and hv < 0.5 * fmA and dx < 0
        if m: miss.append(xs[k])
        x1.append(x1[-1] + (0 if m else dx))
    return xs, x0, x1, miss

def style(ax):
    ax.set_facecolor(SURF); ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s_ in ('top', 'right'): ax.spines[s_].set_visible(False)
    for s_ in ('left', 'bottom'): ax.spines[s_].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=8.5)

fig = plt.figure(figsize=(13, 12.5), facecolor=SURF)
gs = fig.add_gridspec(3, 1, height_ratios=[1.15, 1.0, 0.95])
for row, (path, wn) in enumerate(((FB, '① 밭 세계(T1421 판 조건 E · 재는 판 · 1020)'), (EB, '② 랩(끔 세계 · 재는 판 · 1020 · 밭 없음)'))):
    ax = fig.add_subplot(gs[row]); style(ax)
    d = json.load(open(path)); tr = d.get('tr') or {}
    for t, nm in pick(tr):
        xs, x0, x1, miss = series(tr[nm])
        ax.plot(xs, x0, color=CT[t], lw=1.9, zorder=3)
        ax.text(xs[-1] + 2, x0[-1], f'{nm}', color=INK, fontsize=9, va='center')
    ax.axhline(0, color=INK2, lw=0.8)
    ax.axvline(365.5, color=INK2, lw=0.8, ls=':', zorder=1)
    ax.text(365.5, ax.get_ylim()[1], ' 이력이 한 해 참(날 366 부터 ⓑ = 지난 해 같은 날)', color=INK2, fontsize=8.5, va='top')
    ax.set_ylabel('뜻밖의 누적(날치)', color=INK2, fontsize=9)
    ttl = wn + ' — 뜻밖의 누적 줄 x(어제 예상한 하루 차 − 실제를 날마다 더함) · 여유분 = 이 줄의 한 해 가장 깊은 낙폭'
    ax.set_title(ttl, loc='left', fontsize=10.5, color=INK, pad=6)
    ax.set_xlabel('날', color=INK2, fontsize=9)
ax = fig.add_subplot(gs[2]); style(ax)
X = json.load(open(EX))
W = [('밭 세계(재는 판 · 세 시드)', 'FS'), ('랩 끔 세계(재는 판 · 세 시드)', 'LS'), ('평형 판(재는 판 · 첫 해 없음)', 'EQS')]
import numpy as np
x = np.arange(len(W)); w = 0.26
SER = (('장부 여유분 · 날 366 ~ 400(첫 해가 창에 다 듦)', '#2a78d6', lambda t: X[t]['bufWin'].get('366-400')),
       ('장부 여유분 · 날 690 ~ 729(첫 해가 창을 거의 빠짐)', '#6250d6', lambda t: X[t]['bufWin'].get('690-729')),
       ('겪은 낙폭(T1437 셈 · 같은 판 · 둘째 해)', '#eb6834', lambda t: X[t]['seen2']))
top = 0
for j, (nm, col, get) in enumerate(SER):
    vals = [get(t) or {'med': 0, 'p90': 0} for _, t in W]
    med = [v['med'] or 0 for v in vals]; p90 = [v['p90'] or 0 for v in vals]; top = max(top, max(med))
    ax.bar(x + (j - 1) * w, med, width=w * 0.92, color=col, edgecolor=SURF, linewidth=2, label=nm, zorder=3)
    for xi, m, p in zip(x + (j - 1) * w, med, p90):
        ax.text(xi, m, f'{m:,.0f}\n(열에 아홉\n{p:,.0f})', ha='center', va='bottom', fontsize=8.3, color=INK)
ax.set_xticks(x); ax.set_xticklabels([n for n, _ in W], fontsize=9.5, color=INK2)
ax.set_ylabel('날치(마을-날 가운데)', color=INK2, fontsize=9)
ax.set_ylim(0, top * 1.55)
ax.legend(frameon=False, fontsize=8.8, loc='upper right')
ax.set_title('③ 여유분(장부)은 첫 해 내리막이 창에 있을 때 겪은 낙폭의 다섯 배 · 창이 지나가면 가운데는 더 작다(계획한 감소가 빠짐) — 꼬리(열에 아홉)는 두껍다', loc='left', fontsize=10.5, color=INK, pad=6)
fig.suptitle('T1452 여유분이 무엇으로 크나', x=0.02, ha='left', fontsize=13, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.97))
fig.savefig(OUT, dpi=170, facecolor=SURF)
print(OUT)
