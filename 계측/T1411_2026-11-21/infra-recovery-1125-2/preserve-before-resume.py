"""Preserve the sixth observed process-loss episode before the existing resume path."""
import gzip, hashlib, json, shutil
from pathlib import Path
from datetime import datetime, timezone

root=Path('/tmp/t1411'); repo=Path('/workspace/Mini')
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out=repo/'계측/T1411_2026-11-21/infra-recovery-1125-2'
archive=Path('/workspace/scratch/t1411/interruptions')/stamp
assert not out.exists() and not archive.exists()
live=[]
for proc in Path('/proc').iterdir():
    if not proc.name.isdigit(): continue
    try: argv=(proc/'cmdline').read_bytes().split(b'\0')
    except OSError: continue
    if any(x.startswith(b'/tmp/t1411/') and x.endswith((b'/server/zone.js', b'/scripts/t1308-long-run.js',b'/t1411-run.py')) for x in argv): live.append(proc.name)
    if any(x.endswith((b'scripts/t1411-campaign.py', b'scripts/t1411-watch.py', b'scripts/t1411-finish.py',b'scripts/t1411-reattach.py')) for x in argv): live.append(proc.name)
assert not live,live
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read(root/'candidate-manifest.json')
for name,digest in manifest['featureSource'].items():
    assert sha(root/'fast'/name)==sha(repo/name)==digest,name
for name,digest in manifest['methods'].items():
    assert sha(root/manifest['methodsVersion']/name)==digest,name
for name in ('ON-1020','OFF-1020'):
    assert not (root/'worlds'/(name+'.exit.json')).exists()
previous=read(root/'infrastructure-recovery.json')
out.mkdir(); archive.mkdir()
record=dict(kind='cloud-environment-interruption',observedEnvironmentPhase='starting -> ready; previous phase not observed in this turn',
    connectivityBeforeStartup='not observed',productExitObserved=False,archive=str(archive),previousInterruptionArchive=previous['archive'],cases={})
for f in ('campaign.json','candidate-manifest.json'):
    shutil.copyfile(root/f,archive/f)
shutil.copyfile(root/'campaign.json',out/'campaign-before.json')
for name in ('ON-1020','OFF-1020'):
    src=root/'worlds'/name; p=read(src/'progress.json');ck=p['ck']
    assert not p.get('done') and int((src/'ck/day').read_text())==ck
    assert p['env']['VILLAGE_NPC_CAP']=='Infinity' and p['env']['VILLAGE_DAY_MS']=='1440000'
    assert p['days']==730 and p['every']==10
    dest=out/name; dest.mkdir(); raw=archive/name;raw.mkdir()
    shutil.copy2(src/'progress.json',dest/'progress-before.json')
    shutil.copy2(src/'progress.json',raw/'progress-before.json')
    shutil.copy2(root/'worlds'/(name+'.launch.json'),raw/'launch-before.json')
    partial=[]
    for f in sorted(src.glob(f'seg-{ck}.*')):
        if not f.is_file(): continue
        shutil.copy2(f,raw/f.name)
        with f.open('rb') as source,gzip.open(dest/(f.name+'.gz'),'wb',compresslevel=5) as sink:shutil.copyfileobj(source,sink)
        with gzip.open(dest/(f.name+'.gz'),'rb') as check:assert hashlib.sha256(check.read()).hexdigest()==sha(f)
        partial.append(dict(file=f.name,sha256=sha(f),bytes=f.stat().st_size))
    binary=archive/'binary-checkpoints'/name
    shutil.copytree(src/'ck',binary)
    hashes={f.name:sha(f) for f in (src/'ck').iterdir() if f.is_file()}
    assert hashes=={f.name:sha(f) for f in binary.iterdir() if f.is_file()}
    lines=(src/f'seg-{ck}.json.t1274-days.jsonl').read_text().splitlines()
    ledger=[json.loads(line) for line in lines if line]
    assert all(r['day']>ck for r in ledger)
    record['cases'][name]=dict(checkpoint=ck,lastLoggedDay=max([ck]+[r['day'] for r in ledger]),cap=p['env']['VILLAGE_NPC_CAP'],partialFiles=partial,
        binaryCheckpointHashes=hashes,preservedBinaryCheckpoint=str(binary),discardedObservedLedgerDays=[r['day'] for r in ledger],
        discardedObservedLedgerCpuSeconds=sum(r['cpuSeconds'] for r in ledger),unobservedPartialCpuUnknown=True)
for dest in (out/'interruption.json',archive/'interruption.json',root/'infrastructure-recovery.json'):
    dest.write_text(json.dumps(record,ensure_ascii=False,indent=1))
shutil.copyfile(__file__,out/'preserve-before-resume.py')
print(json.dumps(dict(archive=str(archive),cases={n:{k:c[k] for k in ('checkpoint','lastLoggedDay','discardedObservedLedgerCpuSeconds')} for n,c in record['cases'].items()})))
