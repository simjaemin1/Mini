import json, glob, sys, statistics as S, collections
D=sys.argv[1]
def q(a):
    if not a: return '-'
    a=sorted(a); n=len(a)
    return f"n{n} 가운데 {a[n//2]:.0f} · 최소 {a[0]:.0f} · 최대 {a[-1]:.0f}"
for z in ['nippon','hanbando']:
    fs=glob.glob(f'{D}/lg-{z}-*.jsonl')
    for f in fs:
        L=[json.loads(l) for l in open(f) if l.strip()]
        B=collections.defaultdict(dict)
        rets=collections.Counter()
        for x in L:
            k=x.get('k')
            if x['op']=='ret': rets[k]+=1
            b=B[k]
            if x['op']=='ph' and x.get('ph')=='outbound' and x.get('atEnd')==1 and 'end' not in b: b['end']=x
            if x['op']=='arr' and 'arr' not in b: b['arr']=x
            if x['op']=='ph' and x.get('ph')=='linger' and 'lg' not in b: b['lg']=x
            if x['op']=='ph' and x.get('ph')=='inbound' and 'lg' in b and 'in' not in b: b['in']=x
        rows={'xz':collections.defaultdict(list),'same':collections.defaultdict(list)}
        for k,b in B.items():
            if not k or 'arr' not in b: continue
            g='xz' if k.startswith('xz:') else 'same'
            a=b['arr']
            mk=a.get('mk') or {}
            joined = 1 if (mk and mk.get('in')==1) else 0
            rows[g]['n'].append(1)
            rows[g]['joined'].append(joined)
            rows[g]['win'].append(a.get('win'))
            rows[g]['luE'].append(a['lu']-a['E'] if a.get('lu') is not None else None)
            if 'end' in b: rows[g]['standE'].append(a['E']-b['end']['E'])
            if 'lg' in b and 'in' in b: rows[g]['lingerV'].append(b['in']['V']-b['lg']['V'])
            if 'in' in b: rows[g]['afterClose'].append(max(0,(a.get('lu') or 0)-b['in']['E']))
        print(f"== {z} ({f.split('/')[-1]}) · ret 호출 {sum(rets.values())}")
        for g,r in rows.items():
            if not r['n']: continue
            lu=[x for x in r['luE'] if x is not None]
            print(f"  {g}: 도착 {len(r['n'])} · 장 명부 듦 {sum(r['joined'])} · 창 안 도착 {sum(1 for w in r['win'] if w)}")
            print(f"     머묾 끝 − 도착 econ 시계(ms): {q(lu)}")
            print(f"     길 끝 → econ 도착(선 채 기다림 · econ ms): {q(r['standE'])}")
            print(f"     'linger' 보인 가상 ms(머묾 → 귀환 첫 프레임): {q(r['lingerV'])}")
