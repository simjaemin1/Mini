#!/usr/bin/env python3
# T1275 그림 — 계측 훅 날 줄(`sbc-<시드>.json.t1275.json` · 칸 읽기만)만 읽는다 · 세계 0
#   시드마다(열) 인구 · 나무꾼 · econ 땅(51마을 합) — 끔 · v2 만(고치기 전 · 1020 만) · v2 만(고친 뒤) · 묶음(나무꾼 몸 + v2)
# 실행: python3 계측/T1275_2026-11-12/t1275_plot.py <판 지도 JSON> <출력 폴더>
#   판 지도 JSON = { "off": {"1020": "<훅 파일>", …}, "pre": {…}, "v2": {…}, "bundle": {…} }
import json, sys, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.transforms import offset_copy
MAP = json.load(open(sys.argv[1]))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
p = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if os.path.exists(p): fm.fontManager.addfont(p)
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
# Okabe–Ito(색약 안전 · 고정 차례) + 선 꼴(색만으로 안 가른다)
STY = {'off': ('#0072B2', '-', '끔'), 'pre': ('#6B7280', ':', 'v2 만 · 고치기 전'), 'v2': ('#D55E00', '-', 'v2 만 · 고친 뒤(개간 통나무 입구)'), 'bundle': ('#009E73', '--', '묶음(나무꾼 몸 + v2)')}
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
SEEDS = ['1020', '7', '42']
ROWS = [(1, '인구(51마을 합)'), (14, '나무꾼(51마을 합)'), (19, 'econ 땅(51마을 합)')]
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
data = {}
for arm, by in MAP.items():
    for s, f in by.items():
        try: data[(arm, s)] = json.load(open(f))['days']
        except Exception: pass
fig, axes = plt.subplots(len(ROWS), len(SEEDS), figsize=(15, 11), sharex=True)
for ci, s in enumerate(SEEDS):
    for ri, (col, lab) in enumerate(ROWS):
        ax = axes[ri][ci]; style(ax); ends = []
        for arm in ['off', 'pre', 'v2', 'bundle']:
            d = data.get((arm, s))
            if not d: continue
            c, ls, _ = STY[arm]
            xs = [r[0] for r in d]; ys = [r[col] for r in d]
            ax.plot(xs, ys, color=c, linestyle=ls, linewidth=2)
            ax.plot([xs[-1]], [ys[-1]], 'o', color=c, markersize=5)
            ends.append([ys[-1], xs[-1], ys[-1]])
        # 끝 값 글자 — 가까운 둘이 겹치지 않게 위로 민다(축 높이의 4.5% 사이)
        lo, hi = ax.get_ylim(); gap = 0.045 * (hi - lo); ends.sort()
        for i in range(1, len(ends)):
            if ends[i][0] - ends[i - 1][0] < gap: ends[i][0] = ends[i - 1][0] + gap
        tr = offset_copy(ax.transData, fig=fig, x=5, y=0, units='points')
        for yl, xe, ye in ends: ax.text(xe, yl, f'{ye:,.0f}', transform=tr, fontsize=8, color=INK2, va='center')
        if ri == 0: ax.set_title(f'시드 {s}', fontsize=12, color=INK)
        if ci == 0: ax.set_ylabel(lab, fontsize=10, color=INK2)
        if ri == len(ROWS) - 1: ax.set_xlabel('게임 날(1날 = 실제 24분 · 판은 빠른 시계)', fontsize=9, color=INK2)
handles = [plt.Line2D([0], [0], color=STY[a][0], linestyle=STY[a][1], linewidth=2) for a in ['off', 'pre', 'v2', 'bundle']]
fig.legend(handles, [STY[a][2] for a in ['off', 'pre', 'v2', 'bundle']], loc='upper center', ncol=4, frameon=False, fontsize=10, bbox_to_anchor=(0.5, 0.955))
fig.suptitle('T1275 영토 v2 단독 — 개간 통나무 입구를 고친 뒤 · 400날 3시드(빠른 시계 · 가상 시계)', fontsize=13, color=INK, y=0.995)
fig.tight_layout(rect=[0, 0, 1, 0.93])
fig.savefig(os.path.join(OUT, 'T1275_01_판400.png'), dpi=150)
print('→', os.path.join(OUT, 'T1275_01_판400.png'))
