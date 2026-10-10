#!/usr/bin/env python3
# === scripts/t679-plot.py — T679 켤 판 그림 한 장(재민 판정용) =====================================================
# 입력: T646 자 견줌 판(`T678_GATES=verify --astar`)의 결과 json(조각마다 `t678.v` — 걷는 길이 비 · 그림 표본)
# 출력: PNG 한 장 — ① 같은 쌍 걷는 길이 비(문 ÷ 칸 A*) 누적 분포: T678 내려가기 길 vs T679 회랑 길
#                   ② 못 닿던 쌍 하나(칸 A* 예산 1,500 실패 · 예산 없으면 닿음) — 지도 위 문 길 · 칸 A*(예산 없음)
#                   ③ 꼬리 쌍 하나 — 같은 쌍의 T678 길 · T679 길 · 칸 A*
# 쓰기: python3 scripts/t679-plot.py <ver.json> <out.png>
import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch

for f in font_manager.findSystemFonts():
    if 'NotoSansCJK-Regular' in f or 'NanumGothic' in f:
        font_manager.fontManager.addfont(f)
        plt.rcParams['font.family'] = font_manager.FontProperties(fname=f).get_name()
        break
plt.rcParams['axes.unicode_minus'] = False

src, out = sys.argv[1], sys.argv[2]
J = json.load(open(src))
new, old, samples = [], [], []
for w in J['windows']:
    for sl in w['slices']:
        v = (sl.get('t678') or {}).get('v') or {}
        new += v.get('walkRatios') or []
        old += v.get('walkRatiosOld') or []
        samples += v.get('samples') or []

def q(a, p):
    a = sorted(a)
    return a[min(len(a) - 1, int(len(a) * p))] if a else float('nan')

fig = plt.figure(figsize=(18, 6.2), dpi=110)
ax = fig.add_subplot(1, 3, 1)
for arr, lab, col in [(old, 'T678 내려가기 길(문 대표 칸 들름)', '#c0392b'), (new, 'T679 회랑 BFS 길', '#1e8449')]:
    if not arr: continue
    x = np.sort(arr); y = np.arange(1, len(x) + 1) / len(x)
    ax.step(x, y, where='post', color=col, lw=2, label=f'{lab}  p50 {q(arr,.5):.2f} · p90 {q(arr,.9):.2f} · p95 {q(arr,.95):.2f}')
ax.axvline(1.15, color='#555', ls='--', lw=1); ax.text(1.17, 0.55, '카드 목표\np95 ≤ 1.15', fontsize=9, color='#555')
ax.axhline(0.95, color='#aaa', ls=':', lw=1)
ax.set_xlim(0.6, 3.0); ax.set_ylim(0, 1.01)
ax.set_xlabel('걷는 길이 비(스무딩 뒤 · 문 길 ÷ 칸 A*) — 같은 출발·목표'); ax.set_ylabel('누적 몫')
ax.set_title(f'① 길이 꼬리 — 둘 다 찾은 쌍 {len(new)}', fontsize=12)
ax.legend(loc='lower right', fontsize=9)

cmap = ListedColormap(['#2c3e50', '#f4f1e8', '#e67e22', '#bdc3c7'])   # 막힘 · 통행 · 다리 · 표 없음
def draw_map(ax, s, title, lines):
    R = s['R']; n = 2 * R + 1
    g = np.array([{'0': 0, '1': 1, 'b': 2, '?': 3}[c] for c in s['grid']]).reshape(n, n)
    ax.imshow(g, cmap=cmap, vmin=0, vmax=3, interpolation='nearest', extent=(s['sx'] - R - .5, s['sx'] + R + .5, s['sy'] + R + .5, s['sy'] - R - .5))
    for pts, col, ls, lab in lines:
        if not pts: continue
        xs = [s['sx'] + .0] + [p[0] for p in pts]; ys = [s['sy'] + .0] + [p[1] for p in pts]
        ax.plot(xs, ys, color=col, ls=ls, lw=2.2, label=lab)
    ax.plot([s['sx']], [s['sy']], 'o', color='#2980b9', ms=9, label='출발'); ax.plot([s['gx']], [s['gy']], '*', color='#8e44ad', ms=15, label='목표')
    # 길이 지나는 상자 + 여백으로 당겨 본다(최소 한 변 32칸 = 청크 하나)
    xs = [s['sx'], s['gx']] + [p[0] for pts, *_ in lines if pts for p in pts]; ys = [s['sy'], s['gy']] + [p[1] for pts, *_ in lines if pts for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2; half = max(16, (max(xs) - min(xs)) / 2 + 8, (max(ys) - min(ys)) / 2 + 8)
    ax.set_xlim(cx - half, cx + half); ax.set_ylim(cy + half, cy - half)
    h, l = ax.get_legend_handles_labels()
    h += [Patch(color='#2c3e50', label='물·바위(막힘)'), Patch(color='#e67e22', label='다리 칸'), Patch(color='#f4f1e8', label='통행')]
    ax.set_title(title, fontsize=11); ax.legend(handles=h, loc='lower left', fontsize=8, framealpha=.9)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_xlabel('한 칸 = 32 px(1 m) · 칸 길은 스무딩 뒤 꼭짓점', fontsize=8)

un = [s for s in samples if s['kind'] == 'unreach']
pick = None
if un:   # 칸 A* 예산 없는 길과 문 길이 둘 다 있는 쌍 중 가장 긴 것
    cand = [s for s in un if s.get('astarUnl')]
    pick = max(cand or un, key=lambda s: s.get('lenNew') or 0)
ax2 = fig.add_subplot(1, 3, 2)
if pick:
    man = abs(pick['gx'] - pick['sx']) + abs(pick['gy'] - pick['sy'])
    draw_map(ax2, pick, f"② 못 닿던 쌍 — 칸 A* 예산 1,500 → null(끔: 식힘 뒤 되묻기)\n켬: 문 길로 걷는다 · 맨해튼 {man}칸 · 문 길 {pick['lenNew']/32:.0f}칸 · 칸 A*(예산 없음) {((pick.get('lenUnl') or 0)/32):.0f}칸",
             [(pick.get('astarUnl'), '#111', '--', '칸 A*(예산 없음 · 그림용)'), (pick.get('gNew'), '#1e8449', '-', 'T679 문 길(켬)')])
else:
    ax2.text(.5, .5, '표본 없음', ha='center'); ax2.axis('off')

tails = [s for s in samples if s['kind'] == 'tail']
ax3 = fig.add_subplot(1, 3, 3)
if tails:
    t = max(tails, key=lambda s: s['ratioOld'])
    draw_map(ax3, t, f"③ 꼬리 쌍 — 같은 출발·목표\nT678 길 비 {t['ratioOld']:.2f} → T679 {t['ratioNew']:.2f}(칸 A* = 1)",
             [(t.get('astar'), '#111', '--', '칸 A*(끔 · 정본)'), (t.get('gOld'), '#c0392b', '-', 'T678 내려가기 길'), (t.get('gNew'), '#1e8449', '-', 'T679 회랑 길')])
else:
    ax3.text(.5, .5, '표본 없음', ha='center'); ax3.axis('off')

fig.suptitle('T679 청크 문 그래프 2단계 — 켤 판(한반도 · 틀 t100 · 견줌 판: 세계는 끔 그대로, 문 길을 곁에서 세어 견줌)', fontsize=13)
fig.tight_layout(rect=(0, 0, 1, .95))
fig.savefig(out)
print('그림', out, '· 쌍', len(new), '· 표본', len(samples), f'· 새 p95 {q(new,.95):.3f} · 옛 p95 {q(old,.95):.3f}')
