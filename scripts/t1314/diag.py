# T1314 진단 — 몸통 자기 줄 · 생활층 줄 µs 를 줄마다 그 줄이 짚는 몸(npc.) · 마을(vil.) 칸으로 (t646 table.json 판 여럿 평균)
import json,sys,re,collections
tab=json.load(open(sys.argv[1])); src={'zone.js':open(sys.argv[2]).read().split('\n'),'villages.js':open(sys.argv[3]).read().split('\n')}
tags=sys.argv[4].split(',')
def fields(line,obj): return sorted(set(re.findall(r'\b'+obj+r'\.([A-Za-z_]\w*)',line)))
for W in ('night','day'):
    runs=[r for r in tab['runs'] if r['tag'] in tags and r['W']==W]
    acc=collections.defaultdict(float); deep=collections.defaultdict(float); st=0
    for r in runs:
        L=r['lines']; st+=L['stepUs']/len(runs)
        for ln,n,us in L['selfAll']: acc[ln]+=us/len(runs)
        for k,n,us in L['deepTop']:
            m=re.match(r'(.+)@(\w+\.js):(\d+) #(\d+)',k)
            if m and m.group(2)=='villages.js': deep[int(m.group(4))]+=us/len(runs)
    tot=sum(acc.values())
    print(f'\n### {W} — 판 {",".join(tags)} 평균 · npcStep {st:.3f} µs · 몸통 자기 줄 합 {tot:.3f} µs')
    print('| 줄 | µs | 몸 칸(npc.) | 줄 |'); print('|---:|---:|---|---|')
    allF=collections.Counter()
    for ln,us in sorted(acc.items(),key=lambda x:-x[1])[:14]:
        t=src['zone.js'][ln-1]; f=fields(t,'npc')
        for x in f: allF[x]+=us
        print(f'| {ln} | {us:.3f} | {" · ".join(f) or "—"} | `{t.strip()[:90].replace("|","/")}` |')
    print(f'\n생활층(villages.js 깊은 줄) 위 10:'); print('| 줄 | µs | 몸 칸 | 마을 칸 |'); print('|---:|---:|---|---|')
    for ln,us in sorted(deep.items(),key=lambda x:-x[1])[:10]:
        t=src['villages.js'][ln-1]
        print(f'| {ln} | {us:.3f} | {" · ".join(fields(t,"npc")) or "—"} | {" · ".join(fields(t,"vil")) or "—"} |')
