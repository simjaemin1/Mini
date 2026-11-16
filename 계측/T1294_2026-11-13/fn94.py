import json,sys
t=json.load(open(sys.argv[1]))
F=['decideNpcBehavior@zone.js','npcLifeTick@villages.js','computeNpcPath@zone.js','followNpcPath@zone.js','_t1294Arrived@zone.js','_t1181Step@villages.js','productionActsBound@economy-sim.js','_t340Try@villages.js','_t1294Cast@zone.js','_castTargetFor@zone.js','_lifeNeedClear@villages.js','_t1294NeedClear@villages.js','queryCircle@quadtree.js','zoneGameDay@zone.js']
rows={}
for r in t['runs']:
  L=r['lines']; inc={k:n for k,n,us in L['incl']}
  rows[r['tag']+' '+r['W']]={'step':L['stepUs'],'self':L['selfUs'],'n':L['stepSamples'],'pop':r['pop'],'tickP50':round(r['tickP50'],2),**{f:round(100*inc.get(f,0)/L['stepSamples'],2) for f in F}}
cols=list(rows)
print('npcStep 표본 %'.ljust(34)+''.join(c.rjust(11) for c in cols))
for f in ['step','self','n','pop','tickP50']+F: print(f[:33].ljust(34)+''.join(str(rows[c][f]).rjust(11) for c in cols))
