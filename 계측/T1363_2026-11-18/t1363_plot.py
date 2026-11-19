#!/usr/bin/env python3
# T1363 그림 — ⓐ 세계 · ①②③ 시드 1020 세 해(끔 · 고침 · 묶음 · 묶음 + 고침 · 반사실) · ④ 세 시드 2년째 굶어 죽음
#   python3 t1363_plot.py <판 지도 JSON — t1363_table.py 꼴> <out.png>
#   색 = 세계(끔 파랑 · 묶음 주황 · 반사실 청록 — 검증 팔레트 1 · 2 · 3번) · 선 꼴 = 고침(점선 끔 · 실선 켬) · 막대는 빗금 = 고침 끔 · 칠 = 켬
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from t1363_table import load, csum
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
M = json.load(open(sys.argv[1])); OUT = sys.argv[2]
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['hatch.linewidth'] = 1.2
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
BLUE, ORANGE, AQUA = '#2a78d6', '#eb6834', '#1baf7a'
ST = {'A': dict(c=BLUE, ls=(0, (5, 3)), lw=1.6, lab='끔(ⓐ 세계)', fix=False),
      'FXA': dict(c=BLUE, ls='-', lw=2.4, lab='고침(T1363_FAMINE_TOOLS=1)', fix=True),
      'BKA': dict(c=ORANGE, ls=(0, (5, 3)), lw=1.6, lab='묶음', fix=False),
      'BFA': dict(c=ORANGE, ls='-', lw=2.4, lab='묶음 + 고침', fix=True),
      'CFA': dict(c=AQUA, ls=(0, (6, 2, 1, 2)), lw=1.8, lab='끔 · 반사실(생산 도구 몫 ≥ 0.5)', fix=None)}
ORDER = [a for a in ('A', 'FXA', 'BKA', 'BFA', 'CFA') if a in M and '1020' in M[a]['seeds']]
D = {a: load(M[a]['seeds']['1020'], '1020') for a in ORDER}
last = max(v['last'] for v in D.values())
fig = plt.figure(figsize=(11, 14), facecolor=SURF)
gs = fig.add_gridspec(4, 1, height_ratios=[1.1, 1.0, 0.95, 0.95], hspace=0.5)
axs = [fig.add_subplot(gs[i]) for i in range(4)]
def deco(ax, title, ylab):
    ax.set_facecolor(SURF)
    for y0 in (275, 640, 1005):
        if y0 < last: ax.axvspan(y0, min(y0 + 89, last), color='#eef3fb', lw=0, zorder=0)
    for yb in (365, 730):
        if yb < last: ax.axvline(yb, color=INK2, lw=0.7, ls=':', zorder=1)
    ax.set_xlim(0, last * 1.07); ax.grid(axis='y', color=GRID, lw=0.6); ax.tick_params(colors=INK2, labelsize=9)
    for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
    for sp in ('left', 'bottom'): ax.spines[sp].set_color('#b9b8b2')
    ax.set_title(title, loc='left', fontsize=11.5, color=INK, pad=6); ax.set_ylabel(ylab, color=INK2, fontsize=9.5)
def cum(I, days):
    c, out = 0, []
    for d in days: c += I.get(d, 0); out.append(c)
    return out
def endlabels(ax, pts):
    # 선 끝 값 글 — 겹치면 위아래로 밀어 낸다(글은 먹색 · 선 색은 옆 짧은 줄이 맡는다)
    pts = sorted(pts, key=lambda t: t[1]); ys = []
    lo, hi = ax.get_ylim(); gap = (hi - lo) * 0.055
    for x, y, txt, c in pts:
        yy = y if not ys or y - ys[-1] >= gap else ys[-1] + gap
        ys.append(yy)
        ax.annotate(txt, (x, y), xytext=(x + last * 0.008, yy), textcoords='data', color=INK2, fontsize=8.5, va='center',
                    arrowprops=dict(arrowstyle='-', color=c, lw=1.2, shrinkA=0, shrinkB=0))
ax = axs[0]
pts = []
for a in ORDER:
    v = D[a]; s = ST[a]
    ax.plot(v['days'], [v['P'][d] for d in v['days']], color=s['c'], ls=s['ls'], lw=s['lw'], label=s['lab'], zorder=3)
    pts.append((v['last'], v['P'][v['last']], f"{v['P'][v['last']]:,}" + ('' if v['last'] >= last else f"(날 {v['last']})"), s['c']))
deco(ax, '① 세계 인구 — 시드 1020(겨울 12 ~ 2월 띠 · 점선 = 해 바뀜)', '사람(명)'); ax.legend(loc='upper left', frameon=False, fontsize=9); endlabels(ax, pts)
ax = axs[1]
pts = []
for a in ORDER:
    v = D[a]; s = ST[a]; cu = cum(v['FI'], v['days'])
    ax.plot(v['days'], cu, color=s['c'], ls=s['ls'], lw=s['lw'], label=s['lab'], zorder=3)
    pts.append((v['last'], cu[-1], f"{cu[-1]:,}" + ('' if v['last'] >= last else f"(날 {v['last']})"), s['c']))
deco(ax, '② 굶어 죽음 누계', '누계(명)'); ax.legend(loc='upper left', frameon=False, fontsize=9); endlabels(ax, pts)
ax = axs[2]
for a in [x for x in ORDER if x != 'CFA']:
    v = D[a]; s = ST[a]
    ax.plot(v['days'], [v['TL'].get(d, 0) for d in v['days']], color=s['c'], ls=s['ls'], lw=s['lw'] * 0.75, label=s['lab'], zorder=3)
deco(ax, '③ 도구 몫 0.5 밑 마을 수(곳간 도구 ÷ 도구 쓰는 일꾼 — 맨손 0.25×)', '마을(곳)'); ax.set_ylim(0, ax.get_ylim()[1] * 1.35); ax.legend(loc='upper right', frameon=False, fontsize=9, ncol=4)
ax.set_xlabel('날(날 0 = 1년 3월 1일)', color=INK2, fontsize=9.5)
ax = axs[3]; ax.set_facecolor(SURF); seeds = ['1020', '7', '42']; arms4 = [a for a in ('A', 'FXA', 'BKA', 'BFA') if a in M]; W = 0.8 / max(1, len(arms4))
for j, a in enumerate(arms4):
    xs, ys, ls_ = [], [], []
    for i, s in enumerate(seeds):
        e = M[a]['seeds'].get(s)
        if not e: continue
        o = load(e, s)
        if o['last'] < 729: continue
        xs.append(i + (j - (len(arms4) - 1) / 2) * W); ys.append(csum(o['FI'], 365, 729)); ls_.append(o['last'])
    st = ST[a]
    if st['fix']: ax.bar(xs, ys, W * 0.86, color=st['c'], edgecolor=SURF, lw=2, label=st['lab'], zorder=3)
    else: ax.bar(xs, ys, W * 0.86, color=SURF, edgecolor=st['c'], hatch='///', lw=1.4, label=st['lab'], zorder=3)
    for x, y in zip(xs, ys): ax.annotate(f'{y:,}', (x, y), xytext=(0, 3), textcoords='offset points', ha='center', fontsize=8.5, color=INK2)
ax.set_xticks(range(3)); ax.set_xticklabels([f'시드 {s}' for s in seeds]); ax.set_xlim(-0.55, 2.55); ax.grid(axis='y', color=GRID, lw=0.6)
for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
for sp in ('left', 'bottom'): ax.spines[sp].set_color('#b9b8b2')
ax.tick_params(colors=INK2, labelsize=9); ax.set_ylabel('명', color=INK2, fontsize=9.5)
ax.set_title('④ 2년째 굶어 죽음(날 365 ~ 729) — 세 시드 · 빗금 = 고침 끔 · 칠 = 고침 켬', loc='left', fontsize=11.5, color=INK, pad=6); ax.legend(loc='upper right', frameon=False, fontsize=9, ncol=2)
ax.set_ylim(0, ax.get_ylim()[1] * 1.3)
fig.suptitle('T1363 — 굶주림 ↔ 도구 나선 · 기근 블록이 도구 바닥에서 석공 · 돌 일을 남긴다(ⓐ 켬 기본 세계)', x=0.02, ha='left', fontsize=12.5, color=INK, y=0.925)
fig.savefig(OUT, dpi=130, facecolor=SURF, bbox_inches='tight'); print('saved', OUT)
