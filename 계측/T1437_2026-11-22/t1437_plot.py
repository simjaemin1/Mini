#!/usr/bin/env python3
# T1437 그림 — 랩 800날 세 시드(1020 굵게 · 7 · 42 가늘게) · 팔 넷(끔 회색 점선 · (가) 파랑 · 겪은 만큼 주홍 · 겪은 만큼(값의 기준에만) 청록)
#   ① 굶어 죽음 누계(날마다) ② 여유분 가운데(겪은 만큼 팔 · 날마다 · 가뭄 14 줄) ③ 기근 블록 안 마을-날 %(30날 칸 · 곳간 날치 < 버틸 날)
#   ④ 식량 날치 가운데(날마다) ⑤ 나무 값 가운데(100날 · 로그) ⑥ 사람(100날)
import json, os, sys, math
import gzip
def _load(f):   # 판 칸은 .json.gz 로 싣는다(레포 크기) — 날것 .json 도 읽는다
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.ticker import FuncFormatter
O = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs'); OUT = sys.argv[1] if len(sys.argv) > 1 else 'T1437_01_겪은만큼.png'
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
ST = {
    'off': dict(c='#8a8984', ls=(0, (5, 3)), lab='끔(지금 · 30날치)', pre='Loff-{s}'),
    'harv': dict(c='#2a78d6', ls='-', lab='(가) 버틸 날만(T1419)', pre='Lharv-{s}'),
    'seen': dict(c='#eb6834', ls='-', lab='(가) + 겪은 낙폭(이 카드)', pre='Lseen-{s}'),
    'ref': dict(c='#1baf7a', ls='-', lab='겪은 낙폭을 값의 기준에만(재는 팔)', pre='Lseen-{s}-T1437_BUF_AT-ref_'),
}
SEEDS = ('1020', '7', '42')
D = {}
for a, st in ST.items():
    for s in SEEDS:
        f = os.path.join(O, st['pre'].format(s=s) + '.t1437.json')
        for g in (f + '.gz', f):
            if os.path.exists(g): D[(a, s)] = _load(g); break
def q(a, p):
    a = [x for x in a if x is not None]
    if not a: return None
    s = sorted(a); return s[min(len(s) - 1, int(math.floor(p * len(s))))]
def daily(d, fn):   # 날마다 마을 값 → 가운데
    V = d['vil']; L = d['last']; out = []
    for day in range(1, L + 1):
        xs = []
        for v in V:
            i = day - v.get('d0', 1)
            if 0 <= i < len(v['S']):
                x = fn(v, i)
                if x is not None: xs.append(x)
        out.append(q(xs, .5))
    return out
def cumdead(d):
    L = d['last']; c = [0] * (L + 1)
    for v in d['vil']:
        for i, x in enumerate(v['fd']):
            day = v.get('d0', 1) + i
            if day <= L: c[day] += x or 0
    acc, out = 0, []
    for day in range(1, L + 1): acc += c[day]; out.append(acc)
    return out
def block(d, arm):   # 30날 칸 기근 블록 몫
    dfc = d.get('dfc') or 1.0; bins = {}
    for v in d['vil']:
        for i in range(len(v['S'])):
            N = v['N'][i]
            if not (N and N > 0): continue
            nd = 30 if arm == 'off' else v['nd'][i]
            if nd is None: continue
            if arm == 'ref' and v['bf'][i] is not None: nd = nd - v['bf'][i]   # 값의 기준에만 팔 — 기근 문은 (가)
            k = (v.get('d0', 1) + i - 1) // 30; b = bins.setdefault(k, [0, 0]); b[1] += 1
            if (v['S'][i] or 0) / (N * dfc) < nd: b[0] += 1
    ks = sorted(bins); return [k * 30 + 15 for k in ks], [100 * bins[k][0] / max(1, bins[k][1]) for k in ks]
fig, axs = plt.subplots(3, 2, figsize=(12.5, 13.5), facecolor=SURF)
axs = axs.flatten()
def deco(ax, title, unit, log=False):
    ax.set_facecolor(SURF); ax.set_title(title, loc='left', fontsize=12, color=INK, pad=9)
    ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    for s in ('left', 'bottom'): ax.spines[s].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=9); ax.set_xlabel('날', color=INK2, fontsize=9.5); ax.set_ylabel(unit, color=INK2, fontsize=9.5)
    ax.set_xlim(0, 820)
    if log: ax.set_yscale('log')
    else: ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{int(v):,}' if abs(v) >= 1000 else f'{v:g}'))
    ax.axvline(365.5, color=INK2, lw=0.8, ls=':', zorder=1)
def line(ax, a, s, xs, ys, lab=True):
    st = ST[a]; thick = s == '1020'
    ax.plot(xs, ys, color=st['c'], ls=st['ls'], lw=2.3 if thick else 0.9, alpha=1.0 if thick else 0.55, label=st['lab'] if (thick and lab) else None, zorder=3 if thick else 2)
# ①
ax = axs[0]; deco(ax, '① 굶어 죽음 누계(시드 셋 — 1020 굵게)', '명')
for (a, s), d in D.items(): ys = cumdead(d); line(ax, a, s, list(range(1, len(ys) + 1)), ys)
ax.legend(frameon=False, fontsize=8.8, loc='upper left')
# ②
ax = axs[1]; deco(ax, '② 여유분 가운데(겪은 낙폭 · 날치) — 첫 해 = 가뭄 14', '날')
for (a, s), d in D.items():
    if a not in ('seen', 'ref'): continue
    ys = daily(d, lambda v, i: v['bf'][i]); line(ax, a, s, list(range(1, len(ys) + 1)), ys)
ax.axhline(30, color='#8a8984', lw=1.2, ls=(0, (5, 3))); ax.annotate('끔 세계 30', (20, 30), xytext=(0, 4), textcoords='offset points', color=INK2, fontsize=8.8)
ax.set_ylim(0, None)
# ③
ax = axs[2]; deco(ax, '③ 기근 블록 안 마을-날 %(곳간 날치 < 버틸 날 · 30날 칸)', '%')
for (a, s), d in D.items(): xs, ys = block(d, a); line(ax, a, s, xs, ys)
ax.set_ylim(0, 100)
# ④
ax = axs[3]; deco(ax, '④ 식량 날치 가운데(곳간 ÷ 하루 먹을 것)', '날')
for (a, s), d in D.items():
    dfc = d.get('dfc') or 1.0
    ys = daily(d, lambda v, i: (v['S'][i] or 0) / (v['N'][i] * dfc) if v['N'][i] else None); line(ax, a, s, list(range(1, len(ys) + 1)), ys)
ax.set_ylim(0, None)
# ⑤
ax = axs[4]; deco(ax, '⑤ 나무 값 가운데(100날 · 로그)', '값', log=True)
for (a, s), d in D.items():
    m = d['marks']; line(ax, a, s, [x['day'] for x in m], [x['woodPx'] for x in m])
# ⑥
ax = axs[5]; deco(ax, '⑥ 사람(100날)', '명')
for (a, s), d in D.items():
    m = d['marks']; line(ax, a, s, [0] + [x['day'] for x in m], [None] + [x['pop'] for x in m])
ax.set_ylim(0, None)
fig.suptitle('T1437 — 여유분 = 겪은 만큼: 둘째 해 굶음은 멎되 첫 해(몫 14)는 못 막고 곳간이 끔 세계만큼 다시 찬다(랩 800날 · 세 시드)', x=0.02, ha='left', fontsize=13.5, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.965))
fig.savefig(OUT, dpi=200, facecolor=SURF)
print(OUT)
