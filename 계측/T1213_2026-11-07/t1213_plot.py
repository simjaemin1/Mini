#!/usr/bin/env python3
# T1213 그림 — 판 JSON(scripts/t1213-sbc-table.js 가 쓴 t1213-sbc400.json)만 읽는다 · 세계 0
#   시드마다(열) 영토 · 인구 · 나무꾼 · 재료 막힘(누적 %) — 끔 ↔ 켬(T1207+T1213) ↔ 켬 · T1213 끔(시드 1020)
# 실행: python3 계측/T1213_2026-11-07/t1213_plot.py <출력 폴더>
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
# Okabe–Ito(색약 안전 · 고정 차례): 끔 = 파랑 · 켬 = 주황 · 켬(T1213 끔) = 회색 점선
STY = {'off': ('#0072B2', '-', '끔(지금)'), 'on': ('#D55E00', '-', '켬(T1207 + T1213)'), 'on0': ('#6B7280', '--', '켬 · T1213 끔(T1207 만)')}
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)

J = json.load(open(os.path.join(HERE, 't1213-sbc400.json')))
seeds = ['1020', '7', '42']
ROWS = [('terr', '영토(셀 · 51마을 합)'), ('pop', '인구(51마을 합)'), ('lj', '나무꾼(51마을 합)'), ('stall', '재료 막힘(넓히려 한 날 중 · 누적 %)')]
fig, axs = plt.subplots(len(ROWS), 3, figsize=(11.5, 10.5), sharex=True)
for j, s in enumerate(seeds):
    for i, (key, lab) in enumerate(ROWS):
        ax = axs[i][j]; style(ax)
        for arm in ['off', 'on0', 'on']:
            r = J['seeds'][s].get(arm)
            if not r: continue
            if key == 'stall' and arm == 'off': continue
            col, ls, name = STY[arm]
            xs = [q['day'] for q in r['snaps']]
            if key == 'stall':
                ys = [(100.0 * q['t']['stallWood'] / q['t']['days']) if (q.get('t') and q['t'].get('days')) else None for q in r['snaps']]
                pts = [(x, y) for x, y in zip(xs, ys) if y is not None]
                if not pts: continue
                xs, ys = [a for a, _ in pts], [b for _, b in pts]
            else:
                ys = [q[key] for q in r['snaps']]
            ax.plot(xs, ys, color=col, linestyle=ls, linewidth=2, marker='o', markersize=3.5, label=name)
            ax.annotate(f"{ys[-1]:,.0f}" if key != 'stall' else f"{ys[-1]:.1f}%", (xs[-1], ys[-1]), textcoords='offset points', xytext=(4, 0), va='center', fontsize=7.5, color=INK)
        if i == 0: ax.set_title(f'시드 {s}', fontsize=11, color=INK)
        if j == 0: ax.set_ylabel(lab, fontsize=8.5, color=INK2)
        if i == len(ROWS) - 1: ax.set_xlabel('날', fontsize=9, color=INK2)
        if key == 'stall': ax.set_ylim(0, 100)
        ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f'{int(v):,}'))
axs[0][0].legend(frameon=False, fontsize=8.5, loc='best')
S = J['sum']
fig.suptitle(f"T1213 — main 기준선 판 자(가상 시계 · 400날) · 끝 날 인구 {S['off']['pop']:,} → {S['on']['pop']:,}(비 {S['popRatio']}) · 빈 마을 {S['off']['empty']} → {S['on']['empty']} · 재료 막힘 {S['on']['stallPct']}%",
             fontsize=11, color=INK, x=0.01, ha='left')
fig.text(0.01, 0.005, '50날마다 계측 훅(읽기만) · 켬 · T1213 끔 판은 시드 1020 하나 · 끔 판 = main 기준선 11-07 견주기', fontsize=8, color=INK2)
fig.tight_layout(rect=(0, 0.015, 1, 0.965))
fig.savefig(os.path.join(OUT, 'T1213_01_게이트400.png'), dpi=150); plt.close(fig)
print('ok', OUT)
