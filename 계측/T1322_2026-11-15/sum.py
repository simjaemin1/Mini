import json,sys,collections
S=json.load(open(sys.argv[1]))
def agg(pred):
    T=collections.Counter(); K=collections.Counter(); J=collections.defaultdict(collections.Counter)
    for k,v in S.items():
        w,job=k.split('|',1); w=int(w)
        if not pred(w): continue
        for f in ['n','gate','noop','ts','tsStill','other','moved','v0']: T[f]+=v[f]; J[job][f]+=v[f]
        for kk,c in v['keys'].items(): K[kk]+=c
    return T,K,J
for name,pred in [('day(phase .10±)',lambda w: w in (1,2,3)),('night(phase .70+)',lambda w: w>=14),('all',lambda w: True)]:
    T,K,J=agg(pred)
    if not T['n']: continue
    n=T['n']; pc=lambda x: '%.1f%%'%(100*x/n)
    print(f"== {name}: steps {n} · 결정문 열림 {pc(T['gate'])} · 무동작(관측칸만) {pc(T['noop'])} · 시각칸만 {pc(T['ts'])} (그중 안 움직임 {pc(T['tsStill'])}) · 그 밖 {pc(T['other'])} · 지난 걸음 뒤 움직임 {pc(T['moved'])} · 속도0 {pc(T['v0'])}")
    for job,v in sorted(J.items(), key=lambda x:-x[1]['n'])[:12]:
        m=v['n']; print(f"   {job:12s} n{m:7d} 열림 {100*v['gate']/m:5.1f}% 무동작 {100*v['noop']/m:5.1f}% 시각만 {100*v['ts']/m:5.1f}% 그밖 {100*v['other']/m:5.1f}%")
    print('   막는 쓰기(그 밖 갈래 키 묶음) 상위:')
    for kk,c in K.most_common(14): print(f"     {100*c/n:5.1f}%  {kk}")
