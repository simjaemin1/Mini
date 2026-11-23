#!/usr/bin/env python3
# T1433 그림 — 800날 판 1020(T1379 자 그대로) · 끔(지금 main) 회색 점선 · 켬(T1433_TERR_SEQ=1) 주홍 실선 · 인구 상한 합 파랑 점쇄선
#   ① 영토 칸(끔 판) vs 인구 상한 합 Σ(올림(인구 ÷ 6) × 600 + 1,500) ② 영토 칸 ÷ 인구 ③ village_buildings 행 ④ DB 쓰는 MB(쪽 − 빈 쪽)
import json, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.ticker import FuncFormatter
D = os.path.dirname(os.path.abspath(__file__)); OUT = sys.argv[1] if len(sys.argv) > 1 else 'T1433_01_영토행.png'
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
OFF = dict(c='#8a8984', ls=(0, (5, 3)), lw=2.2)
ON = dict(c='#eb6834', ls='-', lw=2.6)
CAP = dict(c='#2a78d6', ls=(0, (6, 2, 1, 2)), lw=2.0)
def uniq(S):   # 같은 날 사본(d800 · dEnd)은 하나만
    out, seen = [], set()
    for s in S:
        d = 800 if s['name'] == 'dEnd' else s['day']
        if d in seen: continue
        seen.add(d); out.append(s)
    return out
A = uniq(json.load(open(os.path.join(D, '진단-끔.json')))['snaps'])
B = uniq(json.load(open(os.path.join(D, '진단-켬.json')))['snaps'])
day = lambda s: 800 if s['name'] == 'dEnd' else s['day']
xa, xb = [day(s) for s in A], [day(s) for s in B]
thou = FuncFormatter(lambda v, _: f'{int(v):,}')
fig, axs = plt.subplots(2, 2, figsize=(12, 9.6), facecolor=SURF)
axs = axs.flatten()
def deco(ax, title, unit):
    ax.set_facecolor(SURF); ax.set_title(title, loc='left', fontsize=12.5, color=INK, pad=10)
    ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    for s in ('left', 'bottom'): ax.spines[s].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=9.5); ax.set_xlabel('날', color=INK2, fontsize=10); ax.set_ylabel(unit, color=INK2, fontsize=10)
    ax.set_xlim(0, 820); ax.yaxis.set_major_formatter(thou)
def lab(ax, x, y, t, c, dy=0):
    ax.annotate(t, (x, y), xytext=(6, dy), textcoords='offset points', color=INK, fontsize=9.5, va='center')
# ① 영토 칸 vs 상한 합
ax = axs[0]; deco(ax, '① 영토 칸(끔 판) — 인구 상한 식을 따라 넓어진다', '칸')
ax.plot(xa, [s['terr']['live'] for s in A], color=INK, lw=2.4, marker='o', ms=4.5, label='영토 칸 = 영토 행(죽은 행 0)')
ax.plot(xa, [s['capSum'] for s in A], **CAP, label='인구 상한 합 Σ(올림(인구÷6)×600+1,500)')
lab(ax, xa[-1], A[-1]['terr']['live'], f"{A[-1]['terr']['live']:,}", INK, 8); lab(ax, xa[-1], A[-1]['capSum'], f"{A[-1]['capSum']:,}", INK, -8)
ax.set_ylim(0, None); ax.legend(frameon=False, fontsize=9.5, loc='lower right')
# ② 칸 ÷ 인구
ax = axs[1]; deco(ax, '② 영토 칸 ÷ 인구 — 사람이 늘수록 1명에 ~100칸으로', '칸/명')
ax.plot(xa, [s['livePerPop'] for s in A], color=INK, lw=2.4, marker='o', ms=4.5)
for i in (0, len(A) - 1): lab(ax, xa[i], A[i]['livePerPop'], f"{A[i]['livePerPop']} (인구 {A[i]['pop']:,})", INK, 8 if i == 0 else -10)
ax.set_ylim(0, 190)
# ③ village_buildings 행
ax = axs[2]; deco(ax, '③ village_buildings 행 — 끔 vs 켬(묶음 행)', '행')
ax.plot(xa, [s['rows']['village_buildings'] for s in A], **OFF, label='끔(칸 하나 = 행 하나)')
ax.plot(xb, [s['rows']['village_buildings'] for s in B], **ON, label='켬(마을 하루 몫 = 행 하나)')
lab(ax, xa[-1], A[-1]['rows']['village_buildings'], f"{A[-1]['rows']['village_buildings']:,}", INK); lab(ax, xb[-1], B[-1]['rows']['village_buildings'], f"{B[-1]['rows']['village_buildings']:,}", INK)
ax.set_ylim(0, None); ax.legend(frameon=False, fontsize=9.5, loc='upper left')
# ④ DB MB
ax = axs[3]; deco(ax, '④ DB 쓰는 크기 — 끔 vs 켬', 'MB')
ax.plot(xa, [s['usedMB'] for s in A], **OFF, label='끔'); ax.plot(xb, [s['usedMB'] for s in B], **ON, label='켬')
lab(ax, xa[-1], A[-1]['usedMB'], f"{A[-1]['usedMB']} MB", INK); lab(ax, xb[-1], B[-1]['usedMB'], f"{B[-1]['usedMB']} MB", INK)
ax.set_ylim(0, None); ax.legend(frameon=False, fontsize=9.5, loc='upper left')
for a in axs: a.set_xlim(0, 900)
fig.suptitle('T1433 — 영토 행: 왜 느나(①②) · 묶어 적으면(③④) · 800날 판 1020 · 세계 지문 같음', x=0.02, ha='left', fontsize=14, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(OUT, dpi=200, facecolor=SURF)
print(OUT)
