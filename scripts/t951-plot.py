# (러너 밖 · T951 그림 · 제품 무변) — t951-table.js --json 이 낸 JSON 을 한 그림으로
#   쓰는 법: python3 scripts/t951-plot.py <t951-table.json> <out.png>
#   시드마다 한 줄: 날별 굶어 죽음(30날 칸 막대) · 습격 손실(점 — 날) · 보호막 창(나이 < SHIELD_DAYS · 회색) · 도적 보호기 끝나는 날(마을마다 · 눈금 · 범위 띠)
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = ['Noto Sans CJK KR', 'NanumGothic', 'DejaVu Sans']
J = json.load(open(sys.argv[1]))
seeds = [s for s in ['1020', '7', '42'] if s in J['seeds']]
fig, axes = plt.subplots(len(seeds), 1, figsize=(11, 3.2 * len(seeds)), sharex=True)
if len(seeds) == 1: axes = [axes]
SH = J['shieldDays']
for ax, s in zip(axes, seeds):
    S = J['seeds'][s]
    days = sorted(int(k) for k in S['daily'])
    xmax = max(days[-1] + 1, 760)
    bins = {}
    for d in days: bins[d // 30] = bins.get(d // 30, 0) + S['daily'][str(d)]
    ax.bar([b * 30 + 15 for b in bins], [bins[b] for b in bins], width=28, color='#c0504d', alpha=0.8, label='굶어 죽음(30날 칸)')
    ends = sorted(r['shieldEnd'] for r in S['rows']); opens = sorted(r['open'] for r in S['rows'])
    ax.axvspan(0, ends[0], color='#999999', alpha=0.15, label=f'보호막 창(나이 < {SH})')
    ax.axvspan(opens[0], opens[-1], color='#4f81bd', alpha=0.10, label=f'도적 보호기 끝 범위({opens[0]}~{opens[-1]})')
    top = max(bins.values()) if bins else 1
    for o in opens: ax.plot([o, o], [top * 1.02, top * 1.08], color='#4f81bd', lw=0.8)
    ld = S['lootDays']
    ax.scatter(ld, [top * 1.15] * len(ld), marker='v', color='#000000', s=18, label=f'습격 손실({len(ld)}건)')
    ax.axvline(400, color='#555555', ls='--', lw=0.8)
    ax.text(402, top * 0.9, '판 끝 400', fontsize=8, color='#555555')
    ax.set_xlim(0, xmax); ax.set_ylim(0, top * 1.25)
    ax.set_ylabel(f'시드 {s}')
    ax.legend(loc='upper right', fontsize=7)
axes[-1].set_xlabel('게임날')
fig.suptitle('T951 — 보호막 끔 × 도적: 습격 손실 · 굶어 죽음 · 보호막 창 · 도적 보호기 끝나는 날', fontsize=11)
fig.tight_layout()
fig.savefig(sys.argv[2], dpi=110)
print('→', sys.argv[2])
