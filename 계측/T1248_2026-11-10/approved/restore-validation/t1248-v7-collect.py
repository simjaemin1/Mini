from pathlib import Path
import json,shutil,gzip,hashlib,re
r=Path('/workspace/Mini');root=Path('/tmp/t1248-v7-validation');out=r/'계측/T1248_2026-11-10/approved/restore-validation'
for tag in ['fresh13','offgate']:
 if not(root/tag/'status.json').exists():print('PENDING',tag);raise SystemExit(2)
def read(p):return json.loads(p.read_text())
def days(p):return [json.loads(l)for l in p.read_text().splitlines()if '"day":'in l]
s=read(root/'fresh13/status.json');assert s['rc']==0,(s['rc'],'wrapper13 must be full51town')
assert read(root/'fresh13/child.json')['code']==0
now=days(root/'fresh13/fresh13-1020.json.t1248.jsonl');old=days(Path('/tmp/t1248-v6-firstdiff13/des13/des13-1020.json.t1248.jsonl'));assert len(now)==len(old)==13
assert [(x['day'],x['hash'])for x in now]==[(x['day'],x['hash'])for x in old]
audit=read(root/'fresh13/fresh13-1020.json.restore-audit.json');assert audit=={'restoreEntries':0,'ownerEntries':0,'unsafeAdmissions':0},audit
assert read(root/'offgate/status.json')['rc']==0
assert '같음 1/1'in(root/'offgate/driver.log').read_text()
out.mkdir(parents=True,exist_ok=True)
for tag in ['fresh13','offgate']:
 dest=out/tag;dest.mkdir(exist_ok=True)
 for f in (root/tag).iterdir():
  if f.is_file()and f.suffix in ['.json','.jsonl','.log']:
   with gzip.open(dest/(f.name+'.gz'),'wb')as g:g.write(f.read_bytes())
matches=re.findall(r'판 (/tmp/sbc-[A-Za-z0-9_-]+)',(root/'offgate/driver.log').read_text());assert matches
raw=Path(matches[0]);dest=out/'offgate/raw';dest.mkdir(exist_ok=True)
for f in raw.iterdir():
 if f.is_file()and f.suffix in ['.json','.jsonl','.log']:
  with gzip.open(dest/(f.name+'.gz'),'wb')as g:g.write(f.read_bytes())
proof={'productionCommit':'a47e08a5','frozenSnapshot':'/tmp/t1248-final-v7','OFF':'8c 1020:400 같음1/1','OFFwallSeconds':read(root/'offgate/status.json')['seconds'],'OFFrawDirectory':str(raw),'freshWorld':{'days':13,'villages':read(root/'fresh13/fresh13-1020.json')['villages'],'allDailyHashesEqualE1E':True,'entryCounters':audit},'performanceLimit':'Long speed and 400day comparisons remain explicitly e1e65d6a. Additional unsafe guard cost is not measured by those runs.'}
(out/'proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
for f in ['/tmp/t1248-v7-validation.py','/tmp/t1248-v7-collect.py','/tmp/t1248-restore-fresh-hook.js']:shutil.copyfile(f,out/Path(f).name)
print(json.dumps(proof,ensure_ascii=False))
