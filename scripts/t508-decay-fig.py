#!/usr/bin/env python3
# === scripts/t508-decay-fig.py — T508 ① 두 곡선 그림 (계측기 · 러너 미등록) ===========================
#
# 재민 회부: "지수/유리 중 어느 꼴" — 그 판정 자료 한 장. 곡선은 **몸 정본에서** 나온다:
#   node scripts/t508-decay-table.js --json <j>   (server/body.js 의 tick·decayRate 를 꼴마다 다시 올려 적는다)
#   python3 scripts/t508-decay-fig.py <j> <png>
# 그림이 곡선을 다시 계산하지 않는다(사본 0) — JSON 을 그대로 그린다.
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

src, out = sys.argv[1], sys.argv[2]
J = json.load(open(src, encoding='utf-8'))
R = {r['form']: r for r in J['rows']}

for f in font_manager.findSystemFonts():
    if 'NotoSansCJK-Regular' in f or 'NotoSansCJK-Medium' in f:
        font_manager.fontManager.addfont(f)
plt.rcParams['font.family'] = ['Noto Sans CJK JP', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e6e5e1'
C_EXP, C_RAT, C_LIN = '#2a78d6', '#eb6834', '#8a8983'   # 지수 = 슬롯1 · 유리 = 슬롯2 · 종전 = 중립 회색(기준선)

fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.2, 4.9), dpi=170, facecolor=SURF)
for a in (a1, a2):
    a.set_facecolor(SURF)
    for s in ('top', 'right'): a.spines[s].set_visible(False)
    for s in ('left', 'bottom'): a.spines[s].set_color(GRID)
    a.tick_params(colors=INK2, labelsize=9)
    a.grid(True, color=GRID, lw=0.8)
    a.set_axisbelow(True)

# ① 허기 게이지 — 만복 → 공복(분)
def xs(n, step): return [i * step / 60 for i in range(n)]
L, E, Q = R['off'], R['1'], R['rat']
a1.plot(xs(len(L['curveH']), 30), L['curveH'], color=C_LIN, lw=2, ls=(0, (4, 3)), label='종전 — 두 토막 선형(끔)')
a1.plot(xs(len(E['curveH']), 30), E['curveH'], color=C_EXP, lw=2, label='지수 꼴 dx/dt = −k(x + b)')
a1.plot(xs(len(Q['curveH']), 30), Q['curveH'], color=C_RAT, lw=2, label='유리 꼴 x = 100(1 − τ)/(1 + τ)')
for (x, y) in [(0, 100), (16, 50), (48, 0)]:
    a1.plot([x], [y], 'o', ms=6, color=INK, mec=SURF, mew=2, zorder=5)
a1.annotate('세 곡선이 같이 지나는 매듭\n(0분,100) · (16분,50) · (48분,0)', xy=(16, 50), xytext=(20.5, 66),
            fontsize=8.5, color=INK2, arrowprops=dict(arrowstyle='-', color=INK2, lw=0.8))
#   지수·유리는 거의 겹친다(가장 벌어진 곳 0.9점(32분)) — 이름은 아래 범례와 ② 의 끝 이름표가 댄다 · 종전만 떨어져 있어 여기 적는다
a1.text(30.5, 29.5, '종전', color=C_LIN, fontsize=9.5, fontweight='bold')
a1.text(21.5, 21.0, '지수 · 유리', color=INK2, fontsize=9)
a1.set_xlim(0, 48); a1.set_ylim(0, 102)
a1.set_xticks([0, 8, 16, 24, 32, 40, 48])
a1.set_xlabel('만복에서 흐른 시간(실분 · 허기 · 갈증은 같은 꼴에 시간 절반)', color=INK2, fontsize=9)
a1.set_ylabel('허기 게이지', color=INK2, fontsize=9)
a1.set_title('① 게이지 — 총시간 48분 · ⅓ 지점 50 은 셋 다 같다', color=INK, fontsize=10.5, loc='left')

# ② 감쇠율 — 게이지가 찰수록 빨리 준다(분당 점)
g = list(range(101))
a2.plot(g, L['rateH'], color=C_LIN, lw=2, ls=(0, (4, 3)), drawstyle='steps-mid')
a2.plot(g, E['rateH'], color=C_EXP, lw=2)
a2.plot(g, Q['rateH'], color=C_RAT, lw=2)
a2.text(101, E['rateH'][100], f" 지수 {E['rateH'][100]:.2f}", color=C_EXP, fontsize=9, va='center')
a2.text(101, Q['rateH'][100] + 0.12, f" 유리 {Q['rateH'][100]:.2f}", color=C_RAT, fontsize=9, va='center')
a2.text(101, L['rateH'][100] - 0.12, f" 종전 {L['rateH'][100]:.2f}", color=C_LIN, fontsize=9, va='center')
a2.text(-1, E['rateH'][0] - 0.18, f"{E['rateH'][0]:.2f}", color=C_EXP, fontsize=8.5, ha='left')
a2.set_xlim(0, 100); a2.set_ylim(0, 4.6)
a2.set_xlabel('지금 허기 게이지(0 공복 · 100 만복)', color=INK2, fontsize=9)
a2.set_ylabel('분당 줄어드는 점', color=INK2, fontsize=9)
a2.set_title('② 기울기 — 지수는 상태에 비례(직선) · 유리는 제곱 · 종전은 계단', color=INK, fontsize=10.5, loc='left')

h, l = a1.get_legend_handles_labels()
fig.legend(h, l, loc='lower center', ncol=3, frameon=False, fontsize=9, labelcolor=INK2, bbox_to_anchor=(0.5, -0.005))
sh = E['shape']
fig.suptitle(f"T508 ① 허기·갈증 감쇠의 꼴 — 지수 b = 50/φ ≈ {sh['b']:.2f} · k·T = 3·ln φ ≈ {sh['kT']:.4f}  ·  유리 c = {Q['shape']['c']:.0f}  ·  새 수 0(종전 매듭 셋에서 유도)",
             x=0.012, ha='left', color=INK, fontsize=11.5, fontweight='bold')
fig.text(0.012, 0.905, '한 바퀴(100→0) 평균은 셋 다 하루 50점 = 2,450 kcal · 다른 것은 "어느 띠에서 사느냐" — 늘 90 위에서 살면 종전 75 · 지수 90.8 · 유리 95 점/일',
         color=INK2, fontsize=9)
fig.tight_layout(rect=(0, 0.06, 1, 0.9))
fig.savefig(out, facecolor=SURF)
print('그림 →', out)
