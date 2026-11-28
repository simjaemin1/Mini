import subprocess,json,datetime,gzip
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
files=['sim/economy-sim.js','sim/economy-sim-v2.js','sim/war-core.js','server/villages.js']
base='0e2ae3916acdb7380b7eb615a0f3c85d2b41f61d'
result={'base':base,'meaning':'Current source-line attribution, not proof that a number was first introduced by this commit. Older origin evidence must be traced separately.','files':{}}
for file in files:
 raw=subprocess.check_output(['git','blame','--line-porcelain',base,'--',file],cwd=repo,text=True)
 entries=[];current=None;commit=None;line=None;stamp=None
 for s in raw.splitlines():
  parts=s.split()
  if len(parts)>=3 and len(parts[0])==40 and all(c in '0123456789abcdef' for c in parts[0]):
   commit=parts[0];line=int(parts[2]);stamp=None
  elif s.startswith('author-time '):stamp=int(s.split()[1])
  elif s.startswith('\t'):
   entries.append([line,commit,datetime.datetime.fromtimestamp(stamp,datetime.timezone.utc).strftime('%Y-%m-%d') if stamp else None])
 result['files'][file]=entries
Path(__file__).with_name('line-provenance.json.gz').write_bytes(gzip.compress(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
print(json.dumps({f:len(v) for f,v in result['files'].items()}))
