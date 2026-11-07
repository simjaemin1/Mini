#!/usr/bin/env python3
# T1213 그림 — 판 JSON(scripts/t1213-sbc-table.js 가 쓴 t1213-sbc400.json)만 읽는다 · 세계 0
#   시드마다(열) 영토 · 인구 · 나무꾼 · 재료 막힘(누적 %) — 끔 ↔ 켬(T1207+T1213) ↔ 켬 · T1213 끔 · 땅 비축 앞(변형) · 켬 + T659(시드 1020 만)
# 실행: python3 계측/T1213_2026-11-07/t1213_plot.py <출력 폴더>
import json, sys, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE
os.makedirs(OUT, exist_ok=True)
p = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if os.path.exists(p): fm.fontManager.addfont(p)
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
# Okabe–Ito(색약 안전 · 고정 차례): 끔 = 파랑 · 켬 = 주황 · 켬(T1213 끔) = 회색 점선
STY = {'off': ('#0072B2', '-', '끔(지금)'), 'on': ('#D55E00', '-', '켬(T1207 + T1213)'), 'on0': ('#6B7280', '--', '켬 · T1213 끔(T1207 만)'),
       'onB': ('#009E73', ':', '켬 · 땅 비축 앞(변형)'), 'on659': ('#CC79A7', '-.', '켬 + T659 흐름 닻')}
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=8.5)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)

#   끝 값 글자 — 같은 칸의 글자끼리 9 pt 넘게 떨어지게 위아래로 민다(점은 그 자리 · 글자만 · 색 = 그 줄 색 대신 잉크 — 글자는 잉크 · 색은 점이 진다)
def dodge(ax, ends, gap=9.0):
    if not ends: return
    ax.figure.canvas.draw()
    tr = ax.transData
    pts = sorted([(tr.transform((x, y))[1], x, y, t, c) for x, y, t, c in ends], key=lambda q: q[0])
    pos = []
    for py, x, y, t, c in pts:
        q = py if not pos or py - pos[-1] >= gap * ax.figure.dpi / 72 else pos[-1] + gap * ax.figure.dpi / 72
        pos.append(q)
    for (py, x, y, t, c), q in zip(pts, pos):
        ax.annotate(t, (x, y), textcoords='offset points', xytext=(5, (q - py) * 72 / ax.figure.dpi), va='center', fontsize=7.5, color=INK)
J = json.load(open(os.path.join(HERE, 't1213-sbc400.json')))
seeds = ['1020', '7', '42']
ROWS = [('terr', '영토(셀 · 51마을 합)'), ('pop', '인구(51마을 합)'), ('lj', '나무꾼(51마을 합)'), ('stall', '재료 막힘(넓히려 한 날 중 · 누적 %)')]
fig, axs = plt.subplots(len(ROWS), 3, figsize=(11.5, 10.5), sharex=True)
for j, s in enumerate(seeds):
    for i, (key, lab) in enumerate(ROWS):
        ax = axs[i][j]; style(ax)
        ends = []
        for arm in ['off', 'on0', 'onB', 'on659', 'on']:
            r = J['seeds'][s].get(arm)
            if not r: continue
            if key == 'stall' and arm == 'off': continue
            col, ls, name = STY[arm]
            xs = [q['day'] for q in r['snaps']]
            if key == 'stall':
                ys = [(100.0 * q['t']['stallWood'] / q['t']['days']) if (q.get('t') and q['t'].get('days')) else None for q in r['snaps']]
                pts = [(x, y) for x, y in zip(xs, ys) if y is not None]
                if not pts: continue
                xs, ys = [a for a, _ in pts], [b for _, b in pts]
            else:
                ys = [q[key] for q in r['snaps']]
            ax.plot(xs, ys, color=col, linestyle=ls, linewidth=2, marker='o', markersize=3.5, label=name)
            ends.append((xs[-1], ys[-1], f"{ys[-1]:,.0f}" if key != 'stall' else f"{ys[-1]:.1f}%", col))
        dodge(ax, ends)
        if i == 0: ax.set_title(f'시드 {s}', fontsize=11, color=INK)
        if j == 0: ax.set_ylabel(lab, fontsize=8.5, color=INK2)
        if i == len(ROWS) - 1: ax.set_xlabel('날', fontsize=9, color=INK2)
        if key == 'stall': ax.set_ylim(85, 100)
        ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f'{int(v):,}'))
axs[0][0].legend(frameon=False, fontsize=8.5, loc='best')
S = J['sum']
fig.suptitle(f"T1213 — main 기준선 판 자(가상 시계 · 400날) · 끝 날 인구 {S['off']['pop']:,} → {S['on']['pop']:,}(비 {S['popRatio']}) · 빈 마을 {S['off']['empty']} → {S['on']['empty']} · 재료 막힘 {S['on']['stallPct']}%",
             fontsize=11, color=INK, x=0.01, ha='left')
fig.text(0.01, 0.005, '50날마다 계측 훅(읽기만) · 켬 · T1213 끔 / 땅 비축 앞 / T659 판은 시드 1020 하나 · 끔 판 = main 기준선 11-07 견주기(같음 3/3) · 재료 막힘 축은 85% 부터', fontsize=8, color=INK2)
fig.tight_layout(rect=(0, 0.015, 1, 0.965))
fig.savefig(os.path.join(OUT, 'T1213_01_게이트400.png'), dpi=150); plt.close(fig)

# ── 그림 2 — 비축 벽: 마을 · 50날 줄의 1인당 곳간 통나무가 어느 칸에 있나(100% 막대 · 칸 넷은 차례가 있는 크기라 한 색의 밝기 차례) ──
#   0(곳간 빔) · 0 ~ 1.5(값의 닻 = 생존 0.05 × 30날 밑) · 1.5 ~ 5(닻 위 · 비축 밑) · 5 위(1인 5 비축 위 — 비축 뒤 쓰임(땅 · 숯가마 · 다리)이 쓸 수 있는 줄)
BINS = [('곳간 빔(0)', lambda x: x == 0), ('0 ~ 1.5(값의 닻 밑)', lambda x: 0 < x <= 1.5), ('1.5 ~ 5(닻 위 · 비축 밑)', lambda x: 1.5 < x <= 5), ('5 위(비축 위)', lambda x: x > 5)]
RAMP = ['#DCE9F5', '#9DC3E6', '#4A8CC7', '#0B4F8A']
TXT = [INK, INK, '#FFFFFF', '#FFFFFF']
ARMS2 = [('off', ['1020', '7', '42'], '끔(3시드)'), ('on', ['1020', '7', '42'], '켬 T1207 + T1213(3시드)'), ('on0', ['1020'], '켬 · T1213 끔(시드 1020)'),
         ('onB', ['1020'], '땅 비축 앞 변형(시드 1020)'), ('on659', ['1020'], '켬 + T659 흐름 닻(시드 1020)')]
rows2 = []
for arm, ss, lab in ARMS2:
    v = []
    for s in ss:
        r = J['seeds'][s].get(arm)
        if r and r.get('wall') and r['wall'].get('perCap'): v += r['wall']['perCap']
    if v: rows2.append((lab, [100.0 * sum(1 for x in v if f(x)) / len(v) for _, f in BINS], len(v)))
fig, ax = plt.subplots(figsize=(11.5, 0.6 * len(rows2) + 1.5))
style(ax); ax.grid(False); ax.grid(True, axis='x', color=GRID, linewidth=0.8)
for i, (lab, sh, n) in enumerate(rows2):
    y = len(rows2) - 1 - i; left = 0.0
    for j, w in enumerate(sh):
        ax.barh(y, w, left=left, height=0.62, color=RAMP[j], edgecolor='#FFFFFF', linewidth=2)
        if w >= 4: ax.text(left + w / 2, y, f'{w:.0f}%', ha='center', va='center', fontsize=8.5, color=TXT[j])
        left += w
    ax.text(100.8, y, f'비축 위 {sh[3]:.1f}% · 닻 위 {sh[2] + sh[3]:.1f}%  (줄 {n:,})', va='center', fontsize=8, color=INK)
ax.set_yticks(range(len(rows2))); ax.set_yticklabels([r[0] for r in rows2][::-1], fontsize=9, color=INK)
ax.set_xlim(0, 135); ax.set_xticks([0, 25, 50, 75, 100]); ax.set_xticklabels(['0', '25', '50', '75', '100%']); ax.spines['bottom'].set_bounds(0, 100)
ax.set_xlabel('마을 · 50날 줄 중 몫(인구 > 0 줄)', fontsize=9, color=INK2)
from matplotlib.patches import Patch
ax.legend(handles=[Patch(color=RAMP[j], label=BINS[j][0]) for j in range(4)], frameon=False, fontsize=8.5, ncol=4, loc='lower left', bbox_to_anchor=(0, 1.0))
fig.suptitle('T1213 — 1인당 곳간 통나무: 땅(말뚝)이 쓰는 잉여는 "5 위" 줄에만 있다', fontsize=11, color=INK, x=0.01, ha='left')
fig.text(0.01, 0.01, '값의 닻 1.5 = 생존 0.05/인·날 × 30날(v2 목표의 생존 항) · 비축 5 = RESERVE_PC.wood · 400날 판 50날마다 계측 훅(읽기만)', fontsize=7.5, color=INK2)
fig.tight_layout(rect=(0, 0.04, 1, 0.95))
fig.savefig(os.path.join(OUT, 'T1213_02_비축벽.png'), dpi=150); plt.close(fig)

# ── 그림 3 — 값 천장: 시드 1020 마을 · 50날 줄의 통나무 값(누적 분포 · 로그 축) — 켬 · T1213 끔 ↔ 켬 ──
#   직업 고르기는 값을 w = clamp(값, 0.05, 200) 로 자른다(정본 `pickDeficitJob_rational` · `autoSwitchJob`) — 200 오른쪽 줄은 값이 올라도 나무꾼 한계가치가 그대로다.
PJ = os.path.join(HERE, 't1213-picker.json')
if os.path.exists(PJ):
    P = json.load(open(PJ)); WMAX = P.get('wMax', 200)
    fig, ax = plt.subplots(figsize=(9.5, 4.6)); style(ax)
    for arm in ['on0', 'on']:
        v = sorted(P['prices'].get(arm, []))
        if not v: continue
        col, ls, name = STY[arm]; n = len(v)
        ys = [100.0 * (i + 1) / n for i in range(n)]
        ax.step(v, ys, where='post', color=col, linestyle=ls, linewidth=2, label=name)
        q = P['sum'][arm]
        ax.annotate(f"천장 위 {q['woodCeil']}% · 중앙 {q['medP']:,.0f}", (WMAX, 100 - q['woodCeil']), textcoords='offset points', xytext=(-8, 10 if arm == 'on' else -14), ha='right', fontsize=8, color=INK)
    ax.axvline(WMAX, color=INK2, linewidth=1.2, linestyle=(0, (4, 3)))
    ax.text(WMAX * 1.06, 4, '직업 고르기 가중치 천장 200', fontsize=8, color=INK2, va='bottom')
    ax.set_xscale('log'); ax.set_ylim(0, 100)
    ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f'{v:,.0f}' if v >= 1 else f'{v:g}'))
    ax.set_xlabel('통나무 값(마을 값표 캐시 `_priceCache` — 로그 축)', fontsize=9, color=INK2); ax.set_ylabel('마을 · 50날 줄 누적 %', fontsize=9, color=INK2)
    pr = P['pairs'].get('on_on0') or {}
    fig.suptitle(f"T1213 — 값은 올랐다(같은 마을 · 같은 날 짝 비 중앙 {pr.get('medRatio', '—')}) · 그런데 줄의 2/3 는 이미 가중치 천장 위", fontsize=11, color=INK, x=0.01, ha='left')
    ax.legend(frameon=False, fontsize=8.5, loc='upper left')
    fig.text(0.01, 0.01, f"시드 1020 · 400날 · 훅 2(칸 읽기만 — 판 여덟 수가 훅 없는 판과 같다) · 나무꾼 자리 {P['sum']['on']['cap']:,} 중 {P['sum']['on']['lj']:,}(자리는 남는다)", fontsize=7.5, color=INK2)
    fig.tight_layout(rect=(0, 0.04, 1, 0.94))
    fig.savefig(os.path.join(OUT, 'T1213_03_값천장.png'), dpi=150); plt.close(fig)
print('ok', OUT)
