import json,subprocess,sys
S=json.load(open('out/sum.json')); OFF=json.load(open('/root/wt/r1431/out/sum.json'))
E=json.loads(subprocess.run(['python3','enc.py']+sys.argv[1:],capture_output=True,text=True).stdout)
for t in sys.argv[1:]:
    seed=t.split('_')[1]; d=json.load(open(f'runs/{t}/{t}-{seed}.json.t1404.json')); st=(d.get('t1459') or {}).get('st') or {}
    x=S.get(t,{}); o=OFF.get('OFF_'+seed,{}); b=OFF.get('B_'+seed,{}); e=E[t]
    kg=st.get('kg',0)
    print(t, dict(만남=e['n'], 혼자=e['e0'], 싸움=e['eFight'], 호위이김=e['win'], 짐잃음=e['lost'], 쓰러짐=(e['escD'],e['banD'],e['trD']), 더미=st.get('piles'), 놓인kg=round(kg), 주움pct=round(100*st.get('pickKg',0)/kg,1) if kg else None, 땅pct=round(100*st.get('leftKg',0)/kg,1) if kg else None, 먼지=round(st.get('dust',0),1), 땅꾸러미=st.get('leftItems'), 남=st.get('goneOther'), 청소=st.get('goneClean'), 몸없음=st.get('ledger'), 늦음=st.get('late'), 환산식량=round(st.get('fenceFood',0)), 인구=x.get('popEnd'), 끔비=round(x.get('popEnd',0)/o.get('popEnd',1),3) if o else None, T1431끔비=round(b.get('popEnd',0)/o.get('popEnd',1),3) if b else None, 빈마을=x.get('empty'), T1431빈=b.get('empty'), 단수명=x.get('gangLife'), T1431단수명=b.get('gangLife'), 굶음해산=x.get('gStarve'), 힙=x.get('heapPeak'), T1431힙=b.get('heapPeak'), 털림=x.get('raided'), T1431털림=b.get('raided'), 날=x.get('day')))
