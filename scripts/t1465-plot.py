#!/usr/bin/env python3
"""Plot completed native measurements; no fitted curve or balance parameters."""
import json
import pathlib
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '계측/T1465_2026-11-23')
data = json.loads((root / '결과.json').read_text())
assert data['complete']
worlds = {r['stock']: r for r in data['long']}
fig, axes = plt.subplots(2, 2, figsize=(11, 7.4), constrained_layout=True)
years = list(range(1, 31))
on = worlds['on']['annual']
for mineral in ['tin', 'copper', 'gold', 'iron']:
    axes[0, 0].plot(years, [r['npcRemainingPercent'][mineral] for r in on], label=mineral)
axes[0, 0].set(ylabel='Accessible reference stock remaining (%)', title='Finite stock ON; NPC labour-right union')
axes[0, 0].legend(ncol=2)
for stock, color in [('off', '#64748b'), ('on', '#2563eb')]:
    rows = worlds[stock]['annual']
    axes[0, 1].plot(years, [r['mine5']['minersFinal'] for r in rows], label=stock.upper(), color=color)
    prior = 0
    flow = []
    for r in rows:
        value = r['production']['bronze']
        flow.append(max(0, value - prior))
        prior = value
    axes[1, 0].plot(years, flow, label=stock.upper(), color=color)
    axes[1, 1].plot(years, [r['pop'] for r in rows], label=stock.upper(), color=color)
axes[0, 1].set(ylabel='Miners at year end', title='Mine5 labour response')
axes[1, 0].set(ylabel='New bronze swords / year', title='Native output, not shadow observer totals', yscale='symlog')
axes[1, 1].set(ylabel='Population', title='Same initial world; seed42 bronze bundle')
for ax in axes.flat:
    ax.set_xlabel('Game year (365 days)')
    ax.set_xlim(1, 30)
    ax.grid(alpha=.2)
for ax in [axes[0, 1], axes[1, 0], axes[1, 1]]:
    ax.legend()
fig.suptitle('T1465: 10,950 completed game days; default flag remains OFF', fontsize=13)
fig.savefig(root / '30년-재고와-생산.svg', metadata={'Date': None})
fig.savefig(root / '30년-재고와-생산.png', dpi=140)
plt.close(fig)
