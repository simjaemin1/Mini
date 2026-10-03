#!/usr/bin/env python3
# (러너 밖 · T574 그림 — 관측 전용)
# =============================================================================
# 산그림/T574_특산.png — 두 존 광종 지도(혼용 전 = 정본 / 후 = 미리보기 json) + 경계 넘는 꼬리(추신2)
#   ⓐ 정본 광맥(지배 광종 색 · 주요 = 원판 · 자잘 = 점) ⓑ 미리보기(닛폰 다 굽기 + 한반도 덜 흔드는 굽기 · L) ⓒ 꼬리 몫 —
#   이웃 고유 품목(광종)의 몫 = s₀ · (그 존 고유 품목 비중 합) · e^(−d/L) — 색은 L 하나, 등고선은 L 셋의 1% 선
#   (+ 접근성 빨간 줄이 있으면 ⓓ 그 품목이 닿는 마을/못 닿는 마을)
# 입력: --grid <dir>(t574-band-table --grid) · --canon <json> · --prev <json> · --L 500 · --band <band-L.json> · --access <access.json> · --out <png>
# =============================================================================
import json, sys, math, argparse
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from matplotlib import font_manager as fm

ap = argparse.ArgumentParser()
ap.add_argument('--grid'); ap.add_argument('--canon'); ap.add_argument('--prev'); ap.add_argument('--L', type=float, default=500)
ap.add_argument('--band'); ap.add_argument('--access'); ap.add_argument('--out'); ap.add_argument('--s0', type=float, default=0.5)
ap.add_argument('--uhb', type=float, required=True, help='한반도 고유 품목 비중 합(닛폰 안으로 드는 꼬리)')
ap.add_argument('--unp', type=float, required=True, help='닛폰 고유 품목 비중 합(한반도 안으로 드는 꼬리)')
a = ap.parse_args()

for f in fm.findSystemFonts():
    if 'NotoSansCJK-Regular' in f or 'NotoSansCJK-Medium' in f:
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False

Z = ['hanbando', 'nippon']
KO = {'hanbando': '한반도(새벌)', 'nippon': '닛폰'}
G = {z: json.load(open(f'{a.grid}/{z}.grid.json')) for z in Z}
canon, prev = json.load(open(a.canon)), json.load(open(a.prev))
COL = {'iron': '#8b1a1a', 'copper': '#e07b24', 'gold': '#e8c21c', 'silver': '#a9b4bf', 'lead': '#4a5566', 'tin': '#7fd3e8',
       'jade_raw': '#2e9e5b', 'obsidian': '#3a2050', 'sulfur': '#c6d93a', 'cinnabar': '#e0182d', 'iron_sand': '#7a5232'}
KON = {'iron': '철', 'copper': '구리', 'gold': '금', 'silver': '은', 'lead': '납(연은)', 'tin': '주석', 'jade_raw': '옥(비취)',
       'obsidian': '흑요석', 'sulfur': '유황', 'cinnabar': '진사', 'iron_sand': '사철'}
# 두 존을 나란히(한반도 서 · 닛폰 동 — 같은 세로) — 단위 셀
OX = {'hanbando': 0, 'nippon': G['hanbando']['NX']}
W = G['hanbando']['NX'] + G['nippon']['NX']; H = max(G[z]['NY'] for z in Z)

def land_img(g):
    GX, GY, Gs = g['GX'], g['GY'], g['G']
    a2 = np.array(g['land'], dtype=float).reshape(GY, GX) / (Gs * Gs)
    return a2

def base(ax, title):
    for z in Z:
        g = G[z]; img = land_img(g)
        ax.imshow(np.where(img > 0.05, 0.92 - 0.25 * img, 1.0), cmap='gray', vmin=0, vmax=1, origin='upper',
                  extent=[OX[z], OX[z] + g['GX'] * g['G'], g['GY'] * g['G'], 0], interpolation='nearest')
    ax.axvline(G['hanbando']['NX'], color='#c04040', lw=0.8, ls='--')
    ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect('equal'); ax.set_xticks([]); ax.set_yticks([])
    ax.set_title(title, fontsize=10)

def veins(ax, doc):
    for z in Z:
        for o in doc[z]['ores']:
            cx = o['center'][0] / 32 + OX[z]; cy = o['center'][1] / 32; r = o['radius'] / 32
            c = COL.get(o.get('mineral'), '#ff00ff')
            if o.get('minor'):
                ax.plot(cx, cy, 'o', ms=1.1, color=c, alpha=0.8, mec='none')
            else:
                ax.add_patch(Circle((cx, cy), r, facecolor=c, edgecolor='k', lw=0.3, alpha=0.85))

def area_share(doc, z):
    t = {}; s = 0
    for o in doc[z]['ores']:
        ar = (o['radius'] / 32) ** 2; t[o['mineral']] = t.get(o['mineral'], 0) + ar; s += ar
    return {k: v / s for k, v in sorted(t.items(), key=lambda kv: -kv[1])}

nP = 3 + (1 if a.access else 0)
fig, axs = plt.subplots(1, nP, figsize=(6.2 * nP, 7.6), dpi=130)
base(axs[0], 'ⓐ 혼용 전 — 정본 광맥(지배 광종)'); veins(axs[0], canon)
base(axs[1], f'ⓑ 혼용 후 — 미리보기(L {int(a.L)}셀 · 닛폰 다 굽기 · 한반도 덜 흔드는 굽기)'); veins(axs[1], prev)
for i, doc in ((0, canon), (1, prev)):
    txt = '\n'.join(f"{KO[z]}: " + ' · '.join(f"{KON.get(k, k)} {v * 100:.0f}" for k, v in list(area_share(doc, z).items())[:6]) for z in Z)
    axs[i].text(0.01, 0.005, '면적 %(지배 광종)\n' + txt, transform=axs[i].transAxes, fontsize=6.5, va='bottom', ha='left',
                bbox=dict(boxstyle='round', fc='white', alpha=0.85, lw=0.3))
# ⓒ 꼬리 몫 — 거리 d(셀)의 함수(이웃이 한 존 · 셀 가운데)
ax = axs[2]; base(ax, f'ⓒ 경계 넘는 꼬리 — 이웃 고유 품목 몫(s0 {a.s0} · L {int(a.L)})')
for z in Z:
    g = G[z]; d = np.array(g['dist'], dtype=float).reshape(g['GY'], g['GX']); land = land_img(g) > 0.05
    U = a.unp if z == 'hanbando' else a.uhb
    sh = np.where((d >= 0) & land, a.s0 * U * np.exp(-np.maximum(d, 0) / a.L), np.nan)
    im = ax.imshow(sh * 100, cmap='magma_r', vmin=0, vmax=16, origin='upper', alpha=0.9,
                   extent=[OX[z], OX[z] + g['GX'] * g['G'], g['GY'] * g['G'], 0], interpolation='nearest')
    # 1% 선 — L 셋
    for Lc, ls in ((250, ':'), (500, '-'), (1000, '--')):
        dd = Lc * math.log(a.s0 * U / 0.01) if a.s0 * U > 0.01 else 0
        x = OX[z] + (G['hanbando']['NX'] - dd if z == 'hanbando' else dd)
        if 0 < dd < g['NX']: ax.axvline(x, color='#2060c0', lw=0.8, ls=ls)
cb = fig.colorbar(im, ax=ax, fraction=0.04, pad=0.01); cb.set_label('이웃 고유 품목 몫 %', fontsize=8)
ax.text(0.01, 0.005, '한반도 안 = 닛폰 고유(옥·유황) · 닛폰 안 = 한반도 고유(철 정광)\n파란 선 = 몫 1% 선(점선 L250 · 실선 L500 · 긴점선 L1000)',
        transform=ax.transAxes, fontsize=6.5, va='bottom', bbox=dict(boxstyle='round', fc='white', alpha=0.85, lw=0.3))
if a.access:
    # ⓓ 빨간 줄 — 한반도 제 품목 중 미리보기(L) 전부 광맥 기준으로 시딩 마을에 가장 덜 닿는 둘: 그 광맥 자리 + 닿는/못 닿는 마을
    acc = json.load(open(a.access)); ax = axs[3]
    lab = f'L{int(a.L)}'; r = acc['zones']['hanbando']; vv = r['vars'].get(lab) or r['vars'][list(r['vars'])[0]]
    own = [k.split(':')[0] for k in vv if k.endswith(':all') and not k.startswith('*') and k.split(':')[0] not in ('iron',)]
    worst = sorted(own, key=lambda m: vv[m + ':all']['seeded'])[:2]
    base(ax, 'ⓓ 존 안 접근성(추신3) — 한반도 ' + ' · '.join(f"{KON.get(m, m)} {vv[m + ':all']['seeded']}/{r['seeded']}" for m in worst) + f' 마을(걸음 ≤ {acc["reach"]}셀)')
    for m in worst:
        for o in prev['hanbando']['ores']:
            if o.get('mineral') == m or (o.get('minerals') or {}).get(m, 0) > 0:
                cx = o['center'][0] / 32; cy = o['center'][1] / 32; rr = max(o['radius'] / 32, 6)
                ax.add_patch(Circle((cx, cy), rr, facecolor=COL.get(m, '#f0f'), edgecolor='k', lw=0.4, alpha=0.9))
    miss = set()
    for m in worst: miss |= set(vv[m + ':all']['miss'])
    for v in canon['hanbando'].get('villages', []):
        x, y = v.get('x', (v.get('pos') or [0, 0])[0]) / 32, v.get('y', (v.get('pos') or [0, 0])[1]) / 32
        ax.plot(x, y, marker='^', ms=4, color=('#d02020' if v.get('name') in miss else '#20a040'), mec='k', mew=0.3)
    ax.text(0.01, 0.005, '▲빨강 = 둘 중 하나라도 못 닿는 시딩 마을 · ▲초록 = 둘 다 닿는다\n(한반도 마을 51 · 철은 재민 08-01 ① "주요엔 철 없음"이라 뺐다)',
            transform=ax.transAxes, fontsize=6.5, va='bottom', bbox=dict(boxstyle='round', fc='white', alpha=0.85, lw=0.3))
# 범례
hs = [plt.Line2D([0], [0], marker='o', color='w', markerfacecolor=c, markersize=7, label=KON[k]) for k, c in COL.items()]
fig.legend(handles=hs, loc='lower center', ncol=len(hs), fontsize=8, frameon=False)
fig.suptitle('T574 존 특산 — 광종 지도 혼용 전/후 + 경계 넘는 꼬리(점선 = 존 경계)', fontsize=12)
fig.tight_layout(rect=[0, 0.04, 1, 0.97])
fig.savefig(a.out); print('→', a.out)
