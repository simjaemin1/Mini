#!/usr/bin/env python3
"""Validate and archive the completed T1358 data. No commit/push and no product mutation."""
import argparse,json,gzip,shutil,hashlib,re,subprocess,concurrent.futures
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runs',type=Path,required=True);p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parent.parent; a.out.mkdir(parents=True,exist_ok=True)
S=json.loads((a.out/'summary.json').read_text());M=json.loads((a.out/'source-manifest.json').read_text())
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
assert len(S)==6 and all(x['done'] and x['days']==x['target'] for x in S.values())
assert all(sha(root/f)==v['working'] for f,v in M['files'].items()),'measured source changed'
assert [f for f,v in M['files'].items() if v['main']!=v['candidate']]==['server/villages.js','server/build-haul.js']
copy=[];validation={}
for name,summary in S.items():
 d=a.runs/name;P=json.loads((d/'progress.json').read_text());expected=400 if name.endswith('-1020') else 100
 assert P['done'] and P['days']==P['ck']==expected
 assert len(P['segs'])==expected//10 and all(s['code']==0 for s in P['segs'])
 assert P['env']['T740_DUMP_DAYS']=='100,200,400'
 assert json.loads((a.runs/(name+'.exit.json')).read_text())['exit']==0
 if not name.startswith('OFF'):
  assert summary['batchCalls']==0 and summary['maxMissingResidents']==0
 if not name.startswith('OFF'):assert summary['minBodyRatio']>=1
 child=[]
 for seg in P['segs']:
  start=seg['from'];meta=json.loads((d/f'seg-{start}.json.t1274-meta.json').read_text())
  assert meta['exitEventCode']==0 and isinstance(meta.get('clock'),dict) and meta['clock']['errs']==0 and meta['clock']['fired']>0 and meta['clock']['V']>=meta['clock']['V0']
  child.append(dict(start=start,exit=meta['exitEventCode'],clock=meta.get('clock'),cpu=meta.get('cpu'),uptime=meta.get('uptimeSeconds')))
 # The canonical t577 final JSON is an independent population end total.
 final=json.loads((d/f'{P["tag"]}-{P["seed"]}.json').read_text())
 assert final['eight']['pop']==summary['pop']
 dst=a.out/'runs'/name
 for f in d.iterdir():
  if not f.is_file() or f.is_symlink():continue
  if f.name.startswith(('w.db','state.json')):continue
  if f.suffix not in ['.json','.jsonl','.log','.txt']:continue
  # Closed observation and timing data; large stop dumps are represented by the
  # exact ruler-point T740 snapshots. Keep first stop as restart provenance.
  if f.name.startswith('stop-') and f.name!='stop-10.json':continue
  copy.append((f,dst/(f.name+'.gz')))
 for tail in ['.launch.json','.exit.json','.guard.log']:
  f=a.runs/(name+tail)
  if f.exists():copy.append((f,dst/(f.name+'.gz')))
 validation[name]=dict(days=expected,segments=len(P['segs']),actualRunnerExit=0,observerErrors=summary['observerErrors'],minBodyRatio=summary['minBodyRatio'],maxBodyGap=summary['maxBodyGap'],maxMissingResidents=summary['maxMissingResidents'],children=child)
# Gate source is the final guarded product version; corrected touched selector is separate.
gates=a.out/'gates';gates.mkdir(exist_ok=True)
for f in (a.work/'ready-gates').iterdir():
 if f.is_file():shutil.copyfile(f,gates/f.name)
for src,target in [(a.work/'corrected-gates/status.json','touched-corrected-status.json'),(a.work/'corrected-gates/touched.log','touched-corrected.log'),(a.work/'corrected-gates/touched-plan.json','touched-plan.json'),(a.work/'gates/off-ready.log','off.log'),(a.work/'gates/off-ready-exit.json','off-exit.json'),(a.work/'gates/old-red-ready.log','old-red.log'),(a.work/'gates/touched-final-plan.txt','touched-precommit.txt'),(a.work/'gates/touched-unquoted.txt','touched-unquoted.txt'),(a.work/'gates/ci-measure-ready.log','ci-measure.log')]:
 assert src.exists(),str(src);shutil.copyfile(src,gates/target)
assert json.loads((gates/'off-exit.json').read_text())['exit']==0
assert '=== 같음 1/1 · 경제 400/400 · 생활층 400/400' in (gates/'off.log').read_text()
assert all(r['exit']==0 for r in json.loads((gates/'status.json').read_text()))
corrected=json.loads((gates/'touched-corrected-status.json').read_text());assert corrected['exit']==0 and len(corrected['expectedHarnesses'])==11
prov=a.out/'provenance';prov.mkdir(exist_ok=True)
for pattern in ['*preflight.json','*invalid.json','point-observer-migration.json','body-off-fixture-proof.json','diagnosis*.log','gates/node22-prefix-proof.json','gates/node24-side-differences.json','gates/node22-build.log','gates/off.log','gates/snapshot-smoke-state.json','gates/snapshot-smoke-proof.json']:
 for f in a.work.glob(pattern):
  if f.is_file():shutil.copyfile(f,prov/(f.parent.name+'-'+f.name if f.parent!=a.work else f.name))
# Include the actual official gate child fingerprints, not its live database.
log=(gates/'off.log').read_text();match=re.search(r'판 (/tmp/sbc-[^ ]+) ===',log);assert match
raw=Path(match.group(1))
for f in raw.iterdir():
 if f.is_file() and f.suffix in ['.json','.jsonl','.log'] and not f.is_symlink():copy.append((f,gates/'off-raw'/(f.name+'.gz')))
oldlog=(a.work/'gates/off.log').read_text();oldmatch=re.search(r'판 (/tmp/sbc-[^ ]+) ===',oldlog)
if oldmatch:
 for f in Path(oldmatch.group(1)).iterdir():
  if f.is_file() and f.suffix in ['.json','.jsonl','.log'] and not f.is_symlink():copy.append((f,prov/'node24-off-raw'/(f.name+'.gz')))
def archive(pair):
 src,dst=pair;dst.parent.mkdir(parents=True,exist_ok=True);tmp=dst.with_suffix('.tmp')
 with src.open('rb') as inp,tmp.open('wb') as fp,gzip.GzipFile(filename='',mode='wb',fileobj=fp,mtime=0,compresslevel=5) as out:shutil.copyfileobj(inp,out)
 tmp.replace(dst)
 return str(dst.relative_to(a.out))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:archived=list(ex.map(archive,copy))
validation=dict(base=M['base'],implementation=M['implementation'],productFilesChanged=['server/villages.js','server/build-haul.js'],sourceHashesMatch=True,runs=validation,archivedFiles=len(archived),archiveBytes=sum((a.out/f).stat().st_size for f in archived))
(a.out/'source-validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=1))
print('Archived',len(archived),'raw files, bytes',validation['archiveBytes'])
