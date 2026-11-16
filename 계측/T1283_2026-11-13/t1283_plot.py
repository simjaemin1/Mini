#!/usr/bin/env python3
# T1283 그림 — 계측 훅 두 벌(`sbc-<시드>.json.t1275.json` 날 줄 · `sbc-<시드>.json.t1283.json` 마을-날 줄)만 읽는다 · 세계 0
#   시드마다(열) 인구 · 나무꾼 · 땔감 충당(마을 평균) — 끔 · v2 만 · v2 만 + T1283 · 묶음 · 묶음 + T1283 · 묶음 + 걸음(나) (· 실험 판 둘 — 묶음 + T1283 + 출생 곳간 문 · + K 곳간)
# 실행: python3 계측/T1283_2026-11-13/t1283_plot.py <판 지도 JSON> <출력 폴더>
#   판 지도 JSON = { "off": {"1020": "<판 폴더>", …}, "v2": {…}, "v2T": {…}, "bundle": {…}, "bundleT": {…}, "bundleH": {…}[, "bundleTW": {…}, "bundleTK": {…}] }
import json, sys, os, collections
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
# Okabe–Ito(색약 안전 · 고정 차례) + 선 꼴(색만으로 안 가른다 — T1283 켬은 같은 색의 굵은 실선)
STY = {'off': ('#0072B2', '-', 1.8, '끔'), 'v2': ('#D55E00', ':', 1.6, 'v2 만'), 'v2T': ('#D55E00', '-', 2.2, 'v2 만 + T1283'), 'bundleTW': ('#56B4E9', '-.', 1.8, '묶음 + T1283 + 출생 곳간 문(실험)'), 'bundleTK': ('#E69F00', '-.', 1.8, '묶음 + T1283 + K 곳간(실험)'),
       'bundle': ('#009E73', ':', 1.6, '묶음(나무꾼 몸 + v2)'), 'bundleT': ('#009E73', '-', 2.2, '묶음 + T1283'), 'bundleH': ('#CC79A7', '--', 2.0, '묶음 + 걸음(나)')}
ORDER = [a for a in ['off', 'v2', 'v2T', 'bundle', 'bundleT', 'bundleH', 'bundleTW', 'bundleTK'] if a in MAP]
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
SEEDS = ['1020', '7', '42']
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
def series(d, s):
    out = {}
    try:
        h5 = json.load(open(os.path.join(d, f'sbc-{s}.json.t1275.json')))['days']
        out['pop'] = ([q[0] for q in h5], [q[1] for q in h5]); out['lj'] = ([q[0] for q in h5], [q[14] for q in h5])
    except Exception: pass
    try:
        h3 = json.load(open(os.path.join(d, f'sbc-{s}.json.t1283.json'))); c = {k: i for i, k in enumerate(h3['cols'])}
        acc = collections.defaultdict(lambda: [0.0, 0])
        for q in h3['rows']:
            if q[c['N']] > 0 and q[c['fuelCov']] is not None: a = acc[q[c['day']]]; a[0] += q[c['fuelCov']]; a[1] += 1
        days = sorted(acc); raw = [acc[x][0] / acc[x][1] for x in days]
        sm = [sum(raw[max(0, i - 9):i + 1]) / len(raw[max(0, i - 9):i + 1]) for i in range(len(raw))]   # 10날 이동 평균(계절 톱니를 고르게 — 표의 끝 50날 평균과 별개)
        out['fuel'] = (days, sm)
    except Exception: pass
    return out
data = {(a, s): series(MAP[a][s], s) for a in ORDER for s in SEEDS if s in MAP[a]}
ROWS = [('pop', '인구(51마을 합 · 명)'), ('lj', '나무꾼(51마을 합 · 명)'), ('fuel', '땔감 충당(마을 평균 · 10날 이동)')]
fig, axes = plt.subplots(len(ROWS), len(SEEDS), figsize=(15.5, 11.5), sharex=True)
for ci, s in enumerate(SEEDS):
    for ri, (key, lab) in enumerate(ROWS):
        ax = axes[ri][ci]; style(ax); ends = []
        for a in ORDER:
            d = data.get((a, s), {}).get(key)
            if not d or not d[0]: continue
            c, ls, lw, _ = STY[a]
            ax.plot(d[0], d[1], color=c, linestyle=ls, linewidth=lw)
            if key != 'fuel':
                ax.plot([d[0][-1]], [d[1][-1]], 'o', color=c, markersize=4.5)
                ends.append([d[1][-1], d[0][-1], d[1][-1]])
        if ends:
            lo, hi = ax.get_ylim(); gap = 0.05 * (hi - lo); ends.sort()
            for i in range(1, len(ends)):
                if ends[i][0] - ends[i - 1][0] < gap: ends[i][0] = ends[i - 1][0] + gap
            tr = offset_copy(ax.transData, fig=fig, x=5, y=0, units='points')
            for yl, xe, ye in ends: ax.text(xe, yl, f'{ye:,.0f}', transform=tr, fontsize=7.5, color=INK2, va='center')
        if key == 'fuel': ax.set_ylim(0, 1.05)
        if ri == 0: ax.set_title(f'시드 {s}', fontsize=12, color=INK)
        if ci == 0: ax.set_ylabel(lab, fontsize=10, color=INK2)
        if ri == len(ROWS) - 1: ax.set_xlabel('게임 날(판은 빠른 시계 · 가상 시계)', fontsize=9, color=INK2)
handles = [plt.Line2D([0], [0], color=STY[a][0], linestyle=STY[a][1], linewidth=STY[a][2]) for a in ORDER]
fig.legend(handles, [STY[a][3] for a in ORDER], loc='upper center', ncol=min(4, len(ORDER)), frameon=False, fontsize=10, bbox_to_anchor=(0.5, 0.965))
fig.suptitle('T1283 나무 모자람 → 직업 고르기 · 400날 3시드', fontsize=13, color=INK, y=0.995)
fig.tight_layout(rect=[0, 0, 1, 0.93])
fn = os.path.join(OUT, 'T1283_01_판400.png'); fig.savefig(fn, dpi=150); print('→', fn)
