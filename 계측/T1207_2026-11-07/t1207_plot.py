#!/usr/bin/env python3
# T1207 그림 셋 — 판 JSON(scripts/t1207-sbc-table.js · scripts/t1207-terr-table.js 가 쓴 것)만 읽는다 · 세계 0
#   ① NPC 800날 — 시드마다 영토(셀) · 인구(끔 ↔ 켬)
#   ② 플레이어 마을 — 30 · 60 · 100명 영토까지 걸리는 날(둥글게 · 띠 폭 20 · 띠 폭 10 · 로그 축)
#   ③ 한 칸 값 배수 — 영토 1,500 에서 중심 거리 r ÷ R 에 따른 배수(α 10 · α 0)
# 실행: python3 계측/T1207_2026-11-07/t1207_plot.py <출력 폴더>
import json, sys, os, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE
os.makedirs(OUT, exist_ok=True)
for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']:
    if os.path.exists(p):
        fm.fontManager.addfont(p)
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'DejaVu Sans']   # 아래 첨자(S₀)는 DejaVu 가 낸다
plt.rcParams['axes.unicode_minus'] = False
# 색 — Okabe–Ito(색약 안전 · 고정 차례): 끔 = 파랑 · 켬 = 주황 · 참고 = 회색
C_OFF, C_ON, C_REF, C_3 = '#0072B2', '#D55E00', '#6B7280', '#009E73'
INK, INK2, GRID = '#1F2937', '#4B5563', '#E5E7EB'
def style(ax):
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    for s in ['left', 'bottom']: ax.spines[s].set_color('#9CA3AF')
    ax.tick_params(colors=INK2, labelsize=9)
    ax.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)

# ── ① NPC 800날 ─────────────────────────────────────────────────────────
sbc = json.load(open(os.path.join(HERE, 't1207-sbc800.json')))
seeds = ['1020', '7', '42']
fig, axs = plt.subplots(2, 3, figsize=(11, 6.2), sharex=True)
for j, s in enumerate(seeds):
    for i, (key, lab) in enumerate([('terr', '영토(셀 · 51마을 합)'), ('pop', '인구(51마을 합)')]):
        ax = axs[i][j]; style(ax)
        for arm, col, name in [('off', C_OFF, '끔(지금)'), ('on', C_ON, '켬(T1207)')]:
            r = sbc['seeds'][s][arm]
            if not r: continue
            xs = [0] + [p['day'] for p in r['snaps']]
            v0 = None
            ys = [p[key] for p in r['snaps']]
            ax.plot(xs[1:], ys, color=col, linewidth=2, marker='o', markersize=4, label=name)
            ax.annotate(f"{ys[-1]:,}", (xs[-1], ys[-1]), textcoords='offset points', xytext=(4, 0), va='center', fontsize=8, color=INK)
        if i == 0: ax.set_title(f'시드 {s}', fontsize=11, color=INK)
        if j == 0: ax.set_ylabel(lab, fontsize=9, color=INK2)
        if i == 1: ax.set_xlabel('날', fontsize=9, color=INK2)
        ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f'{int(v):,}'))
axs[0][0].legend(frameon=False, fontsize=9, loc='upper left')
sm = sbc['sum']
fig.suptitle(f"NPC 마을 800날 — 켬이면 영토가 첫 달 뒤 거의 멈춘다(재료 막힘 {sm['stallPct']}%) · 끝 날 인구 {sm['popOff']:,} → {sm['popOn']:,} · 빈 마을 {sm['emptyOff']} → {sm['emptyOn']}",
             fontsize=11.5, color=INK, x=0.01, ha='left')
fig.text(0.01, 0.005, '11-04c 판 자(손잡이 28개 =0 · T565_MAP_LIVE=1) · 3시드 × 800날 · 100날마다 계측 훅(읽기만)', fontsize=8, color=INK2)
fig.tight_layout(rect=(0, 0.02, 1, 0.95))
fig.savefig(os.path.join(OUT, 'T1207_01_NPC800.png'), dpi=150); plt.close(fig)

# ── ② 플레이어 마을 — 날 ────────────────────────────────────────────────
tb = json.load(open(os.path.join(HERE, 't1207-terr-table.json')))
card = tb['arms']['card']
pops = tb['src']['pops']
rows = [('둥글게', card['round'], C_OFF), ('칠레형 띠 폭 20', card['strip']['20'], C_3), ('칠레형 띠 폭 10', card['strip']['10'], C_ON)]
fig, ax = plt.subplots(figsize=(8.6, 4.6)); style(ax)
w = 0.26
for k, (lab, rr, col) in enumerate(rows):
    xs = [i + (k - 1) * w for i in range(len(pops))]
    ys = [r['days'] for r in rr]
    ax.bar(xs, ys, width=w - 0.03, color=col, label=lab)
    for x, y in zip(xs, ys): ax.annotate(f'{y:,.1f}' if y < 100 else f'{y:,.0f}', (x, y), textcoords='offset points', xytext=(0, 3), ha='center', fontsize=8, color=INK)
ax.set_yscale('log')
ax.set_xticks(range(len(pops)))
ax.set_xticklabels([f"{p}명 · 영토 {t:,}칸" for p, t in zip(pops, tb['src']['targets'])], fontsize=9, color=INK)
ax.set_ylabel('날(몸 하나 · 낮 1,008 게임 분 · 로그 축)', fontsize=9, color=INK2)
ax.legend(frameon=False, fontsize=9, loc='upper left')
r30 = card['round'][0]; s30 = card['strip']['10'][0]
ax.set_title(f"플레이어 마을(창설 49칸)이 한 칸씩 넓힐 때 — 둥글게 {r30['days']}날 · 띠 폭 10 은 ×{s30['labMin']/r30['labMin']:.0f}", fontsize=11, color=INK, loc='left')
fig.text(0.01, 0.01, f"개간 {tb['src']['clearMinPerM2']} 분/m²(드라베드) · 말뚝 {tb['src']['postSpacingM']} m 간격(송국리) · 기둥 = 통나무 {tb['src']['woodPerPost']:.0f} · k {tb['src']['k']} · α {tb['src']['alpha']} · S₀ {tb['src']['S0']:,}", fontsize=8, color=INK2)
fig.tight_layout(rect=(0, 0.03, 1, 1))
fig.savefig(os.path.join(OUT, 'T1207_02_플레이어_날.png'), dpi=150); plt.close(fig)

# ── ③ 한 칸 값 배수 ─────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7.6, 4.2)); style(ax)
xs = [1 + i * 0.02 for i in range(0, 301)]
for a, col, lab in [(10, C_ON, 'α 10(카드 첫 후보)'), (0, C_REF, 'α 0(참고 — 모양 벌점 없음)')]:
    ax.plot(xs, [1 + a * max(0, x - 1) ** 2 for x in xs], color=col, linewidth=2, label=lab)
for x, y in [(1, 1), (2, 11), (3, 41)]:
    ax.plot([x], [y], 'o', color=C_ON, markersize=6)
    ax.annotate(f'×{y}', (x, y), textcoords='offset points', xytext=(6, -2), fontsize=9, color=INK)
ax.set_xlabel('그 칸의 중심 거리 r ÷ 둥근 반지름 R', fontsize=9, color=INK2)
ax.set_ylabel('모양 배수(영토 크기 배수에 곱한다)', fontsize=9, color=INK2)
ax.legend(frameon=False, fontsize=9, loc='upper left')
ax.set_title('멀수록 비싸다 — 둥근 가장자리 ×1 · 촉수 끝 2R ×11 · 3R ×41', fontsize=11, color=INK, loc='left')
fig.tight_layout()
fig.savefig(os.path.join(OUT, 'T1207_03_모양배수.png'), dpi=150); plt.close(fig)
print('ok', OUT)
