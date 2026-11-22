import json, os, sys
D='/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438'
def show(t, s, watch=('임업5','농촌9','농촌10')):
    f=f'{D}/runs/{t}/{t}-{s}.json'
    if not os.path.exists(f): print(t, '—'); return
    j=json.load(open(f)); r={x[0]:x for x in j['rows']}; last=max(r)
    emp=[(j['names'][k], e) for k,e in enumerate(j['emptyDay']) if e is not None]
    print(f"{t:12s} d{last} pop {j['eight']['pop']} 빈 {emp} 죽음 {j['deadTot']}")
    for w in watch:
        if w in j['names']:
            k=j['names'].index(w); print('   ', w, [(d, r[d][1][k], r[d][3][k]) for d in (150,200,250,300,330,360,400) if d in r])
for t,s in [(a, int(a.split('_')[-1])) for a in sys.argv[1:]]: show(t, s)
