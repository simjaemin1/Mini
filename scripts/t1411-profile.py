#!/usr/bin/env python3
"""Read native V8 profiles; sampling weights are elapsed sample time, not OS CPU."""
import argparse, collections, json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('profiles', type=Path)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
groups = {
    'territory_price': lambda n, u: n in ['_t1207CellCost', '_t1358Requote', '_t1411StakeQuote'] or u.endswith('/terr-cost.js'),
    'territory_selection': lambda n, u: n in ['_t1329Crew', '_t1329Job', '_t1329Short', '_t1207CanTake', '_terrGrow', '_t1238Batch'],
    'fit': lambda n, u: n == '_t561Fit',
    'hauling': lambda n, u: u.endswith(('/terr-body.js', '/build-haul.js')) or n == '_t1181Step',
    'pathfinding': lambda n, u: u.endswith('/path-core.js') or n in ['pfFindPath', '_pfGo', '_pathTo'],
    'zone_body': lambda n, u: n in ['_moveOne', '_decOne', 'decideNpcBehavior', 'npcStep', 'npcLifeTick'],
    'walk_prepare': lambda n, u: n in ['_wwPre', '_wwPreOne', '_wwIsStill', '_wwPost', '_wwStillPost'],
    'spatial_index': lambda n, u: n in ['rebuildSpatialIndex', '_rebuildSpatialInc', '_sweepOne'],
    'body_separation': lambda n, u: n == 'sepNpcs',
    'roads': lambda n, u: u.endswith('/roads.js'),
    'observer_self': lambda n, u: '/scripts/t1' in u and ('observe' in u or 'hook' in u),
    'census': lambda n, u: u.endswith('/t1411-census.cjs'),
    'gc': lambda n, u: n == '(garbage collector)',
}
all_self, all_incl = collections.defaultdict(float), collections.defaultdict(float)
records = []
for file in sorted(a.profiles.glob('*.cpuprofile')):
    raw = json.loads(file.read_text())
    nodes = {n['id']: n for n in raw['nodes']}
    parent = {c: n['id'] for n in raw['nodes'] for c in n.get('children', [])}
    def key(i):
        f = nodes[i]['callFrame']
        return f.get('functionName', '') or '(anonymous)', f.get('url', ''), f.get('lineNumber', -1) + 1
    weighted = collections.defaultdict(float)
    samples, deltas = raw.get('samples', []), raw.get('timeDeltas', [])
    for i, sample in enumerate(samples):
        # V8 delta[i] is the interval preceding sample[i]. Keep the raw weight.
        weighted[sample] += deltas[i] if i < len(deltas) else 0
    exclusive, inclusive = collections.defaultdict(float), collections.defaultdict(float)
    group_self, group_incl = collections.defaultdict(float), collections.defaultdict(float)
    for leaf, us in weighted.items():
        if leaf not in nodes:
            raise ValueError(f'Unknown sample node {leaf}: {file}')
        stack, cur = [], leaf
        while cur in nodes:
            stack.append(key(cur)); cur = parent.get(cur)
        exclusive[stack[0]] += us
        for k in set(stack): inclusive[k] += us
        for name, predicate in groups.items():
            if predicate(stack[0][0], stack[0][1]): group_self[name] += us
            if any(predicate(n, u) for n, u, _ in stack): group_incl[name] += us
    for k, us in exclusive.items(): all_self[k] += us
    for k, us in inclusive.items(): all_incl[k] += us
    records.append(dict(file=file.name, samples=len(samples), sampledSeconds=sum(weighted.values()) / 1e6,
                        wallSeconds=(raw['endTime']-raw['startTime']) / 1e6,
                        groupSelfSeconds={k: v/1e6 for k, v in group_self.items()},
                        groupInclusiveSeconds={k: v/1e6 for k, v in group_incl.items()}))
assert records, 'No complete native profiles'
rows = [dict(function=k[0], source=k[1], line=k[2], selfSeconds=all_self[k]/1e6,
             inclusiveSeconds=all_incl[k]/1e6) for k in all_incl]
rows.sort(key=lambda x: x['selfSeconds'], reverse=True)
result = dict(method=__doc__, profiles=records, functions=rows)
(a.out/'native-profile.json').write_text(json.dumps(result, indent=1))
lines = ['# Native V8 profile', '',
         'Weights = elapsed sample intervals; inclusive categories overlap. OS CPU is recorded separately by day.', '',
         '| function | source:line | self sample sec | inclusive sample sec |', '|---|---|---:|---:|']
for r in rows[:30]:
    src = r['source'].split('/tmp/t1411/base/')[-1]
    lines.append(f"| {r['function']} | {src}:{r['line']} | {r['selfSeconds']:.3f} | {r['inclusiveSeconds']:.3f} |")
(a.out/'native-profile.md').write_text('\n'.join(lines)+'\n')
print('Read', len(records), 'profiles;', sum(r['samples'] for r in records), 'samples')
