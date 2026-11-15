#!/usr/bin/env python3
# T1319 그림(T1312 그림 그대로 · 선만 바꿈) — 계측 훅(`sbc-<시드>.json.t1275.json` 날 줄 · `.t1297.json` 마을-날 줄)과 굶어 죽음 누계(`sbc-<시드>.fd-deaths.json`)만 읽는다 · 세계 0
#   열 = 세계(끔 세계 · 묶음 + T1283 · v2 만 + T1283) · 줄 = 인구(3시드 합) · 곳간 식량 일치(사람 가중 · 3시드 · 10날 이동) · 굶어 죽음 누계(3시드 합)
#   선 = 끔(기준선 · 회색 점선) · T1312(T1297 + 이주 문 + 무리 셈 · 주황 실선) · + K 문(파랑 파선) · + K 문 + 가을 문 `1`(출생 + 이주 · 초록 점쇄선) · + K 문 + 가을 문 `mig`(이주 문만 · 주홍 굵은 실선 — 권고 줄)
#   (+ 가을 문만 `1` 줄은 + K 문 + 가을 문 `1` 과 묶음 · v2 만 1020 · 7 이 바이트 같아 그리지 않는다 — 표에 있다)
#   ⚠인구는 마을 명부 합(여덟 수 인구와 같은 자) — 길 위 사람(떠나 아직 안 닿은 몸)은 안 든다: 이주 문 판은 떠남이 무리로 와 하루 수백 명이 빠졌다 들어온다(톱니)
# 실행: python3 t1319_plot.py <판 지도 JSON> <출력 폴더>   (판 지도 = { "<팔>": {"1020": "<판 폴더>", …}, … } — 세 시드가 다 있는 팔만 그린다)
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
# Okabe–Ito(색약 안전 · 고정 차례) + 회색 — 같은 손잡이는 세 열에서 같은 색 · 같은 선(색만으로 가르지 않게 선 꼴이 둘째 표지)
VAR = [('base', '끔(기준선)', '#6B7280', ':', 1.5), ('herd', 'T1312(T1297 + 이주 문 + 무리 셈)', '#E69F00', '-', 1.6),
       ('k', 'T1312 + K 문', '#0072B2', '--', 1.7), ('ka', 'T1312 + K 문 + 가을 문 1(출생 + 이주)', '#009E73', '-.', 1.9), ('kam', 'T1312 + K 문 + 가을 문 mig(이주 문만)', '#D55E00', '-', 2.4)]
WORLDS = [('끔 세계', {'base': 'off', 'herd': 'offMH', 'k': 'offK', 'ka': 'offKA', 'kam': 'offKAM'}),
          ('묶음(나무꾼 몸 + v2) + T1283', {'base': 'off', 'herd': 'bundleMH', 'k': 'bundleK', 'ka': 'bundleKA', 'kam': 'bundleKAM'}),
          ('v2 만 + T1283', {'base': 'off', 'herd': 'v2MH', 'k': 'v2K', 'ka': 'v2KA', 'kam': 'v2KAM'})]
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
def arm(a):   # 세 시드 합(인구 · 굶어 죽음) · 사람 가중(곳간 일치) — 한 시드라도 없으면 None
    dirs = MAP.get(a) or {}
    if not all(s in dirs for s in SEEDS): return None
    pop = collections.Counter(); fdd = collections.Counter(); acc = collections.defaultdict(lambda: [0.0, 0])
    for s in SEEDS:
        d = dirs[s]
        for q in json.load(open(os.path.join(d, f'sbc-{s}.json.t1275.json')))['days']: pop[q[0]] += q[1]
        h = json.load(open(os.path.join(d, f'sbc-{s}.json.t1297.json'))); c = {k: i for i, k in enumerate(h['cols'])}
        for q in h['rows']:
            N = q[c['N']]; fd = q[c['foodDays']]
            if N and fd is not None: x = acc[q[c['day']]]; x[0] += fd * N; x[1] += N
        last = 0; rows = {r[0]: r[1] for r in json.load(open(os.path.join(d, f'sbc-{s}.fd-deaths.json')))['rows']}
        for day in range(0, 401):
            last = rows.get(day, last); fdd[day] += last
    days = sorted(pop); fdays = sorted(acc); raw = [acc[x][0] / acc[x][1] for x in fdays]
    food = [sum(raw[max(0, i - 9):i + 1]) / len(raw[max(0, i - 9):i + 1]) for i in range(len(raw))]
    return {'pop': (days, [pop[x] for x in days]), 'food': (fdays, food), 'fd': (sorted(fdd), [fdd[x] for x in sorted(fdd)])}
ROWS = [('pop', '인구(3시드 · 51마을 명부 합 · 명)'), ('food', '곳간 식량 일치(사람 가중 · 10날 이동 · 일)'), ('fd', '굶어 죽음 누계(3시드 합 · 명)')]
cache = {}
fig, axes = plt.subplots(len(ROWS), len(WORLDS), figsize=(15.5, 11.5), sharex=True)
for ci, (wname, vm) in enumerate(WORLDS):
    for ri, (key, lab) in enumerate(ROWS):
        ax = axes[ri][ci]; style(ax); ends = []
        for k, name, col, ls, lw in VAR:
            a = vm.get(k)
            if a not in cache: cache[a] = arm(a) if a else None
            d = cache[a] and cache[a].get(key)
            if not d or not d[0]: continue
            ax.plot(d[0], d[1], color=col, linestyle=ls, linewidth=lw)
            if key != 'food':
                ax.plot([d[0][-1]], [d[1][-1]], 'o', color=col, markersize=4.5)
                ends.append([d[1][-1], d[0][-1], d[1][-1]])
        if key == 'food':
            ax.axhline(30, color='#9CA3AF', linewidth=1, linestyle='--')
            ax.text(8, 30.6, '봄 · 여름 문턱 30일치(가을 문 켬 = 가을엔 다음 3월 1일까지 181 → 91일치)', fontsize=7.5, color=INK2, va='bottom')
            ax.axvspan(184, 274, color='#F3F4F6', zorder=0); ax.text(229, 2, '가을', fontsize=8, color=INK2, ha='center')
            ax.set_ylim(0, None)
        if ends:
            lo, hi = ax.get_ylim(); gap = 0.05 * (hi - lo); ends.sort()
            for i in range(1, len(ends)):
                if ends[i][0] - ends[i - 1][0] < gap: ends[i][0] = ends[i - 1][0] + gap
            tr = offset_copy(ax.transData, fig=fig, x=5, y=0, units='points')
            for yl, xe, ye in ends: ax.text(xe, yl, f'{ye:,.0f}', transform=tr, fontsize=7.5, color=INK2, va='center')
        if ri == 0: ax.set_title(wname, fontsize=12, color=INK)
        if ci == 0: ax.set_ylabel(lab, fontsize=10, color=INK2)
        if ri == len(ROWS) - 1: ax.set_xlabel('게임 날(판은 빠른 시계 · 가상 시계)', fontsize=9, color=INK2)
        ax.set_xlim(0, 425)
handles = [plt.Line2D([0], [0], color=col, linestyle=ls, linewidth=lw) for _, _, col, ls, lw in VAR]
fig.legend(handles, [name for _, name, _, _, _ in VAR], loc='upper center', ncol=5, frameon=False, fontsize=9.5, bbox_to_anchor=(0.5, 0.965))
fig.suptitle('T1319 받는 곳 문에 K · 가을에 겨울 끝까지 — 400날 · 시드 1020 · 7 · 42 합', fontsize=13, color=INK, y=0.995)
fig.tight_layout(rect=[0, 0, 1, 0.92])
fn = os.path.join(OUT, 'T1319_01_판400.png'); fig.savefig(fn, dpi=150); print('→', fn, {a: bool(v) for a, v in cache.items()})
