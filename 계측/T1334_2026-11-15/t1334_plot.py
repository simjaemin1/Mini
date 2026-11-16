#!/usr/bin/env python3
# T1334 그림 — 두 해 판(800날) · 세 시드 합 — 계측 훅(`sbc-<시드>.json.t1275.json` 날 줄 · `.t1334.json` 아이 날 줄)과 굶어 죽음 누계(`sbc-<시드>.fd-deaths.json`)만 읽는다 · 세계 0
#   열 = 세계(묶음 + T1283 · v2 만 + T1283 · 끔 세계) · 줄 = 인구(마을 명부 합) · 굶어 죽음 누계 · 산 아이(판에서 난 사람 중 그날 명부에 산 사람)
#   선 = 끔(기준선 · 회색 점선 — 견줄 자리라 일부러 회색) · 전부 + 가을 문 `mig`(이주 문만 · 주홍 굵은 실선 — 권고 줄) · 전부 + 가을 문 `1`(출생 + 이주 · 초록 점쇄선)
#   ⚠색만으로 가르지 않는다(선 꼴이 둘째 표지 · 끝 값 글자) · 두 색(주홍 · 초록)은 dataviz 검증기 여섯 검사 통과(색약 ΔE 11.0 · 정상 25.8)
#   옅은 띠 = 가을(9 ~ 11월 · 날 184 ~ 274 · 549 ~ 639) · 가는 세로줄 = 해 바뀜(날 365 · 730 = 3월 1일)
# 실행: python3 t1334_plot.py <판 지도 JSON> <출력 폴더>   (판 지도 = t1334_table.py 와 같은 꼴 · 세 시드가 다 있는 팔만 그린다)
import json, sys, os, collections
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.transforms import offset_copy
MAP = json.load(open(sys.argv[1]))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
p = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if os.path.exists(p): fm.fontManager.addfont(p)
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
SEEDS = ['1020', '7', '42']
VAR = [('base', '끔(기준선)', '#6B7280', ':', 1.5), ('kam', '전부 + 가을 문 mig(이주 문만 · 권고)', '#D55E00', '-', 2.4), ('ka', '전부 + 가을 문 1(출생 + 이주)', '#009E73', '-.', 1.9)]
WORLDS = [('묶음(나무꾼 몸 + v2) + T1283', {'base': 'off', 'kam': 'BKAM', 'ka': 'BKA'}),
          ('v2 만 + T1283', {'base': 'off', 'kam': 'VKAM', 'ka': 'VKA'}),
          ('끔 세계', {'base': 'off', 'kam': 'OKAM', 'ka': 'OKA'})]
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
def arm(a):   # 세 시드 합 — 한 시드라도 없으면 None
    e = (MAP.get(a) or {}).get('seeds') or {}
    if not all(s in e and e[s].get('dir') for s in SEEDS): return None
    pop = collections.Counter(); fdd = collections.Counter(); kid = collections.Counter()
    for s in SEEDS:
        d = e[s]['dir']
        for q in json.load(open(os.path.join(d, f'sbc-{s}.json.t1275.json')))['days']: pop[q[0]] += q[1]
        last = 0; rows = {r[0]: r[1] for r in json.load(open(os.path.join(d, f'sbc-{s}.fd-deaths.json')))['rows']}
        for day in range(0, max(rows) + 1): last = rows.get(day, last); fdd[day] += last
        try:
            h = json.load(open(os.path.join(d, f'sbc-{s}.json.t1334.json'))); c = {k: i for i, k in enumerate(h['cols'])}
            for q in h['rows']: kid[q[c['day']]] += q[c['bornAlive']]
        except Exception: pass
    ks = sorted(kid)
    return {'pop': (sorted(pop), [pop[x] for x in sorted(pop)]), 'fd': (sorted(fdd), [fdd[x] for x in sorted(fdd)]), 'kid': (ks, [kid[x] for x in ks])}
ROWS = [('pop', '인구(3시드 · 51마을 명부 합 · 명)'), ('fd', '굶어 죽음 누계(3시드 합 · 명)'), ('kid', '산 아이(판에서 난 사람 · 명)')]
cache = {}
fig, axes = plt.subplots(len(ROWS), len(WORLDS), figsize=(15.5, 11.5), sharex=True)
XMAX = 1
for ci, (wname, vm) in enumerate(WORLDS):
    for ri, (key, lab) in enumerate(ROWS):
        ax = axes[ri][ci]; style(ax); ends = []
        for x0, x1 in ((184, 274), (549, 639)): ax.axvspan(x0, x1, color='#F3F4F6', zorder=0)
        for xb in (365, 730): ax.axvline(xb, color='#D1D5DB', linewidth=0.8, zorder=0)
        for k, name, col, ls, lw in VAR:
            a = vm.get(k)
            if a not in cache: cache[a] = arm(a) if a else None
            d = cache[a] and cache[a].get(key)
            if not d or not d[0]: continue
            XMAX = max(XMAX, d[0][-1])
            ax.plot(d[0], d[1], color=col, linestyle=ls, linewidth=lw)
            ax.plot([d[0][-1]], [d[1][-1]], 'o', color=col, markersize=4.5)
            ends.append([d[1][-1], d[0][-1], d[1][-1]])
        if ri == 0:
            lo, hi = ax.get_ylim()
            for xa in (229, 594):
                if xa < XMAX: ax.text(xa, lo + 0.02 * (hi - lo), '가을', fontsize=8, color=INK2, ha='center')
        if ends:
            lo, hi = ax.get_ylim(); gap = 0.05 * (hi - lo); ends.sort()
            for i in range(1, len(ends)):
                if ends[i][0] - ends[i - 1][0] < gap: ends[i][0] = ends[i - 1][0] + gap
            tr = offset_copy(ax.transData, fig=fig, x=5, y=0, units='points')
            for yl, xe, ye in ends: ax.text(xe, yl, f'{ye:,.0f}', transform=tr, fontsize=7.5, color=INK2, va='center')
        if ri == 0: ax.set_title(wname, fontsize=12, color=INK)
        if ci == 0: ax.set_ylabel(lab, fontsize=10, color=INK2)
        if ri == len(ROWS) - 1: ax.set_xlabel('게임 날(0 = 1년 3월 1일 · 365 = 2년 3월 1일 · 730 = 3년 3월 1일 · 판은 가상 시계)', fontsize=9, color=INK2)
for row in axes:
    for ax in row: ax.set_xlim(0, XMAX * 1.07)
handles = [plt.Line2D([0], [0], color=col, linestyle=ls, linewidth=lw) for _, _, col, ls, lw in VAR]
fig.legend(handles, [name for _, name, _, _, _ in VAR], loc='upper center', ncol=3, frameon=False, fontsize=9.5, bbox_to_anchor=(0.5, 0.968))
fig.suptitle(f'T1334 두 해 판 — 묶음 손잡이(T1334_BUNDLE) · {XMAX}날 · 시드 1020 · 7 · 42 합', fontsize=13, color=INK, y=0.995)
fig.tight_layout(rect=[0, 0, 1, 0.945])
fn = os.path.join(OUT, 'T1334_01_두해판.png'); fig.savefig(fn, dpi=150); print('→', fn, {a: bool(v) for a, v in cache.items()})
