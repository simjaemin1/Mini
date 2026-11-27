#!/usr/bin/env python3
# T1493 그림 — 길은 보이는 구역만(끔 = T1448 켬 · T1493 끔 파랑 ↔ 켬 = T1493 켬 주황) · 라이브 사본 길 · 마을 켬
#   ① welcome 길 몫(사본 그날 꼴 — 11-09 · 11-23 · KB) ② 접속 누름 → 첫 그림(ms — 크롬 · WebKit · 묵힌 11-23) ③ 느린 망 welcome 받기 어림(초 — 선 위 바이트 ÷ 42.5 KB/s)
#   ④ 걸을 때 청크 넘기마다 온 길 묶음(켬 · 11-23 그날 꼴 · 마을 셋 가로지르기 — 묶음 하나 평균 KB) ⑤ 켬 장부 가득 청소(ms — 구역 객체 T1448 ↔ 판 T1493 · 끔 칸 객체 회색)
#   ⑥ 켬 장부 하루 저장 묶음 수(밟기 3.8만 칸 · 11-23)
#   색 = 파랑(#2a78d6) · 주황(#eb6834) — dataviz 검사 통과(T1448 그림과 같은 두 색) · 셋째(끔 칸 객체)는 회색 · 막대 위 값(색에만 기대지 않는다)
# 쓰는 법: python3 t1493_plot.py <계측 폴더> <out.png> <T1448 판 grid-1123 json>
import json, sys, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
D, OUT, G48 = sys.argv[1:4]
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID, OFF, ON, GRAY = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df', '#2a78d6', '#eb6834', '#b8b6b0'
P = lambda f: os.path.join(D, f)
J = lambda f: json.load(open(P(f), encoding='utf-8'))
has = lambda f: os.path.exists(P(f))

def style(ax):
    ax.set_facecolor(SURF); ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    for s in ('left', 'bottom'): ax.spines[s].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=8.5)
def bars(ax, title, items, fmt):
    style(ax)
    xs = range(len(items))
    ax.bar(xs, [v for _, v, _ in items], color=[c for _, _, c in items], width=0.62, edgecolor=SURF, linewidth=2, zorder=3)
    top = max(v for _, v, _ in items) or 1
    for x, (_, v, _) in zip(xs, items): ax.text(x, v + top * 0.02, fmt(v), ha='center', va='bottom', fontsize=9, color=INK)
    ax.set_xticks(list(xs)); ax.set_xticklabels([n for n, _, _ in items], fontsize=8.5, color=INK2)
    ax.set_ylim(0, top * 1.22); ax.set_title(title, loc='left', fontsize=10.5, color=INK, pad=6)
kb = lambda v: f'{v / 1024:.2f} MB' if v >= 1024 else f'{v:.0f} KB'

fig, axs = plt.subplots(2, 3, figsize=(16, 8.6), facecolor=SURF)
# ① welcome 길 몫(KB) — 사본 그날 꼴(있으면) · 없으면 묵힌 11-23
it = []
for tag, a, b in (('11-09', 'welcome-1109-rb0.json', 'welcome-1109-rb1.json'), ('11-23', 'welcome-1123s-rb0.json', 'welcome-1123s-rb1.json')):
    if has(a) and has(b) and J(a).get('wsum') and J(b).get('wsum'):
        it += [(f'{tag} 끔', J(a)['wsum']['roadBytes'] / 1024, OFF), (f'{tag} 켬', J(b)['wsum']['roadBytes'] / 1024, ON)]
if not it: it = [('11-23 끔', J('welcome-rb0.json')['wsum']['roadBytes'] / 1024, OFF), ('11-23 켬', J('welcome-rb1.json')['wsum']['roadBytes'] / 1024, ON)]
bars(axs[0][0], '① welcome 길 몫 — 사본 그날 꼴(광장 · KB)', it, kb)
# ② 접속 누름 → 첫 그림(ms)
rp = {r['tag']: r for r in J('repro/repro.json')['rows']}
ck = lambda r: ((r.get('load') or {}).get('at') or {})
c0, c1 = ck(rp.get('vs0nat1rb0', {})), ck(rp.get('vs0nat1rb1', {}))
k0, k1 = J('webkit-rb0.json')['load']['at'], J('webkit-rb1.json')['load']['at']
bars(axs[0][1], '② 접속 누름 → 첫 그림(ms · 묵힌 11-23 사본)', [('크롬 끔', c0['frame1'] - c0['click'], OFF), ('크롬 켬', c1['frame1'] - c1['click'], ON),
     ('WebKit 끔', k0['frame1'] - k0['click'], OFF), ('WebKit 켬', k1['frame1'] - k1['click'], ON)], lambda v: f'{v:,.0f}')
# ③ 느린 망 어림(42.5 KB/s — 선 위 바이트 ÷ 속도) — 사본 그날 꼴 welcome 통째(초)
it3 = []
for tag, a, b in (('11-09', 'welcome-1109-rb0.json', 'welcome-1109-rb1.json'), ('11-23', 'welcome-1123s-rb0.json', 'welcome-1123s-rb1.json')):
    if has(a) and has(b): it3 += [(f'{tag} 끔', J(a)['wsum']['slowSec'], OFF), (f'{tag} 켬', J(b)['wsum']['slowSec'], ON)]
bars(axs[0][2], '③ 느린 망(42.5 KB/s) welcome 받기 어림(초 — 선 위 바이트 ÷ 속도)', it3, lambda v: f'{v:.1f}초')
# ④ 청크 넘기마다 길 묶음 — 켬(마을 셋 · 11-23 그날 꼴)
ax = axs[1][0]; style(ax)
w1 = J('welcome-1123s-rb1.json') if has('welcome-1123s-rb1.json') else J('welcome-rb1.json'); msgs = w1.get('perMsg', {})
walks = [(n, w1.get('walk_' + n, {})) for n in ('임업2', '농촌22', '광산1')]
vals = [wv.get('kb', 0) / max(1, wv.get('msgs', 1)) for _, wv in walks]
ax.bar(range(3), vals, color=ON, width=0.62, edgecolor=SURF, linewidth=2, zorder=3)
for x, (n, wv) in enumerate(walks): ax.text(x, vals[x] + max(vals) * 0.02, f"{vals[x]:.1f} KB\n({wv.get('msgs', 0)}묶음 · {wv.get('cells', 0):,}칸)", ha='center', va='bottom', fontsize=8.8, color=INK)
ax.set_xticks(range(3)); ax.set_xticklabels([f'{n} 가로지르기' for n, _ in walks], fontsize=8.5, color=INK2); ax.set_ylim(0, max(vals) * 1.35)
ax.set_title(f"④ 켬 — 걸을 때 청크 넘기마다 길 묶음(11-23 · 평균 KB) · {msgs.get('n')}묶음 가운데 {msgs.get('medKB')} KB", loc='left', fontsize=10.5, color=INK, pad=6)
# ⑤ 가득 청소 · ⑥ 하루 저장 묶음
g23, g48 = J('grid-1123.json')['probes'], json.load(open(G48))['probes']
bars(axs[1][1], '⑤ 켬 장부 가득 청소(ms · 11-23 사본)', [('구역 객체(T1448)', g48['gfull']['gcMs'], OFF), ('판(T1493)', g23['gfull']['gcMs'], ON),
     ('끔 칸 객체', g23['full']['gcMs'], GRAY)], lambda v: f'{v:.1f} ms')
bars(axs[1][2], '⑥ 켬 장부 하루 저장 묶음 수(밟기 3.8만 칸 · 11-23)', [('T1448(키로 셈)', g48['gfull']['day1']['batches'], OFF), ('T1493(구역 행으로 셈)', g23['gfull']['day1']['batches'], ON)], lambda v: f'{v:,.0f}')
fig.suptitle('T1493 — 길은 보이는 구역만(끔 파랑 ↔ 켬 주황) · 라이브 사본 길(한반도) · 마을 켬', x=0.02, ha='left', fontsize=13, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.95))
fig.savefig(OUT, dpi=170, facecolor=SURF)
print(OUT)
