#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T639 그림) 한반도 남해안 — 강1 지름길 다리 둘(빨강) · 자른 하구 꼬리 둘(잘린 물 = 주황 · 새 끝 ×)
# 쓰는 법: python3 scripts/t639-fig.py <out.png> <앞 kind.u8(T631 판)> <뒤 kind.u8(T639 판)> <지름길 json>
import json, sys, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
for f in fm.findSystemFonts():
    if 'NotoSansCJK-Regular' in f: fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
OUT = sys.argv[1]; NX, NY = 2188, 4063
ko = np.fromfile(sys.argv[2], np.uint8).reshape(NY, NX); kn = np.fromfile(sys.argv[3], np.uint8).reshape(NY, NX)
S = json.load(open(sys.argv[4]))
img = np.zeros((NY, NX, 3), np.float32); img[:] = (0.93, 0.90, 0.80)
img[kn == 3] = (0.62, 0.60, 0.57); img[kn == 1] = (0.70, 0.83, 0.93); img[kn == 2] = (0.30, 0.55, 0.85)
img[(ko == 2) & (kn != 2)] = (0.95, 0.55, 0.15)
D = json.load(open('server/hanbando-terrain.json', encoding='utf-8'))['hanbando']
ends = {r['name']: r['path'][-1]['pos'] for r in D['rivers'] if r['name'] in ('둔머리천', '강1')}
P = [('강1 지름길 다리 둘(광산6–어촌6)', 1930, 3690, 2030, 3790), ('둔머리천 하구 꼬리', 60, 3880, 200, 4000), ('강1 하구 꼬리', 2090, 3880, 2188, 3970)]
fig, axs = plt.subplots(1, 3, figsize=(18, 6.5))
for ax, (tt, x0, y0, x1, y1) in zip(axs, P):
    ax.imshow(img[y0:y1, x0:x1], extent=(x0, x1, y1, y0), interpolation='nearest')
    for c in S:
        for i in range(0, len(c['cells']) - 1, 2):
            x, y = c['cells'][i], c['cells'][i + 1]
            if x0 <= x < x1 and y0 <= y < y1: ax.add_patch(plt.Rectangle((x, y), 1, 1, color='red', lw=0))
    for nm, e in ends.items():
        ex, ey = e[0] / 32, e[1] / 32
        if x0 <= ex < x1 and y0 <= ey < y1: ax.plot(ex, ey, 'kx', ms=12, mew=2.5); ax.text(ex + 2, ey - 2, f'{nm} 새 끝', fontsize=10)
    ax.set_xlim(x0, x1); ax.set_ylim(y1, y0); ax.set_title(tt, fontsize=12, loc='left'); ax.set_xlabel('칸 x'); ax.set_ylabel('칸 y')
from matplotlib.patches import Patch
fig.legend(handles=[Patch(color=(0.30, 0.55, 0.85), label='강·호수'), Patch(color=(0.70, 0.83, 0.93), label='바다 띠(b+90)'), Patch(color=(0.95, 0.55, 0.15), label='잘린 꼬리(띠 반폭+2+1셀 안)'), Patch(color='red', label='새 다리(지름길 · 32+2셀)')], loc='lower center', ncol=4, fontsize=11)
fig.suptitle('T639 — 남해안 마무리: 강1 지름길 다리 둘 · 하구 꼬리 자름(바다 위 강 점 8 → 0)', fontsize=14)
fig.tight_layout(rect=(0, 0.06, 1, 0.95)); fig.savefig(OUT, dpi=80); print('→', OUT)
