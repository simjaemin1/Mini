"""Collect completed T1264 measurements; fail on incomplete native runs."""
from pathlib import Path
import sys, json, re, hashlib, gzip, shutil, subprocess

R = Path(__file__).resolve().parents[1]
P = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/t1264')
O = R / '계측/T1264_2026-11-12'
O.mkdir(parents=True, exist_ok=True)
read = lambda p: json.loads(p.read_text())
arms = ['OFF', 'WOOD', 'TERR', 'V2_WOOD']
source = read(P / 'product-source-before.json')
assert all(hashlib.sha256((R / f).read_bytes()).hexdigest() == h for f, h in source.items())
instrumented = read(P / 'matrix-source.json')
assert read(P / 'clock-source.json') == instrumented
assert all(hashlib.sha256((R / f).read_bytes()).hexdigest() == h for f, h in instrumented.items())
subprocess.run(['git', 'diff', '--quiet', '05b66c73', '--', 'server', 'sim', 'public'], cwd=R, check=True)
ref = read(R / '계측/서버기준선_2026-11-11.json')
oldref = read(R / '계측/서버기준선_2026-11-08c.json')
summary = {'base': subprocess.check_output(['git', 'rev-parse', '05b66c73'], cwd=R, text=True).strip(),
           'productFilesUnchanged': len(source), 'cases': [], 'topFive': {}, 'controllers': {}, 'offReference': [],
           'excludedObserverFields': {'snapshots[].villages[].woodIn':
             'Reads nonexistent econ._t325WoodTot, always fallback zero; excluded. Canonical clearing inlet is territoryCost.woodIn.'}}
observations = {}

def copy_file(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix in ['.json', '.jsonl', '.log']:
        dest = dest.with_name(dest.name + '.gz')
        dest.write_bytes(gzip.compress(src.read_bytes(), mtime=0))
    else:
        shutil.copyfile(src, dest)

for a in arms + ['OFF_GATE', 'OLD_CLOCK_OFF', 'OLD_CLOCK_V2_WOOD']:
    d = P / a
    status = read(d / 'status.json')
    assert status['exit'] == 0 and status['sourceUnchanged'], (a, status)
    assert read(d / 'input.json')['source'] == instrumented
    summary['controllers'][a] = status
    log = (d / 'controller.log').read_text()
    tmp = Path(re.search(r'판 (/tmp/sbc-\w+)', log)[1])
    seeds = [1020, 7, 42] if a in arms else [1020]
    for s in seeds:
        assert re.search(rf'시드 {s} 400일 판 \d+초\(종료 0\)', log), (a, s)
        native = read(tmp / f'sbc-{s}.json')
        obs = read(tmp / f'sbc-{s}.json.t1264.json')
        assert native['days'] == 400 and native['villages'] == 51 and min(native['seedPop']) > 0
        assert len(native['seedPop']) == 51 and len(native['rows']) == 400
        assert 'starve' in native['bodyExit']['died']
        assert not obs['errors'] and obs['clock']['errs'] == 0
        assert obs['clock']['started'] and obs['clock']['fired'] > 0
        assert len(obs['rows']) == 400 and obs['rows'][-1]['day'] == 400
        assert [r['day'] for r in obs['rows']] == list(range(1, 401))
        assert obs['rows'][-1]['pop'] == native['eight']['pop']
        assert obs['rows'][-1]['debtDeaths'] == read(tmp / f'sbc-{s}.fd-deaths.json')['fdDeadTot']
        observations[a, s] = obs
        for snapshot in obs['snapshots']:
            for village in snapshot['villages']:
                village.pop('woodIn', None)
        vils = obs['snapshots'][-1]['villages']
        cost = {k: sum(v['territoryCost'][k] for v in vils) for k in ['days','stallWood','stallBody','cells','wood','felled','woodIn']}
        summary['cases'].append({'arm': a, 'seed': s, 'population': native['eight']['pop'], 'empty': native['empty'],
          'days': 400, 'childExit': 0, 'clockErrors': 0, 'observerErrors': 0,
          'debtDeaths': obs['rows'][-1]['debtDeaths'], 'famineVillageDays': sum(v['famine'] for v in obs['rows']),
          'bodyStarve': (native.get('bodyExit') or {}).get('died', {}).get('starve', 0),
          'territory': sum(v['territory'] for v in vils), 'farm': sum(v['farm'] for v in vils),
          'wood': sum(v['wood'] for v in vils), 'housing': sum(v.get('housing',0) for v in vils),
          'fallenCells': sum(v['fallenCells'] for v in vils),
          'zeroBirthDays': sum(v.get('zeroBirthDays',0) for v in vils),
          'zeroBirthHouseDays': sum(v.get('zeroBirthHouseDays',0) for v in vils), 'territoryCost': cost,
          'cpuSeconds': obs['cpuSeconds']})
        for f in tmp.glob(f'sbc-{s}*'):
            if '.db' not in f.name and f.is_file(): copy_file(f, O / 'runs' / a / str(s) / f.name)
    for f in d.iterdir():
        if f.is_file(): copy_file(f, O / 'controllers' / a / f.name)
    if (tmp / 'check.json').exists():
        copy_file(tmp / 'check.json', O / 'controllers' / a / 'native-check.json')
    if a == 'OFF_GATE':
        assert '=== 같음 1/1' in log
        assert read(tmp / 'sbc-1020.json')['eight']['pop'] == 3914
    if a in ['OFF', 'OLD_CLOCK_OFF']:
        baseline = read(d / 'baseline.json')
        target = ref if a == 'OFF' else oldref
        for s in seeds:
            x, y = baseline['byseed'][str(s)], target['byseed'][str(s)]
            comparisons = {k: x[k] == y[k] for k in ['days','eight','runHash']}
            comparisons['sideDays'] = len(x.get('side',{}).get('days',[]))
            comparisons['referenceSideDays'] = len(y.get('side',{}).get('days',[]))
            summary['offReference'].append({'arm': a, 'seed': s, **comparisons})
            if a == 'OFF':
                assert all(comparisons[k] for k in ['days','eight','runHash']), (a, s, comparisons)

# The observer preloads villages before the canonical side hook. Preserve that
# coverage failure, and require a separate unmodified gate with all 400 side days.
summary['diagnosticGate'] = {'controller':'OFF_GATE','sideDays':0,'acceptedAsOfficialGate':False,
                           'reason':'observer loaded villages before t740 loader injection'}
d=P/'OFF_GATE_FULL'
status=read(d/'status.json')
assert status['exit']==0 and status['sourceUnchanged']
assert read(d/'input.json')['source']==instrumented
log=(d/'controller.log').read_text()
assert '=== 같음 1/1' in log and '마을 칸 지문 400일 같음' in log
tmp=Path(re.search(r'판 (/tmp/sbc-\w+)',log)[1])
assert abs(status['wallSeconds']-read(tmp/'check.json')['sec'])<3
native=read(tmp/'sbc-1020.json')
assert native['days']==400 and native['eight']['pop']==3914 and len(native['rows'])==400
assert native['villages']==51 and len(native['seedPop'])==51 and min(native['seedPop'])>0
assert re.search(r'시드 1020 400일 판 \d+초\(종료 0\)',log)
side=read(tmp/'sbc-1020.json.t740.json')
assert len(side['days'])==400 and [r['d'] for r in side['days']]==list(range(1,401))
keys=sorted({k for r in side['days'] for k in r['f']})
H=lambda value,n: hashlib.sha1(value.encode()).hexdigest()[:n]
condensed=[]
for r in side['days']:
    hs=[H(r['f'].get(k) or '∅',8) for k in keys]
    condensed.append([r['d'],H(''.join(hs),12),hs])
assert {'names':side['names'],'keys':keys,'days':condensed}==ref['byseed']['1020']['side']
serverlog=(tmp/'sbc-1020.log').read_text()
clockErrors=re.findall(r'\[t745\] 끝[^\n]*오류 (\d+)',serverlog)
assert clockErrors==['0'], clockErrors
summary['officialGate']={'controller':'OFF_GATE_FULL','exit':0,'days':400,'sideDays':400,
                         'sideExactMatch':True,'population':3914,'clockErrors':0,'sourceUnchanged':True}
summary['controllers']['OFF_GATE_FULL']=status
summary['completedCases']={'mainComparisons':12,'historicalClockControls':2,'officialGate':1,
                           'requiredTotal':15,'additionalDiagnosticGate':1,
                           'interruptedFirstRunIncluded':False}
for f in [*d.iterdir(),*tmp.glob('sbc-1020*'),tmp/'check.json']:
    if f.is_file() and '.db' not in f.name:
        copy_file(f,O/'official-gate'/f.name)
summary['additionalGateRepeats']=[]
extraFile=P/'additional-full-gates.json'
if extraFile.exists():
    extra=read(extraFile)
    copy_file(extraFile,O/'additional-full-gates.json')
    for directory in extra['nativeDirectories']:
        q=Path(directory);c=read(q/'check.json');s=read(q/'sbc-1020.json.t740.json')
        assert c['per']['1020']['code']==0 and c['res']['1020']=={'same':True,'days':400}
        assert len(s['days'])==400
        sk=sorted({k for r in s['days'] for k in r['f']});sd=[]
        for r in s['days']:
            hs=[H(r['f'].get(k) or '∅',8) for k in sk]
            sd.append([r['d'],H(''.join(hs),12),hs])
        assert {'names':s['names'],'keys':sk,'days':sd}==ref['byseed']['1020']['side']
        assert re.findall(r'\[t745\] 끝[^\n]*오류 (\d+)',(q/'sbc-1020.log').read_text())==['0']
        summary['additionalGateRepeats'].append({'nativeDirectory':directory,'days':400,'sideDays':400,'clockErrors':0,'same':True})
        for f in [*q.glob('sbc-1020*'),q/'check.json']:
            if f.is_file() and '.db' not in f.name:copy_file(f,O/'additional-official-gate'/q.name/f.name)
summary['completedCases']['additionalCanonicalGateRepeats']=len(summary['additionalGateRepeats'])

for s in [1020, 7, 42]:
    off = {v['name']: v for v in observations['OFF', s]['snapshots'][-1]['villages']}
    terr = observations['TERR', s]['snapshots'][-1]['villages']
    worst = sorted(terr, key=lambda v: v['pop'] - off[v['name']]['pop'])[:5]
    summary['topFive'][str(s)] = [{'name': v['name'], 'populationDifference': v['pop'] - off[v['name']]['pop'],
                                  'off': off[v['name']], 'v2': v} for v in worst]
historic = json.loads(gzip.decompress((R / '계측/T1251_2026-11-10/빠른400/v2wood.json.gz').read_bytes()))['byseed']['1020']
summary['historicalReproduction'] = {}
for a in ['V2_WOOD', 'OLD_CLOCK_V2_WOOD']:
    now = read(P / a / 'baseline.json')['byseed']['1020']
    pair = next(((u,v) for u,v in zip(now['days'],historic['days']) if u != v), None)
    fields = []
    if pair:
        u, v = pair
        for i, name in enumerate(now['names']):
            if u[3][i] != v[3][i]:
                fields.append({'village': name, 'fields': [k for j,k in enumerate(['storage','population','housing','treasury'])
                                if u[3][i][j*4:j*4+4] != v[3][i][j*4:j*4+4]]})
    summary['historicalReproduction'][a] = {
        'historicalPop': historic['eight']['pop'], 'currentPop': now['eight']['pop'],
        'sameDays': now['days'] == historic['days'], 'sameEight': now['eight'] == historic['eight'],
        'sameRunHash': now['runHash'] == historic['runHash'],
        'sameSide': now.get('side') == historic.get('side') if len(now.get('side',{}).get('days',[]))==400 else None,
        'sideDays': len(now.get('side',{}).get('days',[])),
        'referenceSideDays': len(historic.get('side',{}).get('days',[])),
        'firstDifferentDay': pair[0][0] if pair else None,
        'firstDifferentVillageFields': fields}
for f in ['matrix-source.json','matrix-status.json','product-source-before.json','clock-source.json','clock-status.json']:
    copy_file(P / f, O / f)
(O / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps({'cases': len(summary['cases']), 'gate': '1/1', 'sourceUnchanged': True}))
