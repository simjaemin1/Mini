#!/usr/bin/env python3
# T1452 판 그림 — 팔(끔 · 겪은 낙폭 · 앞날 장부 · 앞날 장부 값에만) × 세계(랩 800날 · 밭 세계 730날) · 시드 셋(1020 굵게 · 7 · 42 가늘게)
#   ① 굶어 죽음 누계 ② 사람 ③ 기근 문 안 마을-날 %(30날 칸 · 그날 판정이 쓴 버틸 날 > 곳간 날치 — 훅 nd · 끔 = 30) ④ 비상 마을-날 %(30날 칸 · 장부 판)
#   훅 칸: <tag>-<seed>.t1452.json(곳간 · 사람 · 장부) · <tag>-<seed>.t1437.json(100날 줄 · 굶어 죽음)
# 쓰는 법: python3 t1452_plot.py <out.png> <runs dir lab> <runs dir farm>
import json, os, sys, gzip, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.ticker import FuncFormatter

def _load(f):
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

OUT, LABD, FARMD = sys.argv[1], sys.argv[2], sys.argv[3]
for f in fm.findSystemFonts():
    if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
        fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
plt.rcParams['axes.unicode_minus'] = False
SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
ARMS = {   # 팔 이름: (랩 꼬리표, 밭 꼬리표, 색, 선, 이름)
    'off': ('LS', 'FS', '#8a8984', (0, (5, 3)), '끔'),
    'seen': ('Lseen', 'Fseen', '#eb6834', '-', '겪은 낙폭(T1437)'),
    'ahead': ('LA', 'FA', '#2a78d6', '-', '앞날 장부(문 다 읽음)'),
    'ref': ('LR', 'FR', '#1baf7a', '-', '앞날 장부 값에만'),
}
SEEDS = ('1020', '7', '42')

def find(d, tag, s, ext):
    for base in (os.path.join(d, f'{tag}-{s}{ext}'), os.path.join(d, f'{tag}-{s}', f'{tag}-{s}.json{ext}')):
        for g in (base, base + '.gz'):
            if os.path.exists(g): return g
    return None

def cumdead(d37):
    L = d37['last']; c = [0] * (L + 2)
    for v in d37['vil']:
        for i, x in enumerate(v['fd']):
            day = v.get('d0', 0) + i + 1
            if day <= L: c[day] += x or 0
    acc, out = 0, []
    for day in range(1, L + 1): acc += c[day]; out.append(acc)
    return out

def pop(d52):
    L = d52['last']; p = [0] * L
    for v in d52['vil']:
        d0 = v.get('d0', 0)
        for i, n in enumerate(v['N']):
            if d0 + i < L: p[d0 + i] += n or 0
    return p

def bins(d52, fn, arm):   # 30날 칸 몫
    dfc = d52.get('dfc') or 1.0; B = {}
    for v in d52['vil']:
        d0 = v.get('d0', 0)
        for i in range(len(v['S'])):
            N = v['N'][i]
            if not N: continue
            r = fn(v, i, N, dfc, arm)
            if r is None: continue
            k = (d0 + i) // 30; b = B.setdefault(k, [0, 0]); b[1] += 1; b[0] += 1 if r else 0
    ks = sorted(B); return [k * 30 + 15 for k in ks], [100 * B[k][0] / max(1, B[k][1]) for k in ks]

def famine(v, i, N, dfc, arm):
    sd = (v['S'][i] or 0) / (N * dfc)
    if arm == 'off': return sd < 30
    a = v['ah'][i] if v.get('ah') and i < len(v['ah']) else None
    if arm in ('ahead',) and a and len(a) > 4 and a[4] is not None: return sd < a[4]
    nd = v['nd'][i] if i < len(v['nd']) else None
    if nd is not None: return sd < nd
    return None

def emerg(v, i, N, dfc, arm):
    a = v['ah'][i] if v.get('ah') and i < len(v['ah']) else None
    return None if not a else bool(a[3])

fig, axs = plt.subplots(4, 2, figsize=(13, 14.5), facecolor=SURF)
for col, (wn, D, ti) in enumerate((('랩(끔 세계) 800날', LABD, 0), ('밭 세계(T1421 판 조건 E) 730날', FARMD, 1))):
    for row in range(4):
        ax = axs[row][col]; ax.set_facecolor(SURF)
        ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
        for s_ in ('top', 'right'): ax.spines[s_].set_visible(False)
        for s_ in ('left', 'bottom'): ax.spines[s_].set_color(INK2)
        ax.tick_params(colors=INK2, labelsize=8.5)
        ax.axvline(365.5, color=INK2, lw=0.8, ls=':', zorder=1)
    for arm, (tl, tf, c, ls, nm) in ARMS.items():
        tag = (tl, tf)[ti]
        for s in SEEDS:
            f52 = find(D, tag, s, '.t1452.json'); f37 = find(D, tag, s, '.t1437.json')
            if not f52: continue
            d52 = _load(f52); thick = s == '1020'
            kw = dict(color=c, ls=ls, lw=2.2 if thick else 0.9, alpha=1.0 if thick else 0.55, label=nm if thick else None, zorder=3 if thick else 2)
            if f37:
                d37 = _load(f37); y = cumdead(d37); axs[0][col].plot(range(1, len(y) + 1), y, **kw)
            y = pop(d52); axs[1][col].plot(range(1, len(y) + 1), y, **kw)
            x, y = bins(d52, famine, arm); axs[2][col].plot(x, y, **kw)
            if arm != 'seen' or True:
                x, y = bins(d52, emerg, arm)
                if x: axs[3][col].plot(x, y, **kw)
    axs[0][col].set_title(f'{wn} — ① 굶어 죽음 누계', loc='left', fontsize=11.5, color=INK)
    axs[1][col].set_title('② 사람', loc='left', fontsize=11.5, color=INK)
    axs[2][col].set_title('③ 기근 문 안 마을-날 %(곳간 날치 < 그날 버틸 날 · 끔 = 30 · 30날 칸)', loc='left', fontsize=10.5, color=INK)
    axs[3][col].set_title('④ 비상 마을-날 %(지금 심어 골 앞에 못 거둠 · 장부 판 · 끔 = 재는 판)', loc='left', fontsize=10.5, color=INK)
    for r in range(4): axs[r][col].yaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{int(v):,}' if abs(v) >= 1000 else f'{v:g}'))
    axs[2][col].set_ylim(0, 100); axs[3][col].set_ylim(0, None)
    axs[3][col].set_xlabel('날', color=INK2, fontsize=9.5)
axs[0][0].legend(frameon=False, fontsize=9, loc='upper left')
fig.suptitle('T1452 — 앞날 장부(밭이 자라는 시간 · 지난해 같은 철 흐름 · 길 위 짐 · 썩음) ↔ 끔 · 겪은 낙폭 · 시드 셋(1020 굵게)', x=0.02, ha='left', fontsize=13.2, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.97))
fig.savefig(OUT, dpi=170, facecolor=SURF)
print(OUT)
