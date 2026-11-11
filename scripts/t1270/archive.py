"""Collect completed measurement evidence; trace rotations are all retained."""
import gzip,hashlib,json,shutil,subprocess,sys
from pathlib import Path
folder=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
selected={'main30':folder,'plain-one-day':Path('/tmp/t1270-plain-final'),'preflight-one-day':Path('/tmp/t1270-smoke-v2'),'official-off':Path('/tmp/sbc-0asRCF'),'timer-audit':Path('/tmp/t1270-timer-audit')}
jobs=[]
for name,root in selected.items():
 for p in sorted(root.rglob('*')):
  if not p.is_file() or p.suffix not in ['.json','.jsonl','.log']:continue
  dst=out/'runs'/name/p.relative_to(root);dst=dst.with_name(dst.name+'.gz');dst.parent.mkdir(parents=True,exist_ok=True);jobs.append((p,dst))
def compress(job):
 p,dst=job
 with p.open('rb') as src,dst.open('wb') as raw,gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0,compresslevel=6) as target:shutil.copyfileobj(src,target,1024*1024)
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=4) as pool:
 for _ in pool.map(compress,jobs):pass
for name,path in [('wiring','/tmp/t1270-wiring.log'),('official-off','/tmp/t1270-off.log')]:
 out.joinpath(name+'.log.gz').write_bytes(gzip.compress(Path(path).read_bytes(),mtime=0))
m=json.loads((folder/'source.json').read_text());checks={}
for name,expected in m['source'].items():
 fixed=subprocess.check_output(['git','show','b17f6089:'+name]);checks[name]={'fixedMainMatches':hashlib.sha256(fixed).hexdigest()==expected,'unchangedAfterRun':hashlib.sha256((Path(m['root'])/name).read_bytes()).hexdigest()==expected}
 assert all(checks[name].values())
helper={name:hashlib.sha256(Path('scripts/t1270',name).read_bytes()).hexdigest()==expected for name,expected in m['measurement'].items()};assert all(helper.values())
status=json.loads((folder/'status.json').read_text());assert status['valid'] and status['exit']==0 and status['clock']['errs']==0
p=json.loads((folder/'profile.json').read_text());assert p['code']==0 and set(p['days'])==set(range(1,31));assert sum(p['bucketsUs'].values())==p['mainThreadUs'];assert p['mainThreadUs']+p['otherThreadUs']==p['processUs']
worldfiles=[f for f in (folder/'server').glob('*.json') if f.name.endswith('-1020.json')];assert len(worldfiles)==1;w=json.loads(worldfiles[0].read_text());assert w['days']==30 and w['villages']==51 and all(n>0 for n in w['seedPop'])
plain=json.loads(Path('/tmp/t1270-plain-final/world-days.jsonl').read_text().splitlines()[0]);actual=json.loads((folder/'world-days.jsonl').read_text().splitlines()[0]);assert plain==actual
tracefiles=sorted(folder.glob('trace-'+str(p['pid'])+'-*.json'),key=lambda f:int(f.stem.rsplit('-',1)[1]));assert [int(f.stem.rsplit('-',1)[1]) for f in tracefiles]==list(range(1,len(tracefiles)+1))
summary=json.loads((out/'summary.json').read_text());assert summary['coveragePercent']>=90;assert summary['processCpuMinutes']==p['processUs']/60e6
out.joinpath('source-validation.json').write_text(json.dumps({'measuredMain':'b17f6089','status':status,'sourceChecks':checks,'observationSourceChecks':helper,'firstDayWorldEqual':True,'bodyWorld':{'days':w['days'],'villages':w['villages'],'seedPopulationAllPositive':True},'traceRotations':[f.name for f in tracefiles],'coveragePercent':summary['coveragePercent'],'nativeCPUClosure':True},indent=2)+'\n')
# Keep the reason/status for the interrupted trial, never splice its CPU or GC data.
partial=Path('/tmp/t1270-main30')
for name in ['source.json','status.json','world-days.jsonl.meta.json']:
 if (partial/name).exists():out.joinpath('interrupted-'+name+'.gz').write_bytes(gzip.compress((partial/name).read_bytes(),mtime=0))
print('archive complete; coverage',summary['coveragePercent'],'rotations',len(tracefiles))
