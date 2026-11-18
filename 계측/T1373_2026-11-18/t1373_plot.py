#!/usr/bin/env python3
# T1373 그림 — ① 세계 인구(시드 1020 세 해 · 지금 · ⓐ · ⓐ + ⑤) ② 달마다 K 위 죽음 땅 몫 · 땔감 몫(지금 · ⓐ) ③ 달마다 곳간에 든 식량(⑤ 팔)
#   python3 t1373_plot.py <t1373_table.py JSON> <out.png>
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
T = json.load(open(sys.argv[1])); OUT = sys.argv[2]
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
ST = {'N': dict(c='#8a8986', ls=(0, (5, 3)), lw=1.6, lab='지금(T1373_HOME_CAP=0)'),
      'A': dict(c='#2a78d6', ls='-', lw=2.4, lab='ⓐ 땅 상한 = 집터 수(켬 기본)'),
      'NSA': dict(c='#eb6834', ls='-', lw=1.6, lab='ⓐ + ⑤ 계절 배수만 끔(T1373_NO_SEASON_YIELD=1)')}
def seed(a, s='1020'):
    e = T.get(a)
    return e and e['seeds'].get(s)
fig = plt.figure(figsize=(11, 12.5), facecolor=SURF)
gs = fig.add_gridspec(3, 1, height_ratios=[1.15, 1.0, 1.0], hspace=0.42)
axs = [fig.add_subplot(gs[i]) for i in range(3)]
last = max([int(seed(a)['last']) for a in ST if seed(a)] or [800])
def deco(ax, title, ylab, xs=True):
    ax.set_facecolor(SURF)
    if xs:
        for y0 in (275, 640, 1005):
            if y0 < last: ax.axvspan(y0, min(y0 + 89, last), color='#eef3fb', lw=0, zorder=0)
        for yb in (365, 730):
            if yb < last: ax.axvline(yb, color=INK2, lw=0.7, ls=':', zorder=1)
        ax.set_xlim(0, last)
    ax.grid(axis='y', color=GRID, lw=0.6); ax.tick_params(colors=INK2, labelsize=9)
    for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
    for sp in ('left', 'bottom'): ax.spines[sp].set_color('#b9b8b2')
    ax.set_title(title, loc='left', fontsize=11.5, color=INK, pad=6); ax.set_ylabel(ylab, color=INK2, fontsize=9.5)
ax = axs[0]
for a, s in ST.items():
    o = seed(a)
    if not o: continue
    P = {int(k): v for k, v in o['P'].items()}; ds = sorted(P)
    ax.plot(ds, [P[d] for d in ds], color=s['c'], ls=s['ls'], lw=s['lw'], label=s['lab'], zorder=3)
    L = ds[-1]; ax.annotate(f"{P[L]:,}" + ('' if L >= last else f'(날 {L})'), (L, P[L]), xytext=(4, 0), textcoords='offset points', color=INK2, fontsize=8.5, va='center')
deco(ax, '① 세계 인구 — 시드 1020(겨울 12 ~ 2월 띠 · 점선 = 해 바뀜)', '사람(명)'); ax.legend(loc='upper left', frameon=False, fontsize=9)
ax = axs[1]
CAL = {int(k): v for k, v in json.load(open('/tmp/t1373r/cal.json')).items()}
SEQ = [f'{y}.{m:02d}' for y in (1, 2, 3) for m in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2)]
def months_of(o):   # 그 판이 다 돈 달만(마지막 달이 덜 찼으면 뺀다)
    L = int(o['last']); y = L // 365 + 1 if L < 1095 else 3
    ym = CAL.get(L); mm = ym[1] if ym else 2
    end = f'{min(y, 3)}.{mm:02d}'
    full = CAL.get(L + 1) is None or CAL.get(L + 1)[1] != mm
    out = []
    for k in SEQ:
        out.append(k)
        if k == end: break
    if not full and out: out = out[:-1]
    return out
months = []
for a in ('N', 'A'):
    o = seed(a)
    if o:
        mo = months_of(o)
        if len(mo) > len(months): months = mo
import numpy as np
x = np.arange(len(months)); W = 0.38
for j, a in enumerate(('N', 'A')):
    o = seed(a)
    if not o: continue
    ok = set(months_of(o))
    land = [o['mon'].get(m, [0, 0, 0])[0] if m in ok else 0 for m in months]; fuel = [o['mon'].get(m, [0, 0, 0])[1] if m in ok else 0 for m in months]
    xo = x + (j - 0.5) * W
    ax.bar(xo, land, W * 0.92, color='#c0392b' if a == 'N' else '#e8a29a', edgecolor=SURF, lw=1, label=f"{'지금' if a == 'N' else 'ⓐ'} — 땅 몫", zorder=3)
    ax.bar(xo, fuel, W * 0.92, bottom=land, color='#6b5a3e' if a == 'N' else '#b9a684', edgecolor=SURF, lw=1, label=f"{'지금' if a == 'N' else 'ⓐ'} — 땔감 몫", zorder=3)
ax.set_xticks(x); ax.set_xticklabels([m.split('.')[1] + ('\n' + m.split('.')[0] + '년' if m.endswith('.03') or m == months[0] else '') for m in months], fontsize=7.5)
deco(ax, '② 달마다 K 위 죽음 — 땅 몫(자리 slotK) · 땔감 몫(fuelK) · 시드 1020', '명', xs=False); ax.legend(loc='upper left', frameon=False, fontsize=8.5, ncol=2)
ax = axs[2]
for a, s in ST.items():
    o = seed(a)
    if not o or 'food' not in o: continue
    ks = [k for k in months_of(o) if k in o['food']]
    xs = [SEQ.index(k) for k in ks]
    ax.plot(xs, [o['food'][k] / 1000 for k in ks], color=s['c'], ls=s['ls'], lw=s['lw'], label=s['lab'], marker='o', ms=3)
ax.set_xticks(range(len(SEQ))); ax.set_xticklabels([k.split('.')[1] + ('\n' + k.split('.')[0] + '년' if k.endswith('.03') else '') for k in SEQ], fontsize=7.5)
deco(ax, '③ 달마다 곳간에 든 식량(곡식 + 생선 + 고기 · 세계 합 · 천 econ 단위)', '천', xs=False); ax.legend(loc='upper left', frameon=False, fontsize=9)
fig.suptitle('T1373 — 인구 상한의 땅 몫 = 집터 수 · 계절 산출 배수', x=0.02, ha='left', fontsize=12.5, color=INK, y=0.925)
fig.savefig(OUT, dpi=130, facecolor=SURF, bbox_inches='tight'); print('saved', OUT)
