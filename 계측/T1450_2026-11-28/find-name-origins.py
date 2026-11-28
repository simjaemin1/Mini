#!/usr/bin/env python3
"""Find earliest added declarations with these names in this base's file history.

This is a search aid, not proof of the first semantic introduction of a number.
Renames, earlier anonymous literals and copies in other files still need review.
"""
import datetime, hashlib, json, re, subprocess
from pathlib import Path

out=Path(__file__).resolve().parent; root=out.parent.parent
review=json.loads((out/'reviewed-policy-rows.json').read_text())
base=review['base']; wanted={}
for row in review['rows']:
    wanted.setdefault(row['file'],set()).add(row['name'].split('.')[0])
names=set().union(*wanted.values())
# All declarations in selected diffs are inspected, including multi-variable ones.
pattern='^[[:space:]]*(const|let|var)[[:space:]].*('+ '|'.join(sorted(names)) +')'
command=['git','log',base,'--reverse','--format=@@COMMIT@@%H%x09%aI%x09%s',
    '--no-ext-diff','--unified=0','-p','-G',pattern,'--',*wanted]
process=subprocess.Popen(command,cwd=root,text=True,stdout=subprocess.PIPE)
found={}; commit=stamp=subject=file=None
for raw in process.stdout:
    line=raw.rstrip('\n')
    if line.startswith('@@COMMIT@@'):
        commit,stamp,subject=line[len('@@COMMIT@@'):].split('\t',2)
    elif line.startswith('+++ b/'):
        file=line[len('+++ b/'):]
    elif line.startswith('+') and not line.startswith('+++') and file in wanted:
        added=line[1:]
        if not re.match(r'^\s*(?:const|let|var)\s+',added):continue
        for name in wanted[file]:
            key=file+'#'+name
            if key not in found and re.search(r'(?:\b(?:const|let|var)\s+|,\s*)'+re.escape(name)+r'\s*=',added):
                found[key]=dict(file=file,name=name,commit=commit,authorISO=stamp,
                    authorDateUTC=datetime.datetime.fromisoformat(stamp).astimezone(datetime.timezone.utc).date().isoformat(),
                    subject=subject,addedLine=added,addedLineSha256=hashlib.sha256(added.encode()).hexdigest())
assert process.wait()==0
shallow=subprocess.check_output(['git','rev-parse','--is-shallow-repository'],cwd=root,text=True).strip()
missing=sorted(file+'#'+name for file,names in wanted.items() for name in names if file+'#'+name not in found)
result=dict(base=base,shallow=shallow=='true',scope=__doc__.strip(),
    command=command,found=found,missing=missing)
(out/'name-origin-candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=1)+'\n')
print(json.dumps(dict(namedDeclarationsFound=len(found),notFound=len(missing),shallow=shallow=='true',worldsLaunched=0)))
