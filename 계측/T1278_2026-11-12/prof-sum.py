import json,sys,collections,glob,os
def one(f, roots):
  p=json.load(open(f)); nodes={n['id']:n for n in p['nodes']}; par={}
  for n in p['nodes']:
    for c in n.get('children',[]): par[c]=n['id']
  cnt=collections.Counter(p['samples']); tot=len(p['samples'])
  idle=sum(c for i,c in cnt.items() if nodes[i]['callFrame']['functionName'] in ('(idle)',))
  memo={}
  def anc(i):
    if i in memo: return memo[i]
    s=set(); j=i
    while j is not None: s.add(nodes[j]['callFrame']['functionName']); j=par.get(j)
    memo[i]=s; return s
  r={'file':os.path.basename(f),'samples':tot,'idle':idle}
  for R in roots: r[R]=sum(c for i,c in cnt.items() if R in anc(i))
  r['internalModuleStat']=sum(c for i,c in cnt.items() if nodes[i]['callFrame']['functionName']=='internalModuleStat')
  return r
d=sys.argv[1]; us=int(sys.argv[2])
roots=['tickCaravanBodies','_wwPre','_t1182Step','_wwIsStill']
rs=[one(f,roots) for f in sorted(glob.glob(d+'/prof/*.cpuprofile'))]
st=json.load(open(d+'/status.json'))
out={'run':os.path.basename(d),'intervalUs':us,'cpuSeconds':st['cpuSeconds'],'wallSeconds':st['wallSeconds'],'valid':st['valid'],'profiles':rs}
for R in roots+['internalModuleStat']:
  s=sum(x[R] for x in rs); out[R+'_min']=round(s*us/1e6/60,3)
  out[R+'_pctOfBusy']=round(100*s/sum(x['samples']-x['idle'] for x in rs),2)
print(json.dumps(out,ensure_ascii=False,indent=1))
