#!/usr/bin/env python3
"""Reproduce T1157 / T1156 laboratory matrices from immutable source copies.
No worktree, checkout, dependency install, or baseline replacement is performed.
"""
import argparse, concurrent.futures, hashlib, json, os, pathlib, subprocess, time
P=argparse.ArgumentParser(description=__doc__)
P.add_argument('card',choices=['T1157','T1156']);P.add_argument('--source',type=pathlib.Path,required=True)
P.add_argument('--reference',type=pathlib.Path);P.add_argument('--out',type=pathlib.Path,required=True)
P.add_argument('--node',default='node');P.add_argument('--workers',type=int,default=1)
A=P.parse_args();A.source=A.source.resolve();A.out=A.out.resolve()
if A.card=='T1157' and not A.reference:P.error('T1157 requires the merged-prerequisite reference checkout')
if A.reference:A.reference=A.reference.resolve()
if A.workers<1:P.error('--workers must be positive')
A.out.mkdir(parents=True,exist_ok=True)
FILES=['sim/economy-sim.js','sim/economy-sim-v2.js','server/villages.js','server/weights.js','server/specialty.js','scripts/t17-metrics.js','scripts/t1157-observe.js','scripts/t1156-flow-observe.js','scripts/t115x-observe.js','scripts/t1157-off-kg-observe.js']
def hashes(root):return {f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in FILES if (root/f).exists()}
base={'T1136_BASKET':'1','T1152_MARKET':'1'}
if A.card=='T1157':
 variants={'off':{},'basket':base,'settle':dict(base,T1157_SETTLE_VAULT='1'),'eat':dict(base,T1157_EAT_VAULT='1'),'release':dict(base,T1157_RELEASE_RESERVE='1'),'all':dict(base,T1157_SETTLE_VAULT='1',T1157_EAT_VAULT='1',T1157_RELEASE_RESERVE='1'),'reference':{}}
else:variants={'off':{'T1156_SPECIALTY_JOB':'0'},'on':{'T1156_SPECIALTY_JOB':'1'}}
meta={'card':A.card,'source':str(A.source),'sourceSHA256':hashes(A.source),'reference':str(A.reference) if A.reference else None,'referenceSHA256':hashes(A.reference) if A.reference else None,'node':subprocess.check_output([A.node,'--version'],text=True).strip(),'workers':A.workers,'days':800,'seeds':[1020,7,42],'variants':variants}
(A.out/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
def run(job):
 mode,seed=job;root=A.reference if mode=='reference' else A.source;before=hashes(root);output=A.out/f'{mode}-{seed}.json';env=os.environ.copy()
 for k in list(env):
  if k.startswith(('T1152_','T1156_','T1157_')) or k in ['T1136_BASKET','NODE_OPTIONS','T17_JSON','T17_BASKET','T17_MARKET']:env.pop(k)
 env.update(variants[mode]);env.update(T17_JSON=str(output))
 observer=root/'scripts/t115x-observe.js'
 if observer.exists():env['NODE_OPTIONS']='--require '+str(observer)
 elif mode!='reference':raise RuntimeError('missing corrected t115x-observe.js')
 if A.card=='T1157' and mode=='off':
  kgObserver=root/'scripts/t1157-off-kg-observe.js'
  if not kgObserver.exists():raise RuntimeError('missing OFF arrival-kg observer')
  env['NODE_OPTIONS']+=' --require '+str(kgObserver)
 cmd=[A.node,'scripts/t17-metrics.js','800',str(seed)];start=time.monotonic()
 with (A.out/f'{mode}-{seed}.log').open('w') as log:r=subprocess.run(cmd,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 changed=before!=hashes(root)
 row={'mode':mode,'seed':seed,'rc':r.returncode,'sourceChangedDuringRun':changed,'seconds':round(time.monotonic()-start,3),'source':str(root),'sourceSHA256':before,'command':cmd,'variantEnv':variants[mode],'output':str(output),'complete':r.returncode==0 and not changed and output.exists()}
 (A.out/f'{mode}-{seed}.status.json').write_text(json.dumps(row,indent=2)+'\n');print(json.dumps(row),flush=True)
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=A.workers) as pool:rows=list(pool.map(run,[(m,s) for m in variants for s in [1020,7,42]]))
(A.out/'suite.json').write_text(json.dumps({'manifest':meta,'runs':rows,'complete':all(r['complete'] for r in rows)},ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if all(r['complete'] for r in rows) else 1)
