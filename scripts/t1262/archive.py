"""Archive measurement evidence, excluding databases and runtime dependency directories."""
import gzip,hashlib,json,subprocess,sys
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
selected={
 'off-gate':Path('/tmp/sbc-uQ351Z'),
 'tick30':Path('/tmp/t1262-tick30'), 'event30':Path('/tmp/t1262-event30'),
 'control-tick':Path('/tmp/t1262-control-tick'),'control-event':Path('/tmp/t1262-control-event'),
 'residual':Path('/tmp/t1262-residual'),
 'smoke-farm0-tick':Path('/tmp/t1262-smoke'),'smoke-farm0-event':Path('/tmp/t1262-smoke-final'),'smoke-farm0-plain':Path('/tmp/t1262-plain')}
for label,root in selected.items():
 for p in sorted(root.rglob('*')):
  if not p.is_file() or p.suffix not in ['.json','.jsonl','.log']:continue
  target=out/'runs'/label/p.relative_to(root);target=target.with_name(target.name+'.gz');target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(gzip.compress(p.read_bytes(),mtime=0))
for label,p in [('main-wiring','/tmp/t1262-main-wiring-real.log'),('v4-wiring','/tmp/t1262-v4-wiring-real.log'),('official-off','/tmp/t1262-off.log')]:
 (out/(label+'.log.gz')).write_bytes(gzip.compress(Path(p).read_bytes(),mtime=0))
validation={}
for label in ['tick30','event30']:
 root=selected[label];meta=json.loads((root/'source.json').read_text());checks={}
 for name,expected in meta['source'].items():
  fixed=subprocess.check_output(['git','show','08bf7597:'+name]);checks[name]={'matchesFixedCommit':hashlib.sha256(fixed).hexdigest()==expected,'unchangedAfterRun':hashlib.sha256((Path(meta['root'])/name).read_bytes()).hexdigest()==expected}
 assert all(v['matchesFixedCommit'] and v['unchangedAfterRun'] for v in checks.values())
 status=json.loads((root/'status.json').read_text());assert status['valid'];validation[label]={'status':status,'sourceChecks':checks,'meterHashMatches':hashlib.sha256(Path('scripts/t1262/profile.cjs').read_bytes()).hexdigest()==meta['measurement']['profile.cjs']}
 assert validation[label]['meterHashMatches']
 validation[label]['runnerHashMatches']=hashlib.sha256(Path('scripts/t1262/run.cjs').read_bytes()).hexdigest()==meta['measurement']['run.cjs'];assert validation[label]['runnerHashMatches']
 worldfiles=[p for p in (root/'server').glob('*.json') if p.name.endswith('-1020.json')];assert len(worldfiles)==1
 world=json.loads(worldfiles[0].read_text());assert world['days']>=30 and all(n>0 for n in world['seedPop'])
 validation[label]['actualWorld']={'days':world['days'],'villages':len(world['seedPop']),'allSeedPopulationPositive':all(n>0 for n in world['seedPop'])}
 originalmeta=json.loads((root/'days.jsonl.meta.json').read_text());clock=originalmeta['clock'];assert clock['errs']==0;validation[label]['clock']=clock
 profile=json.loads((root/'profile.json').read_text());assert sum(profile['bucketsUs'].values())==profile['mainThreadUs'];assert profile['mainThreadUs']+profile['otherThreadUs']==profile['processUs']
 days=[json.loads(l) for l in (root/'profile-days.jsonl').read_text().splitlines()];validation[label]['finalDailySnapshotTailUs']=profile['processUs']-days[-1]['processUs']
 validation[label]['processStartVsOriginalHookWindowUs']=profile['processUs']-round(originalmeta['cpuSeconds']*1e6)
(out/'source-validation.json').write_text(json.dumps(validation,indent=2)+'\n')
print(json.dumps({k:v['status'] for k,v in validation.items()},indent=2))
