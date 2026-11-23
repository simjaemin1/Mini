import re, sys, os
D='/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438/ev'
def summ(name):
    p=os.path.join(D,name)
    if not os.path.exists(p): return None
    t=open(p).read(); cur=None; res={}
    for line in t.splitlines():
        m=re.match(r'^##### (\S+) #####', line)
        if m: cur=m.group(1); continue
        m=re.search(r'([✓✗]) RC=(\d+)', line)
        if m and cur: res[cur]=(m.group(1)=='✓', int(m.group(2)))
    tot=re.search(r'걸린 시간 합: 하네스 (\d+)초', t)
    red=[k for k,v in res.items() if not v[0]]
    return dict(n=len(res), green=sum(1 for v in res.values() if v[0]), red=red, secs=int(tot.group(1)) if tot else None)
for n in ['하네스_만진.txt','하네스_core.txt','하네스_srv.txt','하네스_그림.txt','하네스_다시.txt','하네스_다시2.txt']:
    print(n, summ(n))
