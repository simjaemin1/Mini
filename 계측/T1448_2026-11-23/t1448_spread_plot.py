#!/usr/bin/env python3
# T1448 진단 그림 — 밟힌 칸이 어떻게 퍼져 있나(구역마다 몇 칸) + 구역 크기마다 배열 총량 ↔ 지금 장부(잰 MB)
#   ① 지도: 32칸 구역마다 밟힌 칸 수(DB `roads` 한 줄 = 한 칸 · 다 닳은 칸 포함 — 배열이 쥐어야 할 칸) — 로그 색
#   ② 히스토그램: 밟힌 구역의 채움(구역 하나 1,024칸 가운데 몇 칸)
#   ③ 막대: 지금 장부(진단 탐침 diag-*.json — 힙 차) ↔ 구역 크기 16 · 32 · 64 · 128 의 배열(값 Float64 + 날 Int32 = 칸당 12 B · 밟힌 구역만)
#   쓰는 법: python3 t1448_spread_plot.py <db> <diag.json> <out.png>
import sys, json, sqlite3, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.colors import LogNorm, ListedColormap
from matplotlib.ticker import FuncFormatter

DB, DIAG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 2188, 4063
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']   # 순차(파랑 한 빛 · 밝음 → 어두움)

c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
k = np.array([r[0] for r in c.execute('SELECT cell_key FROM roads')], dtype=np.int64)
x, y = k % W, k // W
D = json.load(open(DIAG))
P = D['probes']; sp = D['spread']
gw, gh = math.ceil(W / 32), math.ceil(H / 32)
cnt = np.zeros((gh, gw), dtype=np.int64)
np.add.at(cnt, (y // 32, x // 32), 1)
touched = cnt[cnt > 0]

fig = plt.figure(figsize=(13, 10.6), facecolor=SURF)
gs = fig.add_gridspec(2, 2, width_ratios=[0.9, 1.25], height_ratios=[1, 1], hspace=0.42, wspace=0.18)
am = fig.add_subplot(gs[:, 0]); ah = fig.add_subplot(gs[0, 1]); ab = fig.add_subplot(gs[1, 1])

# ① 지도
m = np.ma.masked_where(cnt == 0, cnt)
im = am.imshow(m, cmap=ListedColormap(SEQ), norm=LogNorm(vmin=1, vmax=1024), interpolation='nearest', extent=(0, gw * 32, gh * 32, 0))
am.set_facecolor('#f0efec'); am.set_xlim(0, W); am.set_ylim(H, 0)
am.set_xticks([]); am.set_yticks([])
for s_ in am.spines.values(): s_.set_color(GRID)
cb = fig.colorbar(im, ax=am, orientation='horizontal', fraction=0.035, pad=0.02, aspect=30); cb.set_label('32칸 구역 하나의 밟힌 칸(로그 · 1 ~ 1,024)', color=INK2, fontsize=9.5)
cb.ax.tick_params(colors=INK2, labelsize=8.5); cb.outline.set_edgecolor(GRID)
am.set_title(f"① 새벌 {W:,} × {H:,}칸 — 32칸 구역 {gw * gh:,}개 중\n밟힌 구역 {int((cnt > 0).sum()):,}({100 * (cnt > 0).sum() / (gw * gh):.0f}%) · 회색 = 밟힌 적 없음", loc='left', fontsize=11.5, color=INK, pad=8)

# ② 히스토그램(밟힌 구역의 채움 · 로그 칸)
bins = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1025]
h, _ = np.histogram(touched, bins=bins)
lab = ['1', '2–3', '4–7', '8–15', '16–31', '32–63', '64–127', '128–255', '256–511', '512–1,024']
ah.bar(range(len(h)), h, color=SEQ[4], width=0.82, zorder=3)
for i, v in enumerate(h): ah.annotate(f'{v:,}', (i, v), xytext=(0, 3), textcoords='offset points', ha='center', fontsize=8.6, color=INK2)
ah.set_xticks(range(len(h))); ah.set_xticklabels(lab, fontsize=8.6, color=INK2, rotation=30, ha='right', rotation_mode='anchor')
ah.set_facecolor(SURF); ah.grid(axis='y', color=GRID, lw=0.8); ah.set_axisbelow(True)
for s_ in ('top', 'right'): ah.spines[s_].set_visible(False)
for s_ in ('left', 'bottom'): ah.spines[s_].set_color(INK2)
ah.tick_params(colors=INK2, labelsize=8.6); ah.set_ylabel('구역 수', color=INK2, fontsize=9.5); ah.set_xlabel('구역 하나(1,024칸)의 밟힌 칸', color=INK2, fontsize=9.5)
f32 = sp['32']['fill']
ah.set_title(f"② 밟힌 32칸 구역 {len(touched):,}개의 채움 — 가운데 {f32['p50']}칸({100 * f32['p50'] / 1024:.0f}%) · 열에 아홉은 {f32['p90']}칸 밑", loc='left', fontsize=11.5, color=INK, pad=8)

# ③ 막대 — 지금 장부(잰 힙 차) ↔ 배열
full = P['full']; noi = P.get('noi') or {}; cel = P.get('cells') or {}
parts = dict(full.get('parts') or [])
t688 = round(full['initMB'] - noi.get('initMB', full['initMB']), 1)
cellsMB = cel.get('cellsMB') or cel.get('initMB') or parts.get('cells')
now = [('칸 객체 Map', cellsMB, SEQ[5]), ('T688 표', t688, SEQ[4]), ('방송 등급 sent', parts.get('sent', 0), SEQ[3]), ('다져진 길 · 코스', round(parts.get('paved', 0) + parts.get('coarse', 0), 1), SEQ[2])]
arr = [(s, sp[s]['arrayMB'], sp[s]['chunks']) for s in ('16', '32', '64', '128')]
ab.set_facecolor(SURF)
left = 0
for nm, v, col in now:
    ab.barh(0, v, left=left, color=col, height=0.55, edgecolor=SURF, linewidth=2, zorder=3)
    if v >= 20: ab.annotate(f'{nm}\n{v:g}', (left + v / 2, 0), ha='center', va='center', fontsize=8.4, color='#fcfcfb')
    left += v
small_ = ' · '.join(f'{nm} {v:g}' for nm, v, _ in now if v < 20)
ab.annotate(small_, (left, 0.44), ha='right', va='center', fontsize=8.4, color=INK2)   # 작은 두 몫은 막대 밑에 글로
ab.annotate(f'{left:.0f} MB', (left, 0), xytext=(5, 0), textcoords='offset points', va='center', fontsize=9.5, color=INK)
for i, (s, v, n) in enumerate(arr, 1):
    ab.barh(i, v, color=SEQ[3] if s != '32' else SEQ[5], height=0.55, zorder=3)
    ab.annotate(f'{v:g} MB · 구역 {n:,}', (v, i), xytext=(5, 0), textcoords='offset points', va='center', fontsize=9.2, color=INK)
ab.set_yticks(range(len(arr) + 1)); ab.set_yticklabels(['지금 장부'] + [f'{s}칸 구역 배열' for s, _, _ in arr], fontsize=9.2, color=INK2)
ab.invert_yaxis(); ab.grid(axis='x', color=GRID, lw=0.8); ab.set_axisbelow(True)
for s_ in ('top', 'right'): ab.spines[s_].set_visible(False)
for s_ in ('left', 'bottom'): ab.spines[s_].set_color(INK2)
ab.tick_params(colors=INK2, labelsize=8.8); ab.set_xlabel('MB(힙 — 지금 장부는 잰 차 · 배열은 칸당 12 B: 값 Float64 + 날 Int32)', color=INK2, fontsize=9.2)
ab.set_xlim(0, left * 1.22)
ab.set_title('③ 같은 칸을 쥐는 데 드는 메모리 — 지금 장부 ↔ 구역 배열(밟힌 구역만)', loc='left', fontsize=11.5, color=INK, pad=8)
fig.suptitle(f"T1448 — 길 장부를 칸 배열로: 라이브 11-09 사본 {len(k):,}칸(다 닳은 칸 포함)이 어디에 · 얼마나 · 구역 크기마다 배열 총량", x=0.02, ha='left', fontsize=13.2, color=INK)
fig.savefig(OUT, dpi=170, facecolor=SURF, bbox_inches='tight')
print(OUT, 'touched32', len(touched), 'now', now, 'arr', arr)
