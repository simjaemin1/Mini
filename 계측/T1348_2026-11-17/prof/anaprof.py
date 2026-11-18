import json,sys,collections
f=sys.argv[1]; d=json.load(open(f))
nodes={n['id']:n for n in d['nodes']}
parent={}
for n in d['nodes']:
    for c in n.get('children',[]): parent[c]=n['id']
# sample counts per node
cnt=collections.Counter(d['samples'])
dt=d['timeDeltas']; tot=sum(dt)
# time per node: approximate by samples * avg interval
avg=tot/len(d['samples'])
def name(n): cf=n['callFrame']; return f"{cf['functionName'] or '(anon)'}:{cf['lineNumber']+1}@{cf['url'].split('/')[-1]}"
# find decision loop nodes: function named _decOne
target=sys.argv[2] if len(sys.argv)>2 else '_decOne'
ids=[i for i,n in nodes.items() if n['callFrame']['functionName']==target]
def incl(i):
    s=cnt[i]
    for c in nodes[i].get('children',[]): s+=incl(c)
    return s
total=sum(cnt.values())
print('total samples',total,'avg us',round(avg))
dec=sum(incl(i) for i in ids)
print(target,'incl',dec, round(100*dec/total,2),'%')
# children breakdown aggregated by name
agg=collections.Counter(); selfc=0; lines=collections.Counter()
for i in ids:
    selfc+=cnt[i]
    for pt in nodes[i].get('positionTicks',[]): lines[pt['line']]+=pt['ticks']
    for c in nodes[i].get('children',[]): agg[name(nodes[c])]+=incl(c)
print('self',selfc)
for k,v in agg.most_common(25): print(f'  {v:7d} {100*v/dec:5.1f}% {k}')
print('self lines', lines.most_common(15))
# second-level: under target -> child named sys.argv[3]
if len(sys.argv)>3:
    sub=sys.argv[3]; agg2=collections.Counter(); s2=0; ln2=collections.Counter(); tot2=0
    for i in ids:
        for c in nodes[i].get('children',[]):
            if nodes[c]['callFrame']['functionName']==sub:
                tot2+=incl(c); s2+=cnt[c]
                for pt in nodes[c].get('positionTicks',[]): ln2[pt['line']]+=pt['ticks']
                for g in nodes[c].get('children',[]): agg2[name(nodes[g])]+=incl(g)
    print('==',sub,'incl',tot2,'self',s2)
    for k,v in agg2.most_common(20): print(f'  {v:7d} {100*v/tot2:5.1f}% {k}')
    print('self lines', ln2.most_common(12))
