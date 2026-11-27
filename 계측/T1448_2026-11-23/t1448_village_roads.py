#!/usr/bin/env python3
# T1448 덧붙임 그림 — 마을 영토 위 길 등급(0 · 1 · 2) + 수(영토 칸 · 그 안 길 칸 · 등급 2 칸 · 길 ÷ 영토 %)
#   DB(존 로컬 사본 — 읽기만)의 `roads`(칸 키 · 값 · 마지막 날) · `village_buildings`(type='terr' — 칸마다 한 줄) · `villages`.
#   등급 = 그날(길의 날 = 장부의 가장 늦은 마지막 날) 값 `v × 0.995^(그날 − d)` 로 — 8 · 28 문턱(종전 그대로).
#   쓰는 법: python3 t1448_village_roads.py <db> <out.png> <out.json> [큰 마을 이름] [작은 마을 이름]
import sys, json, sqlite3, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import Patch
from matplotlib.colors import ListedColormap
from matplotlib.ticker import FuncFormatter

DB, OUT, OUTJ = sys.argv[1], sys.argv[2], sys.argv[3]
BIG = sys.argv[4] if len(sys.argv) > 4 else None
SMALL = sys.argv[5] if len(sys.argv) > 5 else None
W = 2188   # 새벌(hanbando) 칸 폭 — server/zone-config.js zoneWidth ÷ 32
T1, T2, DK = 8, 28, 0.995

for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
C_TERR, C_G1, C_G2 = '#e4e9dc', '#ee9a5f', '#9c3d12'   # 영토(길 없음) · 등급 1 · 등급 2(서수 램프 — validate_palette --ordinal 통과)

c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
R = np.array(c.execute('SELECT cell_key, v, d FROM roads').fetchall(), dtype=np.float64)
rk = R[:, 0].astype(np.int64); rv = R[:, 1]; rd = R[:, 2].astype(np.int64)
DAY = int(rd.max())
vn = rv * np.power(DK, (DAY - rd).astype(np.float64))
g = np.where(vn >= T2, 2, np.where(vn >= T1, 1, 0)).astype(np.int8)
gm = dict(zip(rk.tolist(), g.tolist()))
V = {r[0]: {'name': r[1], 'cx': r[2], 'cy': r[3], 'pop': r[4]} for r in c.execute('SELECT id, name, cx, cy, population FROM villages')}
terr = {}
for vid, x, y in c.execute("SELECT village_id, cx, cy FROM village_buildings WHERE type='terr'"):
    terr.setdefault(vid, set()).add(y * W + x)
allT = set().union(*terr.values()) if terr else set()

rows = []
for vid, s in terr.items():
    gi = sum(1 for k in s if gm.get(k, 0) >= 1); g2 = sum(1 for k in s if gm.get(k, 0) == 2); st = sum(1 for k in s if k in gm)
    rows.append({'id': vid, 'name': V[vid]['name'], 'pop': V[vid]['pop'], 'terr': len(s), 'road': gi, 'g2': g2, 'stepped': st, 'pct': round(100 * gi / len(s), 1)})
rows.sort(key=lambda r: -r['terr'])
G = [k for k, x in gm.items() if x >= 1]
tot = {'day': DAY, 'rows': int(len(rk)), 'graded': len(G), 'g1': int((g == 1).sum()), 'g2': int((g == 2).sum()), 'dead': int((vn < 1).sum()),
       'villages': len(rows), 'terr': len(allT), 'gradedInTerr': sum(1 for k in G if k in allT), 'pop': sum(v['pop'] for v in V.values())}
tot['gradedOutTerr'] = tot['graded'] - tot['gradedInTerr']
med = lambda a: sorted(a)[len(a) // 2]
tot['medTerr'] = med([r['terr'] for r in rows]); tot['medRoad'] = med([r['road'] for r in rows]); tot['medPct'] = med([r['pct'] for r in rows])
live = [r for r in rows if r['pop'] > 0]
big = next((r for r in rows if r['name'] == BIG), None) or max(live, key=lambda r: r['pop'])
small = next((r for r in rows if r['name'] == SMALL), None) or min(live, key=lambda r: r['pop'])
json.dump({'tot': tot, 'big': big, 'small': small, 'villages': rows}, open(OUTJ, 'w'), ensure_ascii=False, indent=1)

def panel(ax, r, pad=24):
    s = terr[r['id']]
    xs = [k % W for k in s]; ys = [k // W for k in s]
    x0, x1, y0, y1 = min(xs) - pad, max(xs) + pad, min(ys) - pad, max(ys) + pad
    w, h = x1 - x0 + 1, y1 - y0 + 1
    img = np.zeros((h, w), dtype=np.int8)   # 0 바탕 · 1 영토 · 2 등급 1 · 3 등급 2
    tm = np.zeros((h, w), dtype=np.int8)
    for k in s: img[k // W - y0, k % W - x0] = 1; tm[k // W - y0, k % W - x0] = 1
    for k in G:
        x, y = k % W, k // W
        if x0 <= x <= x1 and y0 <= y <= y1: img[y - y0, x - x0] = 2 if gm[k] == 1 else 3
    ax.imshow(img, cmap=ListedColormap([SURF, C_TERR, C_G1, C_G2]), vmin=0, vmax=3, interpolation='nearest', extent=(x0 - .5, x1 + .5, y1 + .5, y0 - .5))
    ax.contour(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1), tm, levels=[0.5], colors=[INK2], linewidths=0.7)
    v = V[r['id']]
    ax.plot([v['cx']], [v['cy']], marker='o', ms=6, mfc=SURF, mec=INK, mew=1.2, zorder=5)
    ax.set_title(f"{r['name']} — 주민 {r['pop']:,}명", loc='left', fontsize=12.5, color=INK, pad=8)
    ax.text(0.0, -0.06, f"영토 {r['terr']:,}칸 · 그 안 길 {r['road']:,}칸(등급 2 {r['g2']:,}) · 길 ÷ 영토 {r['pct']}%\n밟힌 칸(등급 0 포함) {r['stepped']:,} · 길 칸 ÷ 주민 {r['road'] / max(1, r['pop']):.0f}",
            transform=ax.transAxes, va='top', ha='left', fontsize=10, color=INK2)
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values(): sp.set_color(GRID)
    ax.set_facecolor(SURF)

fig = plt.figure(figsize=(13, 13.2), facecolor=SURF)
gs = fig.add_gridspec(2, 2, height_ratios=[1.25, 1], hspace=0.28, wspace=0.08)
a1 = fig.add_subplot(gs[0, 0]); a2 = fig.add_subplot(gs[0, 1]); a3 = fig.add_subplot(gs[1, :])
panel(a1, big); panel(a2, small)
a1.legend(handles=[Patch(fc=C_TERR, ec=INK2, lw=.5, label='영토(길 없음 · 등급 0)'), Patch(fc=C_G1, label='등급 1 흙길(값 8 ~ 28)'), Patch(fc=C_G2, label='등급 2 다져진 길(값 28 ~)')],
          loc='upper left', bbox_to_anchor=(0, 1.0), frameon=True, facecolor=SURF, edgecolor=GRID, fontsize=9.2)
# 마을 51 — 영토 칸 ↔ 그 안 길 칸(점 하나 = 마을 하나)
ax = a3; ax.set_facecolor(SURF)
xs = [r['terr'] for r in rows]; ys = [r['road'] for r in rows]
ax.scatter(xs, ys, s=[18 + 0.25 * r['pop'] for r in rows], c=[C_G1 if r['pop'] > 0 else '#c9c8c2' for r in rows], edgecolors=SURF, linewidths=1.0, zorder=3)
mx = max(xs) * 1.05; ytop = max(max(ys) * 1.15, 10000)
for f, lab in ((1.0, '길 = 영토'), (0.5, '길 = 영토의 ½'), (0.25, '길 = 영토의 ¼')):
    ax.plot([0, mx], [0, mx * f], color=INK2, lw=0.8, ls=(0, (4, 3)), zorder=1)
    lx, ly = (mx, mx * f) if mx * f <= ytop else (ytop / f, ytop)   # 선이 판 가장자리에 닿는 자리
    top = ly >= ytop * 0.99   # 위 가장자리에 닿으면 선 오른쪽에 · 오른 가장자리면 선 위 왼쪽에(글자가 선을 안 덮게)
    ax.annotate(lab, (lx, ly), xytext=(6, -13) if top else (-4, 4), textcoords='offset points', ha='left' if top else 'right', va='bottom', fontsize=8.8, color=INK2)
ax.axhline(9000, color=C_G2, lw=0.9, ls=':', zorder=1); ax.annotate('PM 어림 9천 칸', (mx * 0.01, 9000), xytext=(0, 4), textcoords='offset points', fontsize=8.8, color=C_G2)
for r in (big, small):
    ax.annotate(r['name'], (r['terr'], r['road']), xytext=(6, 6), textcoords='offset points', fontsize=9.5, color=INK)
ax.set_xlim(0, mx); ax.set_ylim(0, ytop)
ax.grid(color=GRID, lw=0.8); ax.set_axisbelow(True)
for s_ in ('top', 'right'): ax.spines[s_].set_visible(False)
for s_ in ('left', 'bottom'): ax.spines[s_].set_color(INK2)
fmt = FuncFormatter(lambda v, _: f'{int(v):,}')
ax.xaxis.set_major_formatter(fmt); ax.yaxis.set_major_formatter(fmt)
ax.tick_params(colors=INK2, labelsize=9)
ax.set_xlabel('영토 칸', color=INK2, fontsize=10); ax.set_ylabel('그 안 길 칸(등급 1 + 2)', color=INK2, fontsize=10)
ax.set_title(f"마을 {tot['villages']}곳 — 영토 가운데 {tot['medTerr']:,}칸 · 그 안 길 가운데 {tot['medRoad']:,}칸({tot['medPct']}%) · 점 크기 = 주민(회색 = 빈 마을)", loc='left', fontsize=12, color=INK, pad=8)
fig.suptitle(f"T1448 — 마을 안이 다 길인가: 라이브 11-09 사본(길의 날 {DAY:,}) · 길 칸 {tot['graded']:,}(등급 2 {tot['g2']:,}) 가운데 영토 안 {tot['gradedInTerr']:,}({100 * tot['gradedInTerr'] / tot['graded']:.0f}%) · 영토 밖 {tot['gradedOutTerr']:,}",
             x=0.02, ha='left', fontsize=13.2, color=INK)
fig.savefig(OUT, dpi=170, facecolor=SURF, bbox_inches='tight')
print(OUT, json.dumps(tot, ensure_ascii=False), big['name'], small['name'])
