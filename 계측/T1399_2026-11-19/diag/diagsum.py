import json,sys,collections
for f in sys.argv[1:]:
    d=json.load(open(f)); ns=d['ns']; n=d['n']
    for ph in 'DN':
        tot=sum(v for k,v in ns.items() if k.startswith(ph+':'))
        cnt=sum(v for k,v in n.items() if k.startswith(ph+':'))
        print(f'== {f} {ph} total {tot/1e9:.2f}s bodies {cnt} avg {tot/max(cnt,1):.0f}ns')
        byrt=collections.Counter(); byjob=collections.Counter(); nrt=collections.Counter()
        for k,v in ns.items():
            if not k.startswith(ph+':'): continue
            job,rt=k[2:].split('|'); byrt[rt]+=v; byjob[job]+=v; nrt[rt]+=n[k]
        print('  route:', ' · '.join(f'{r} {v/tot*100:.1f}% ({nrt[r]} · {v/max(nrt[r],1):.0f}ns)' for r,v in byrt.most_common()))
        print('  job  :', ' · '.join(f'{j} {v/tot*100:.1f}%' for j,v in byjob.most_common(10)))
        # job x dec
        rows=collections.defaultdict(dict)
        for k,v in ns.items():
            if not k.startswith(ph+':'): continue
            job,rt=k[2:].split('|'); rows[job][rt]=(v,n[k])
        for j,_ in byjob.most_common(8):
            print('   ',j, ' '.join(f'{r}:{rows[j][r][0]/tot*100:.1f}%/{rows[j][r][1]}' for r in sorted(rows[j],key=lambda r:-rows[j][r][0])[:6]))
