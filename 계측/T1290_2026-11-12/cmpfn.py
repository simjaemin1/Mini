import json,sys
t=json.load(open(sys.argv[1]))
F=['decideNpcBehavior@zone.js','npcLifeTick@villages.js','computeNpcPath@zone.js','queryCircle@quadtree.js','queryCircleScratch@quadtree.js','queryRect@quadtree.js','_qrInto@quadtree.js','_t1181Step@villages.js','_t1181Task@villages.js','productionActsBound@economy-sim.js','_t435Crew@villages.js','_t435CrewHas@villages.js','_t527Crew@villages.js','_t527CrewHas@villages.js','_t1214Crew527@villages.js','_t340Try@villages.js','_t312Catch@villages.js','drawWholeStock@fishing.js','_fishSave@zone.js','npcTotalKg@carry.js','zoneGameDay@zone.js','followNpcPath@zone.js','_lifeNeedClear@villages.js']
rows={}
for r in t['runs']:
  L=r['lines']; inc={k:(n,us) for k,n,us in L['incl']}
  key=r['tag']+' '+r['W']
  rows[key]={'step':L['stepUs'],'self':L['selfUs'],'n':L['stepSamples'],**{f:(round(100*inc[f][0]/L['stepSamples'],2) if f in inc else 0) for f in F}}
cols=list(rows.keys())
print('함수(npcStep 표본 %)'.ljust(34)+''.join(c.rjust(11) for c in cols))
for f in ['step','self','n']+F:
  print(f[:33].ljust(34)+''.join(str(rows[c][f]).rjust(11) for c in cols))
