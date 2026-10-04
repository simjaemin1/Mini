#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T614 ③ 그림 · 관측 전용) 바뀐 남해안 하구 셋 확대 — 옛 물(회색) · 새 물(파랑) · 바다 띠 · 옛 강선(회 점선) · 새 강선(파랑)
#   옛 다리 회색 · 뺀 다리 회색 × · 새 다리 빨강 · 옮긴 마을 화살표(재민 = 보라) · 옮긴 광맥 화살표(주황)
# 쓰는 법: python3 scripts/t614-fig.py <out.png> <dir(/tmp/t614)> <옛 work> <새 work> [새 다리 flat.json]
import json, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
for f in fm.findSystemFonts():
    if 'NotoSansCJK-Regular' in f or 'NanumGothic' in f: fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
OUT, D = sys.argv[1], sys.argv[2]
def wk(p):
    j = json.load(open(p, encoding='utf-8')); return j['work'] if 'work' in j and 'mf' in j['work'] else j
A, B = wk(sys.argv[3]), wk(sys.argv[4]); NEWBR = json.load(open(sys.argv[5])) if len(sys.argv) > 5 else {}
NY = 4063; X0 = {'hanbando': 409984, 'nippon': 480000}; Y0 = 49984; SZ = 32
def load(tag, s, nx): return np.fromfile(f'{D}/{tag}_{s}.kind.u8', np.uint8).reshape(NY, nx)
ko = np.concatenate([load('han', 'old', 2188), load('nip', 'old', 2187)], 1); kn = np.concatenate([load('han', 'new', 2188), load('nip', 'new', 2187)], 1)
img = np.zeros(ko.shape + (3,), np.float32); img[:] = (0.93, 0.90, 0.80)
img[kn == 3] = (0.62, 0.60, 0.57); img[kn == 1] = (0.70, 0.83, 0.93); img[kn == 2] = (0.30, 0.55, 0.85)
img[(ko == 2) & (kn != 2)] = (0.78, 0.78, 0.82)                 # 옛 물 → 뭍(지운·줄인 하구)
img[(kn == 2) & (ko != 2)] = (0.05, 0.25, 0.70)                 # 새로 물(강1 · 다시 그은 길)
BR = json.load(open(f'{D}/br_old.json')); HIT = json.load(open(f'{D}/br_hit.json'))
removed = {tuple(c) for r in HIT['hanbando'] if r['newWater'] == 0 for c in r['cells']}
def cells(z, flat): o = 0 if z == 'hanbando' else 2188; return [(flat[i] + o, flat[i + 1]) for i in range(0, len(flat) - 1, 2)]
VM = json.load(open(f'{D}/vill.json')); ORE = json.load(open(f'{D}/ores_move.json'))
panels = [('서 — 둔머리천 · 노루내', 0, 3780, 520, 4063), ('가운데 — 한여울강 · 흰숲천 · 한들천 · 가랑천', 640, 3700, 1560, 4063), ('동 — 강1(새로) · 솔여울·미르내(지움) · 어촌6 · 닛폰 아라가와·오오가와·쿠로가와', 1760, 3650, 2188 + 720, 4063)]
fig, axs = plt.subplots(3, 1, figsize=(16, 21), gridspec_kw={'height_ratios': [p[4] - p[2] for p in panels]})
def wline(ax, f, **kw):
    xs = [(p['x'] - X0['hanbando']) / SZ for p in f['path']]; ys = [(p['y'] - Y0) / SZ for p in f['path']]; ax.plot(xs, ys, **kw)
am = {str(f['id']): f for f in A['mf']}; bm = {str(f['id']): f for f in B['mf']}
SC = ['986', '1005', '1022', '1026', '1008', '1015', '1025', '1027', '3', '2881', '2882', '2825', '2823', '2826', '2827']
for ax, (tt, x0, y0, x1, y1) in zip(axs, panels):
    ax.imshow(img[y0:y1, x0:x1], extent=(x0, x1, y1, y0), interpolation='nearest')
    for i in SC:
        if i in am: wline(ax, am[i], color='0.35', lw=1.2, ls='--')
        if i in bm: wline(ax, bm[i], color='navy', lw=1.4)
    for z in ('hanbando', 'nippon'):
        for (x, y) in cells(z, BR[z]['bridges']):
            if x0 <= x < x1 and y0 <= y < y1:
                ax.add_patch(plt.Rectangle((x, y), 1, 1, color=('0.15' if (x, y) in removed else '0.45'), lw=0))
        for (x, y) in cells(z, NEWBR.get(z, [])):
            if x0 <= x < x1 and y0 <= y < y1: ax.add_patch(plt.Rectangle((x, y), 1, 1, color='red', lw=0))
    for (x, y) in removed:
        if x0 <= x < x1 and y0 <= y < y1: ax.plot(x + .5, y + .5, 'x', color='k', ms=10, mew=2); break
    for z in ('hanbando', 'nippon'):
        o = 0 if z == 'hanbando' else 2188
        for r in VM[z]:
            (ox, oy), (nx_, ny_) = r['old']['c'], r['new']['c']; ox += o; nx_ += o
            if x0 <= nx_ < x1 and y0 <= ny_ < y1 or x0 <= ox < x1 and y0 <= oy < y1:
                if (ox, oy) != (nx_, ny_):
                    ax.annotate('', xy=(nx_, ny_), xytext=(ox, oy), arrowprops=dict(arrowstyle='->', color='purple', lw=2.2))
                    ax.plot(ox, oy, 'o', mfc='none', mec='purple', ms=9)
                ax.plot(nx_, ny_, 'o', color='purple', ms=8); ax.text(nx_ + 4, ny_ - 4, r['name'] + (' (재민 옮김)' if (ox, oy) != (nx_, ny_) else ''), color='purple', fontsize=10)
    for r in ORE:
        if not r['to']: continue
        (fx, fy), (tx, ty) = r['from'], r['to']
        if x0 <= tx < x1 and y0 <= ty < y1:
            ax.annotate('', xy=(tx + .5, ty + .5), xytext=(fx, fy), arrowprops=dict(arrowstyle='->', color='darkorange', lw=1.4))
            ax.plot(tx + .5, ty + .5, 's', color='darkorange', ms=4)
    ax.set_xlim(x0, x1); ax.set_ylim(y1, y0); ax.set_title(tt, fontsize=13, loc='left')
    if x1 > 2188 > x0: ax.axvline(2188, color='k', lw=0.8, ls=':'); ax.text(2190, y0 + 12, '닛폰 →', fontsize=10)
    ax.set_xlabel('칸 x (한반도 local · 닛폰은 +2188)'); ax.set_ylabel('칸 y')
from matplotlib.patches import Patch
from matplotlib.lines import Line2D
h = [Patch(color=(0.30, 0.55, 0.85), label='v2 물(그대로)'), Patch(color=(0.05, 0.25, 0.70), label='v2 새 물(강1 · 다시 그은 길)'), Patch(color=(0.78, 0.78, 0.82), label='옛 물 → 뭍(지움 · 줄임)'),
     Patch(color=(0.70, 0.83, 0.93), label='바다 띠(b+90)'), Patch(color='0.45', label='옛 다리(남김)'), Patch(color='0.15', label='뜬 다리(뺌 ×)'), Patch(color='red', label='새 다리(지름길 후보 · 강1)'),
     Line2D([], [], color='0.35', ls='--', label='옛 강선'), Line2D([], [], color='navy', label='v2 강선'), Line2D([], [], color='purple', marker='o', label='마을(화살표 = 옮김)'), Line2D([], [], color='darkorange', marker='s', label='바다 위 광맥 → 뭍(옮김)')]
fig.legend(handles=h, loc='lower center', fontsize=10, ncol=6, framealpha=0.95)
fig.suptitle('T614 — 재민 v2 남해안 강 둘레: 다리 · 마을 · 바다 위 광맥', fontsize=16)
fig.tight_layout(rect=(0, 0.035, 1, 0.98)); fig.savefig(OUT, dpi=80); print('→', OUT)
