#!/usr/bin/env python3
# T1405 그림 — 시드 1020: ① 떠난 사람(30날마다) ② 0.25 밑 마을-날(30날마다) ③ 가장 큰 마을 사람(30날 칸 최대 · 200 선) · ④ 세 시드 두 해 떠난 사람(무리별)
#   python3 t1405_plot.py <t1405_diag.py --out JSON …> <out.png>
#   색 = 팔(검증 팔레트 1 ~ 4번 — ㉠ + ㉡ 파랑 · ㉡ 만 주황 · ㉠ + ㉡ + ㉣ 청록 · 반사실 노랑) · 끔 = 회색 점선 · 선 끝마다 값 글(대비 경고 — 글이 짐을 진다)
#   ④ 막대: 칠 = 큰 마을 붐빔(B ≥ E) · 빗금 = 굶주림 기억(E > B · 크기 무관) — 색은 팔 그대로
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
A = sys.argv[1:]; OUT = A[-1]; FILES = A[:-1]
runs = {}
for f in FILES:
    for r in json.load(open(f)): runs[(r['arm'], str(r['seed']))] = r
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['hatch.linewidth'] = 1.1
SURF, INK, INK2, GRID, GRAY = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df', '#8a8984'
ST = {'OFF': dict(c=GRAY, ls=(0, (5, 3)), lw=1.7, lab='끔(지금 main)'),
      'RB': dict(c='#2a78d6', ls='-', lw=2.4, lab='㉠ 받는 쪽 문 + ㉡ 출생 곡선'),
      'B': dict(c='#eb6834', ls='-', lw=1.8, lab='㉡ 출생 곡선만'),
      'RBX': dict(c='#1baf7a', ls=(0, (6, 2, 1, 2)), lw=2.0, lab='㉠ + ㉡ + ㉣ T1394 고침'),
      'RBS': dict(c='#eda100', ls=(0, (2, 1.5)), lw=2.0, lab='㉠ + ㉡ + 반사실 S 위 끝 1')}
SHORT = {'OFF': '끔', 'RB': '㉠ + ㉡', 'RBX': '㉠ + ㉡ + ㉣', 'RBS': '반사실'}
ARMS = [a for a in ('OFF', 'RB', 'RBX', 'RBS') if (a, '1020') in runs]   # ㉡ 만(B)은 1년째가 ㉠ + ㉡ 과 같은 판이라(겹침) 그림에서 뺀다 — 표에 있다
last = max(runs[(a, '1020')]['last'] for a in ARMS)
fig = plt.figure(figsize=(11, 15.5), facecolor=SURF)
gs = fig.add_gridspec(4, 1, height_ratios=[1, 1, 1, 0.95], hspace=0.55, top=0.955, bottom=0.04)
axs = [fig.add_subplot(gs[i]) for i in range(4)]
def deco(ax, title, ylab, xmax=None):
    ax.set_facecolor(SURF); xm = xmax or last
    for y0 in (275, 640, 1005, 1370):
        if y0 < xm: ax.axvspan(y0, min(y0 + 89, xm), color='#eef3fb', lw=0, zorder=0)
    for yb in (365, 730, 1095):
        if yb < xm: ax.axvline(yb, color=INK2, lw=0.7, ls=':', zorder=1)
    ax.set_xlim(0, xm * 1.08); ax.grid(axis='y', color=GRID, lw=0.6); ax.tick_params(colors=INK2, labelsize=9)
    for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
    for sp in ('left', 'bottom'): ax.spines[sp].set_color('#b9b8b2')
    ax.set_title(title, loc='left', fontsize=11.5, color=INK, pad=6); ax.set_ylabel(ylab, color=INK2, fontsize=9.5)
    ax.set_xlabel('날(겨울 12 ~ 2월 띠 · 점선 = 해 바뀜)', color=INK2, fontsize=9)
def endlabels(ax, pts):
    pts = sorted(pts, key=lambda t: t[1]); ys = []
    lo, hi = ax.get_ylim(); gap = (hi - lo) * 0.06
    for x, y, txt, c in pts:
        yy = y if not ys or y - ys[-1] >= gap else ys[-1] + gap
        ys.append(yy)
        ax.annotate(txt, (x, y), xytext=(x + last * 0.012, yy), textcoords='data', color=INK2, fontsize=8.5, va='center',
                    arrowprops=dict(arrowstyle='-', color=c, lw=1.2, shrinkA=0, shrinkB=0))
def series(a, k):
    s = runs[(a, '1020')]['series']; L = runs[(a, '1020')]['last']
    xs = [min(b['d0'] + 15, L) for b in s]; ys = [b[k] if b[k] is not None else float('nan') for b in s]
    return xs, ys, L
for ax, k, title, ylab, agg in ((axs[0], 'emig', '① 떠난 사람 — 30날마다 · 시드 1020(끔은 날 1,270 에서 전쟁 행군이 판을 기어가게 해 세움)', '사람(명)', 'sum'),
                                (axs[1], 'u25', '② 행복 0.25 밑 마을-날 — 30날마다 · 시드 1020', '마을-날', 'sum'),
                                (axs[2], 'maxN', '③ 가장 큰 마을 사람 — 30날 칸 안 최대 · 시드 1020(가는 선 = 200명)', '사람(명)', 'max')):
    pts = []
    for a in ARMS:
        xs, ys, L = series(a, k); s = ST[a]
        ax.plot(xs, ys, color=s['c'], ls=s['ls'], lw=s['lw'], label=s['lab'], zorder=3, drawstyle='default')
        tot = sum(y for y in ys if y == y) if agg == 'sum' else max(y for y in ys if y == y)
        pts.append((xs[-1], ys[-1], (f'합 {tot:,}' if agg == 'sum' else f'최대 {tot:,}') + ('' if L >= last else f'(날 {L:,})'), s['c']))
    if k == 'maxN': ax.axhline(200, color=INK, lw=0.8, zorder=2)
    deco(ax, title, ylab); ax.legend(loc='upper left', frameon=False, fontsize=8.8, ncol=2); endlabels(ax, pts)
# ④ 세 시드 두 해 — 팔마다 붐빔(칠) · 굶주림 기억(빗금)
ax = axs[3]; ax.set_facecolor(SURF)
B4 = [a for a in ('OFF', 'RB', 'RBX') if all((a, s) in runs for s in ('7', '42', '1020'))]
X = []; xt = []; i = 0
for a in B4:
    for y in (1, 2):
        b = e = 0
        for s in ('7', '42', '1020'):
            g = runs[(a, s)]['years'].get(str(y), {}).get('groups', {})
            b += sum(v for kk, v in g.items() if kk.endswith('|B')); e += sum(v for kk, v in g.items() if kk.endswith('|E'))
        c = ST[a]['c']
        ax.bar(i - 0.18, b, 0.34, color=c, edgecolor=SURF, lw=2, zorder=3)
        ax.bar(i + 0.18, e, 0.34, color=SURF, edgecolor=c, hatch='///', lw=1.2, zorder=3)
        for xx, v in ((i - 0.18, b), (i + 0.18, e)): ax.annotate(f'{v:,}', (xx, v), xytext=(0, 3), textcoords='offset points', ha='center', fontsize=8.5, color=INK2)
        xt.append((i, f"{SHORT[a]}\n{y}년째")); i += 1
    i += 0.5
ax.set_xticks([t for t, _ in xt]); ax.set_xticklabels([l for _, l in xt], fontsize=8.5, color=INK2)
ax.grid(axis='y', color=GRID, lw=0.6); ax.tick_params(colors=INK2, labelsize=9)
for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
for sp in ('left', 'bottom'): ax.spines[sp].set_color('#b9b8b2')
ax.set_title('④ 세 시드(7 · 42 · 1020) 해마다 떠난 사람 — 칠 = 붐빔(부담 B ≥ 굶주림 기억 E) · 빗금 = 굶주림 기억(E > B)', loc='left', fontsize=11.5, color=INK, pad=6)
ax.set_ylabel('사람(명)', color=INK2, fontsize=9.5)
fig.suptitle('T1405 떠나는 주민 — 누가 왜 떠나나 · 고침 팔', x=0.06, ha='left', fontsize=14, color=INK, y=0.99)
fig.savefig(OUT, dpi=110, facecolor=SURF, bbox_inches='tight')
print('wrote', OUT)
