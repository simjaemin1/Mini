#!/usr/bin/env python3
"""Plot completed paired contrasts, independently of unfinished long worlds."""
import json
import pathlib
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '계측/T1465_2026-11-23')
source = root / '결과.json'
if not source.exists():
    source = root / '결과-진행.json'
data = json.loads(source.read_text())
assert len(data['matrix']) == len(data['equilibrium']) == 6
assert data['ablation']
plt.rcParams['svg.hashsalt'] = 'T1465-paired-contrasts'
fig, axes = plt.subplots(1, 3, figsize=(14.5, 4.7), constrained_layout=True,
                         gridspec_kw={'width_ratios': [1.4, 1.4, .8]})
colors = {'off': '#64748b', 'on': '#2563eb'}
for ax, rows, key in [(axes[0], data['matrix'], 'stoneBronzeRatio'),
                      (axes[1], data['equilibrium'], 'bronze')]:
    for stock, offset in [('off', -.19), ('on', .19)]:
        values = [r[stock]['metrics']['production']['bronze'] if key == 'bronze'
                  else r[stock]['metrics'][key] for r in rows]
        ax.bar([i+offset for i in range(6)], values, .36,
               color=colors[stock], label='Stock flag '+stock.upper())
        for i, value in enumerate(values):
            text = f'{value:,.0f}' if key == 'bronze' else f'{value:.1f}'
            ax.annotate(text, (i+offset, value), xytext=(0, 3),
                        textcoords='offset points', ha='center', va='bottom',
                        rotation=90, fontsize=7)
    ax.set_xticks(range(6), [f"{'base' if r['arm']=='off' else 'bundle'}\n{r['seed']}"
                            for r in rows])
    ax.tick_params(axis='x', labelsize=8)
    ax.legend(fontsize=8, loc='upper right' if key != 'bronze' else 'upper left')
axes[0].set(yscale='log', ylim=(.7, 400), ylabel='Stone / bronze swords produced (log scale)',
            title='Fresh worlds: 800 completed days')
axes[1].set(ylim=(0, 18000), ylabel='New bronze swords during 730-day continuation',
            title='1900-day snapshots: matched continuations')
normal = next(r for r in data['matrix'] if r['arm'] == 'bundle' and r['seed'] == 1020)
values = [data['ablation']['metrics']['production']['bronze'],
          normal['on']['metrics']['production']['bronze']]
axes[2].bar([0, 1], values, color=[colors['off'], colors['on']], width=.65)
for i, value in enumerate(values):
    axes[2].text(i, value+.6, f'{value:.2f}', ha='center', fontsize=9)
axes[2].set(xticks=[0, 1], xticklabels=['No debit\n(diagnostic copy)', 'Finite ON'],
            ylim=(0, 52), ylabel='New bronze swords / 800 days',
            title='Bundle1020: same cell choice')
for ax in axes:
    ax.grid(axis='y', alpha=.2)
    ax.set_axisbelow(True)
fig.suptitle('T1465: native production counters; default remains OFF', fontsize=13)
fig.savefig(root / '희소성-대조.svg', metadata={'Date': None})
svg = root / '희소성-대조.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
fig.savefig(root / '희소성-대조.png', dpi=150)
plt.close(fig)
