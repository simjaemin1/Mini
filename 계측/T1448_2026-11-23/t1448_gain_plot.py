#!/usr/bin/env python3
# T1448 얻은 것 그림 — 진단 자(`scripts/t1448-road-diag.js`) 갈래 full(끔) · gfull(켬 첫 부팅 = 이관) · gboot2(켬 다시 부팅) · fall/gfall/gfall2(꺼진 사이 다 닳은 부팅)
#   칸 여덟(작은 그림 여럿 · 칸마다 축 하나): ① 장부 메모리 ② 가득 청소 한 번 ③ 부팅 ④ 종료 저장 덩이 ⑤ DB 행 ⑥ 하루 저장(밟기 3.8만 칸 하루 · 묶음 합) ⑦ 꺼진 사이 다 닳은 부팅(갈래 fall 이 있을 때) ⑧ welcome 길 몫 · 보이는 구역 상자
#   색 = 끔 파랑(#2a78d6) · 켬 주황(#eb6834) — 검사 `dataviz/validate_palette.js` 다 통과 · 막대 위 값(색에만 기대지 않는다)
# 쓰는 법: python3 t1448_gain_plot.py <diag.json> <out.png>
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker
from matplotlib import font_manager as fm

D = json.load(open(sys.argv[1], encoding='utf-8'))['probes']; OUT = sys.argv[2]
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
OFF, ON = '#2a78d6', '#eb6834'
F, G, G2 = D['full'], D['gfull'], D.get('gboot2', {})
FA, GA, GA2 = D.get('fall', {}), D.get('gfall', {}), D.get('gfall2', {})
fmt = lambda v, u: (f'{v:,.0f}{u}' if v >= 100 else f'{v:,.1f}{u}')
panels = [
    ('① 길 장부 메모리(MB · 힙 + 배열 · 방송 등급까지)', [('끔', F['totalMB'], OFF), ('켬', G['totalMB'], ON)], ' MB'),
    ('② 가득 청소 한 번(ms · 다섯 번 가운데)', [('끔', F['gcMs'], OFF), ('켬', G['gcMs'], ON)], ' ms'),
    ('③ 부팅(초 · 존 장부 init)', [('끔', F['initMs'] / 1000, OFF), ('켬 첫\n(이관)', G['initMs'] / 1000, ON), ('켬 다시', (G2.get('initMs') or 0) / 1000, ON)], ' 초'),
    ('④ 종료 저장 덩이(MB · t1382Dump 글자)', [('끔', F['dumpMB'], OFF), ('켬', G['dumpMB'], ON)], ' MB'),
    ('⑤ DB 행(존 하나)', [('끔', F['dbRows']['cell'], OFF), ('켬', G['dbRows']['chunk'], ON)], ' 행'),
    ('⑥ 하루 저장 묶음 합(ms · 밟기 3.8만 칸 하루)', [('끔', F['day1']['flushMs'], OFF), ('켬', G['day1']['flushMs'], ON)], ' ms'),
]
if FA and GA and GA2:
    panels.append(('⑦ 꺼진 사이 다 닳은 부팅(초 · 날 + 400)', [('끔', FA['initMs'] / 1000, OFF), ('켬 첫\n(이관)', GA['initMs'] / 1000, ON), ('켬 다시', GA2['initMs'] / 1000, ON)], ' 초'))
    panels.append(('⑧ welcome 길 몫(MB) · 보이는 구역만', [('통째', F['clientJsonMB'], OFF), ('통째', G['clientJsonMB'], ON), ('화면 둘레 5×4 상자\n(서버 문)', G['box']['jsonKB'] / 1024, ON, f"{G['box']['jsonKB']} KB")], ' MB'))
n = len(panels); cols = 4 if n > 6 else 3; rows = (n + cols - 1) // cols
fig, axs = plt.subplots(rows, cols, figsize=(4.4 * cols, 3.6 * rows), facecolor=SURF)
axs = [a for r in axs for a in r] if rows > 1 else list(axs)
for ax, (title, bars, unit) in zip(axs, panels):
    ax.set_facecolor(SURF)
    xs = range(len(bars)); vals = [b[1] for b in bars]
    rects = ax.bar(xs, vals, width=0.58, color=[b[2] for b in bars], edgecolor=SURF, linewidth=2, zorder=3)
    for r, v, b in zip(rects, vals, bars):
        ax.text(r.get_x() + r.get_width() / 2, r.get_height(), b[3] if len(b) > 3 else fmt(v, unit), ha='center', va='bottom', fontsize=9.5, color=INK, zorder=4)
    ax.set_xticks(list(xs)); ax.set_xticklabels([b[0] for b in bars], fontsize=9.5, color=INK2)
    ax.set_title(title, loc='left', fontsize=10.5, color=INK, pad=8)
    ax.set_ylim(0, max(vals) * 1.22 if max(vals) > 0 else 1)
    ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s_ in ('top', 'right'): ax.spines[s_].set_visible(False)
    for s_ in ('left', 'bottom'): ax.spines[s_].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f'{v:,.0f}' if v >= 10 or v == 0 else f'{v:g}'))
for ax in axs[n:]: ax.axis('off')
fig.suptitle('T1448 — 길 장부를 칸 배열로(라이브 11-09 사본 · 길 68만 칸) — 끔(파랑) ↔ 켬(주황) · 값은 한 칸도 같다', x=0.02, ha='left', fontsize=13, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.94))
fig.savefig(OUT, dpi=170, facecolor=SURF)
print(OUT)
