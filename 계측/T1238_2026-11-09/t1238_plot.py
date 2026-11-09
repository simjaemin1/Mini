#!/usr/bin/env python3
# T1238 그림 — 판 JSON(`scripts/t1238-table.js` 가 쓴 t1238-table.json)만 읽는다 · 세계 0
#   시드마다(열) NPC 영토 · 인구 · 나무꾼 · 통나무 막힘(누적 %) — T1207 켬 단독 ↔ T1207 + T1238 켬 · 끔(기준선)은 끝 날 인구 점(줄 없음 — 기준선 판에 훅이 없다)
# 실행: python3 계측/T1238_2026-11-09/t1238_plot.py <출력 폴더>
import json, sys, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE
os.makedirs(OUT, exist_ok=True)
p = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if os.path.exists(p): fm.fontManager.addfont(p)
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
# Okabe–Ito(색약 안전 · 고정 차례): T1207 단독 = 회색 점선 · T1207 + T1238 = 주황 · 끔 = 파랑 점
STY = {'t1207': ('#6B7280', '--', 'T1207 켬 단독'), 'v2': ('#D55E00', '-', 'T1207 + T1238 켬(영토 v2)')}
OFFC = '#0072B2'
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
def dodge(ax, ends, gap=11.0):
    if not ends: return
    ax.figure.canvas.draw()
    tr = ax.transData
    pts = sorted([(tr.transform((x, y))[1], x, y, t) for x, y, t in ends], key=lambda q: q[0])
    pos = []
    for py, x, y, t in pts:
        q = py if not pos or py - pos[-1] >= gap * ax.figure.dpi / 72 else pos[-1] + gap * ax.figure.dpi / 72
        pos.append(q)
    for (py, x, y, t), q in zip(pts, pos):
        ax.annotate(t, (x, y), textcoords='offset points', xytext=(5, (q - py) * 72 / ax.figure.dpi), va='center', fontsize=7.5, color=INK)
J = json.load(open(os.path.join(HERE, 't1238-table.json')))
seeds = ['1020', '7', '42']
ROWS = [('terr', 'NPC 영토(칸 · 합)'), ('pop', '인구(51마을 합)'), ('lj', '나무꾼(합)'), ('stall', '통나무 막힘(넓히려 한 날 중 · 누적 %)')]
fig, axs = plt.subplots(len(ROWS), 3, figsize=(11.5, 10.5), sharex=True)
for j, s in enumerate(seeds):
    for i, (key, lab) in enumerate(ROWS):
        ax = axs[i][j]; style(ax)
        ends = []
        for arm in ['t1207', 'v2']:
            o = J.get(arm, {}).get('seeds', {}).get(s)
            if not o or not o.get('snaps'): continue
            xs = [q['day'] for q in o['snaps'] if q.get(key) is not None]
            ys = [q[key] for q in o['snaps'] if q.get(key) is not None]
            if not xs: continue
            c, ls, nm = STY[arm]
            ax.plot(xs, ys, color=c, linestyle=ls, linewidth=1.8, label=nm)
            ax.scatter([xs[-1]], [ys[-1]], color=c, s=14, zorder=3)
            ends.append((xs[-1], ys[-1], f'{ys[-1]:,.0f}' if key != 'stall' else f'{ys[-1]:.1f}%'))
        if key == 'pop' and J.get('off', {}).get('seeds', {}).get(s):
            v = J['off']['seeds'][s]['pop']
            ax.scatter([400], [v], color=OFFC, marker='D', s=22, zorder=4, label='끔(기준선 끝 날)')
            ends.append((400, v, f'{v:,}'))
        dodge(ax, ends)
        if j == 0: ax.set_ylabel(lab, fontsize=9, color=INK)
        if i == 0: ax.set_title(f'시드 {s}', fontsize=10, color=INK)
        if i == len(ROWS) - 1: ax.set_xlabel('게임 날(1날 = 실제 24분)', fontsize=8.5, color=INK2)
        ax.set_xlim(0, 450)
h, l = axs[1][0].get_legend_handles_labels()
fig.suptitle('T1238 영토 v2 — 400날 3시드(가상 시계) · 처음 땅 1,500칸 · 금고 땅 사기 걷음 · 숲은 숲 그대로', fontsize=11, color=INK, y=0.995)
fig.legend(h, l, loc='upper center', bbox_to_anchor=(0.5, 0.968), ncol=3, frameon=False, fontsize=9)
fig.tight_layout(rect=(0, 0, 1, 0.94))
fig.savefig(os.path.join(OUT, 'T1238_01_게이트400.png'), dpi=150)
print('→', os.path.join(OUT, 'T1238_01_게이트400.png'))
