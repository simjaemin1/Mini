#!/usr/bin/env python3
# (러너 밖 · T574 추신4 그림 — 관측 전용)
# =============================================================================
# 산그림/T574_L500.png — L 500 으로 구운 두 존 정본 광맥(품목별 색) + 동끝↔서끝 띠
#   ⓐ 두 존 광종 지도 — 주요 = 원판(반경 그대로) · 자잘 = 점 · 검은 테 = 이번 굽기로 바뀐 광맥(옛 기록 `region-bake-off.json`)
#   ⓑ 동끝↔서끝 띠 — 경계 ±1,500셀 확대(같은 그림 · 점선 = L · 2L)
#   ⓒ 경계에서의 이웃 고유 품목 몫 — s₀ · (그 존 고유 품목 비중 합) · e^(−d/L) 두 줄 + 실제로 꼬리로 든 광맥(눈금)
# 색 = dataviz 기준 팔레트 여덟(고정 차례 · 검증기 adjacent 통과) — 품목 이름은 범례·직접 표지로 같이 단다(색만으로 안 가린다)
# 입력: --grid <dir>(t574-band-table --grid) · --canon <정본 json> · --off <region-bake-off.json> · --L 500 · --s0 0.5 · --uhb · --unp · --out
# =============================================================================
import json, math, argparse
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from matplotlib import font_manager as fm
from matplotlib.gridspec import GridSpec

ap = argparse.ArgumentParser()
ap.add_argument('--grid', required=True); ap.add_argument('--canon', required=True); ap.add_argument('--off', required=True)
ap.add_argument('--L', type=float, default=500); ap.add_argument('--s0', type=float, default=0.5)
ap.add_argument('--uhb', type=float, required=True, help='한반도 고유 품목 비중 합(닛폰 안으로 드는 꼬리)')
ap.add_argument('--unp', type=float, required=True, help='닛폰 고유 품목 비중 합(한반도 안으로 드는 꼬리)')
ap.add_argument('--out', required=True)
a = ap.parse_args()

for f in fm.findSystemFonts():
    if 'NotoSansCJK-Regular' in f or 'NotoSansCJK-Medium' in f:
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
INK, INK2, MUTED, SURF = '#0b0b0b', '#52514e', '#8a8984', '#fcfcfb'

Z = ['hanbando', 'nippon']
KOZ = {'hanbando': '한반도', 'nippon': '닛폰'}
G = {z: json.load(open(f'{a.grid}/{z}.grid.json')) for z in Z}
canon = json.load(open(a.canon)); off = json.load(open(a.off))
# 품목 → 색(기준 팔레트 여덟 · 고정 차례)
ORDER = ['lead', 'copper', 'tin', 'gold', 'sulfur', 'jade_raw', 'obsidian', 'iron']
PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
COL = dict(zip(ORDER, PAL))
KON = {'iron': '철', 'copper': '구리', 'gold': '금', 'lead': '납(연은 포함)', 'tin': '주석', 'jade_raw': '옥(비취)', 'obsidian': '흑요석', 'sulfur': '유황'}
OX = {'hanbando': 0, 'nippon': G['hanbando']['NX']}
BX = G['hanbando']['NX']                      # 경계(셀)
W = G['hanbando']['NX'] + G['nippon']['NX']; H = max(G[z]['NY'] for z in Z)
changed = {z: {f"{e['c'][0]},{e['c'][1]}": e['was']['mineral'] for e in off['zones'].get(z, [])} for z in Z}

def base(ax):
    for z in Z:
        g = G[z]; img = np.array(g['land'], dtype=float).reshape(g['GY'], g['GX']) / (g['G'] * g['G'])
        ax.imshow(np.where(img > 0.05, 0.90 - 0.18 * img, 1.0), cmap='gray', vmin=0, vmax=1, origin='upper',
                  extent=[OX[z], OX[z] + g['GX'] * g['G'], g['GY'] * g['G'], 0], interpolation='nearest')
    ax.axvline(BX, color=INK2, lw=0.8, ls='--')
    ax.set_xticks([]); ax.set_yticks([]); ax.set_aspect('equal')
    for s in ax.spines.values(): s.set_color('#d6d5d0')

def veins(ax, lw_ring=0.9):
    for z in Z:
        for o in canon[z]['ores']:
            cx = o['center'][0] / 32 + OX[z]; cy = o['center'][1] / 32; r = o['radius'] / 32
            c = COL.get(o['mineral'], MUTED); ch = f"{o['center'][0]},{o['center'][1]}" in changed[z]
            if o.get('minor'):
                ax.plot(cx, cy, 'o', ms=2.6 if ch else 1.6, color=c, mec=INK if ch else 'none', mew=0.5 if ch else 0, alpha=0.95)
            else:
                ax.add_patch(Circle((cx, cy), max(r, 9), facecolor=c, edgecolor=INK if ch else SURF, lw=lw_ring if ch else 0.4, alpha=0.92))

def area_share(z):
    t = {}; s = 0
    for o in canon[z]['ores']:
        ar = (o['radius'] / 32) ** 2; t[o['mineral']] = t.get(o['mineral'], 0) + ar; s += ar
    return sorted(((k, v / s) for k, v in t.items()), key=lambda kv: -kv[1])

fig = plt.figure(figsize=(14.5, 9.6), dpi=130, facecolor=SURF)
gs = GridSpec(2, 2, figure=fig, width_ratios=[1.0, 0.78], height_ratios=[1.3, 1.0], wspace=0.08, hspace=0.2)
# ⓐ 지도
ax = fig.add_subplot(gs[:, 0]); base(ax); veins(ax)
ax.set_xlim(0, W); ax.set_ylim(H, 0)
nH, nN = len(changed['hanbando']), len(changed['nippon'])
ax.set_title(f"ⓐ L {int(a.L)}셀로 구운 두 존 정본 광맥\n검은 테 = 이번에 바뀐 광맥(한반도 {nH}/{len(canon['hanbando']['ores'])} · 닛폰 {nN}/{len(canon['nippon']['ores'])})",
             fontsize=10.5, color=INK, loc='left')
for z, xx, yy in (('hanbando', 0.01, 0.040), ('nippon', 0.01, 0.008)):
    txt = f"{KOZ[z]} 면적 %: " + ' · '.join(f"{KON.get(k, k).split('(')[0]} {v * 100:.0f}" for k, v in area_share(z)[:6])
    ax.text(xx, yy, txt, transform=ax.transAxes, fontsize=7.5, color=INK2, va='bottom', ha='left',
            bbox=dict(boxstyle='round', fc=SURF, ec='#d6d5d0', lw=0.4, alpha=0.92))
ax.text(BX - 30, 90, '← 한반도', ha='right', va='top', fontsize=8.5, color=INK2); ax.text(BX + 30, 90, '닛폰 →', ha='left', va='top', fontsize=8.5, color=INK2)
# ⓑ 띠(경계 ±1,500셀)
axb = fig.add_subplot(gs[0, 1]); base(axb); veins(axb, lw_ring=1.1)
SPAN = 1500
axb.set_xlim(BX - SPAN, BX + SPAN); axb.set_ylim(H, 0); axb.set_aspect('auto')
for k, ls in ((1, ':'), (2, '-.')):
    for sgn in (-1, 1): axb.axvline(BX + sgn * k * a.L, color=MUTED, lw=0.7, ls=ls)
axb.text(BX - a.L, H * 0.985, 'L', ha='center', va='bottom', fontsize=8, color=INK2); axb.text(BX - 2 * a.L, H * 0.985, '2L', ha='center', va='bottom', fontsize=8, color=INK2)
axb.text(BX + a.L, H * 0.985, 'L', ha='center', va='bottom', fontsize=8, color=INK2); axb.text(BX + 2 * a.L, H * 0.985, '2L', ha='center', va='bottom', fontsize=8, color=INK2)
axb.set_title('ⓑ 동끝 ↔ 서끝 띠 — 경계 ±1,500셀(한반도 동쪽 · 닛폰 서쪽)', fontsize=10, color=INK, loc='left')
# ⓒ 꼬리 몫 — 경계로부터의 거리
axc = fig.add_subplot(gs[1, 1])
d = np.linspace(0, SPAN, 400)
hb = 100 * a.s0 * a.unp * np.exp(-d / a.L); np_ = 100 * a.s0 * a.uhb * np.exp(-d / a.L)
axc.plot(-d, hb, color='#2a78d6', lw=2); axc.plot(d, np_, color='#eb6834', lw=2)
axc.axvline(0, color=INK2, lw=0.8, ls='--')
axc.text(-60, hb[0] - 0.3, '한반도 안 —\n닛폰 고유(옥·유황) 몫', color=INK, fontsize=8, ha='right', va='top')
axc.text(60, np_[0] - 0.3, '닛폰 안 —\n한반도 고유(철) 몫', color=INK, fontsize=8, ha='left', va='top')
# 실제로 꼬리로 든 광맥(한반도의 옥·유황) — 거리 눈금
tails = [o for o in canon['hanbando']['ores'] if o['mineral'] in ('jade_raw', 'sulfur')]
for o in tails:
    dd = (70016 - o['center'][0]) / 32
    if dd <= SPAN: axc.plot([-dd, -dd], [0, 1.6], color=COL[o['mineral']], lw=1.4)
far = sum(1 for o in tails if (70016 - o['center'][0]) / 32 > SPAN)
axc.text(-SPAN * 0.97, 16.4, f"눈금 = 꼬리로 든\n한반도 옥·유황 {len(tails)}개" + (f"(1,500셀 밖 {far})" if far else ''), fontsize=7.2, color=INK2, va='top')
axc.text(SPAN * 0.97, 16.4, '닛폰 55는 전부 주요 —\n철은 주요에 못 든다(재민 08-01 ①) → 0개', fontsize=7.2, color=INK2, ha='right', va='top')
axc.set_xlim(-SPAN, SPAN); axc.set_ylim(0, 17)
axc.set_xlabel('경계로부터 거리(셀) — 왼쪽 한반도 · 오른쪽 닛폰', fontsize=8.5, color=INK2)
axc.set_ylabel('이웃 고유 품목 몫 %', fontsize=8.5, color=INK2)
axc.grid(axis='y', color='#ecebe6', lw=0.6); axc.set_axisbelow(True)
for s in ('top', 'right'): axc.spines[s].set_visible(False)
for s in ('left', 'bottom'): axc.spines[s].set_color('#d6d5d0')
axc.tick_params(colors=INK2, labelsize=8)
axc.set_title(f'ⓒ 경계 넘는 꼬리 — s0 {a.s0} × 그 존 고유 비중 × e^(−d/{int(a.L)})', fontsize=10, color=INK, loc='left')
# 범례
hs = [plt.Line2D([0], [0], marker='o', color='w', markerfacecolor=COL[k], markersize=8, label=KON[k]) for k in ORDER]
hs.append(plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#e8e7e2', markeredgecolor=INK, markeredgewidth=1.2, markersize=8, label='검은 테 = 이번에 바뀐 광맥'))
fig.legend(handles=hs, loc='lower center', ncol=5, fontsize=8.5, frameon=False, labelcolor=INK, bbox_to_anchor=(0.5, -0.04))
fig.suptitle(f'T574 추신4 — 꼬리 L {int(a.L)}셀(재민 10-03)로 다시 구운 두 존 광종 · 점선 = 존 경계', fontsize=12.5, color=INK, x=0.01, ha='left')
fig.savefig(a.out, facecolor=SURF, bbox_inches='tight'); print('→', a.out)
