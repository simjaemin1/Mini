import os,subprocess,pathlib,json,time,concurrent.futures,hashlib,re
root=pathlib.Path('/workspace/Mini-T1255');out=pathlib.Path('/tmp/t1255-baseline');out.mkdir(exist_ok=True);node='/workspace/.tools/node-v22.23.0-linux-x64/bin/node'
files=['server/animals.js','server/wildlife.js','server/zone.js','scripts/t1255-baseline-observe.js'];sha={f:hashlib.sha256((root/f).read_bytes()).hexdigest()for f in files}
assert subprocess.check_output(['git','rev-parse','--short=8','HEAD'],cwd=root,text=True).strip()=='83a44e55'
for f in files:assert(root/f).read_bytes()==subprocess.check_output(['git','show','83a44e55:'+f],cwd=root)
new='계측/서버기준선_2026-11-10.json';old='계측/서버기준선_2026-11-08c.json'
def run(tag,index):
 d=out/tag;d.mkdir(exist_ok=True);e=os.environ.copy();e.pop('NODE_OPTIONS',None);e.pop('T1237_WATER_DEER',None);e.update(T1243_FARM_ON='0',T1241_DES='0',T577_PORT_BASE=str(41000+index*2000),T1255_GROUP_EXIT=str(d/'exit.json'))
 if tag=='off_old':e['T1237_WATER_DEER']='0'
 e['NODE_OPTIONS']='--require '+str(root/'scripts/t1255-baseline-observe.js')+' --require /tmp/t1255-exit.js'
 args=[node,'scripts/server-baseline-check.js']+(['--make',new]if tag=='make_new'else[old if tag=='off_old'else new])+['--vclock','--days','400','--seeds','1020,7,42','--par','2']
 start=time.monotonic();startUTC=time.time();print('START',tag,flush=True)
 with(d/'driver.log').open('w')as f:
  p=subprocess.Popen(args,cwd=root,env=e,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  (d/'start.json').write_text(json.dumps({'pid':p.pid,'utc':startUTC,'args':args,'env':{k:e[k]for k in ['T1243_FARM_ON','T1241_DES','T577_PORT_BASE','NODE_OPTIONS']},'waterDeer':e.get('T1237_WATER_DEER','unset-default-on'),'sourceSHA256':sha},indent=2)+'\n');p.wait()
 same=sha=={f:hashlib.sha256((root/f).read_bytes()).hexdigest()for f in files}
 text=(d/'driver.log').read_text();m=re.search(r'판 (/tmp/sbc-[\w-]+)',text)
 s={'tag':tag,'rc':p.returncode,'seconds':time.monotonic()-start,'sourceUnchanged':same,'sourceCommit':'83a44e55','sourceSHA256':sha,'raw':m.group(1)if m else None,'args':args}
 (d/'status.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');print('DONE',tag,json.dumps(s,ensure_ascii=False),flush=True);assert same;return s
# §0 controls completed before baking starts.
for tag in ['review1020','revert1020','revert7','revert42']:
 s=json.loads((pathlib.Path('/tmp/t1255-food-controls')/tag/'status.json').read_text());assert s['rc']==0
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as p:first=list(p.map(lambda x:run(*x),[('off_old',0),('make_new',1)]))
assert next(s for s in first if s['tag']=='make_new')['rc']==0
b=json.loads((root/new).read_text());assert b['seeds']==[1020,7,42]and b['days']==400
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as p:list(p.map(lambda x:run(*x),[('repeat1',2),('repeat2',3)]))
