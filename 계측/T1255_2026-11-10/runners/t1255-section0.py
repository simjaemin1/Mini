from pathlib import Path
import subprocess,json,gzip,shutil,hashlib
r=Path('/workspace/Mini-T1255');d=r/'계측/T1255_2026-11-10/section0';d.mkdir(parents=True,exist_ok=True)
refs={'landed':'419049de','review':'2036ff57'}
def git_json(ref,p):
 b=subprocess.check_output(['git','show',ref+':'+p],cwd=r);return json.loads(gzip.decompress(b)if p.endswith('.gz')else b)
rows=[]
for seed in [1020,7,42]:
 a=git_json(refs['landed'],f'계측/T1246_2026-11-10/after/{seed}.json.gz');b=git_json(refs['review'],f'계측/T1246_2026-11-10/after/1-{seed}.world.json.gz');c=json.loads(Path(f'/tmp/t1255-food-controls/revert{seed}/world.json').read_text())
 rows.append({'seed':seed,'days':800,'landedPop':a['base']['pop'],'reviewPop':b['base']['pop'],'landedEmpty':a['base']['dead'],'reviewEmpty':b['base']['dead'],'reviewThreeGatesRevertedPop':c['base']['pop']})
baseFiles=['sim/economy-sim.js','sim/economy-sim-v2.js','server/villages.js','server/granary-lots.js','server/kcal.js','scripts/t176-ab.js','scripts/t17-metrics.js']
assert not subprocess.check_output(['git','diff','675f54a8','87b63d2c','--',*baseFiles],cwd=r)
x=json.loads(Path('/tmp/t1255-food-controls/review1020/world.json').read_text());y=git_json(refs['review'],'계측/T1246_2026-11-10/after/1-1020.world.json.gz');assert all(x[k]==y[k]for k in ['base','eight','vpop'])
summary={'refs':refs,'bases':{'landed':'87b63d2c','review':'675f54a8'},'baseFilesIdentical':baseFiles,'seeds':[1020,7,42],'days':800,'offPopTotal':18742,'rows':rows,'totals':{'landed':10417,'review':8690,'threeGatesReverted':sum(z['reviewThreeGatesRevertedPop']for z in rows)},'reviewFresh1020BaseEightVpopExact':True,'intervention':'cookTarget food8day, _lifeNeedClear food120day, _lifeGranAdd stock target; 3 memory-only reversions together, not independent single-gate estimates','remainingDifference':'Three reversions do not reproduce landed world; remaining code/cached-input interactions not isolated. No T1246 code imported into T1255.','priceStatisticDifference':{'landed':'800day village-day mean 375.04','review':'day800 population-weighted mean 387.99'},'probesCaveat':'Without-village production API differs for foxtail millet and soybean; main production calls pass v, so this probe alone is not the measured population cause.'}
(d/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(d/'branches-code.diff').write_bytes(subprocess.check_output(['git','diff',refs['landed'],refs['review'],'--','sim/economy-sim.js','sim/economy-sim-v2.js','server/granary-lots.js','server/villages.js'],cwd=r))
for f in ['t1255-food-probe.js','t1255-food-three-gates.js','t1255-food-control.py','t1255-landed-food-probe.json','t1255-review-food-probe.json']:shutil.copyfile('/tmp/'+f,d/f)
for case in Path('/tmp/t1255-food-controls').iterdir():
 if not case.is_dir():continue
 out=d/case.name;out.mkdir(exist_ok=True)
 for f in case.iterdir():
  if f.suffix in ['.json','.log']:
   with gzip.open(out/(f.name+'.gz'),'wb')as g:g.write(f.read_bytes())
print(json.dumps(summary,ensure_ascii=False,indent=2))
