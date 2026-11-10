from pathlib import Path
import subprocess,os,json,concurrent.futures,shutil,time
root=Path('/tmp/t1246-after-v2');out=Path('/tmp/t1255-food-controls');out.mkdir(exist_ok=True);node='/workspace/.tools/node-v22.23.0-linux-x64/bin/node'
def run(case):
 tag,seed,revert=case;d=out/tag;d.mkdir(exist_ok=True)
 cache=d/'seedcache.json';shutil.copyfile(Path('/tmp/t1246-after-v2-results')/f'1-{seed}.seedcache.json',cache)
 old=Path('/tmp/t1246-after-v2-results')/f'1-{seed}.seedcache.json.t1047dist.json'
 if old.exists():shutil.copyfile(old,str(cache)+'.t1047dist.json')
 e=os.environ.copy();e.pop('NODE_OPTIONS',None);e.update(T1243_FARM_ON='1',T17_JSON=str(d/'world.json'),T176_JSON=str(d/'farm.json'),LAB_SEEDCACHE=str(cache),T1255_PATCH_AUDIT=str(d/'memory-patch.json'))
 if revert:e['NODE_OPTIONS']='--require /tmp/t1255-food-three-gates.js'
 start=time.monotonic()
 with(d/'run.log').open('w')as f:r=subprocess.run([node,'scripts/t176-ab.js','800',str(seed)],cwd=root,env=e,stdout=f,stderr=subprocess.STDOUT)
 (d/'status.json').write_text(json.dumps({'tag':tag,'seed':seed,'revert3':revert,'rc':r.returncode,'seconds':time.monotonic()-start},indent=2));print(tag,r.returncode,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as p:list(p.map(run,[('review1020',1020,False),('revert1020',1020,True),('revert7',7,True),('revert42',42,True)]))
