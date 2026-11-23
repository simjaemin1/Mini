import json,sys,glob
for t in sys.argv[1:]:
    j=json.load(open(f'runs/{t}/{t}-1020.json.t1404.json')); w=j.get('warEcon') or {}; wl=(j.get('war') or {}).get('stat') or {}
    rj=None
    for f in glob.glob(f'runs/{t}/*.json'):
        if f.endswith('.t1404.json'): continue
        try: rj=json.load(open(f))
        except Exception: pass
    ix={k:i for i,k in enumerate(j['wcols'])}; last=j['w'][-1]
    bx=(rj or {}).get('bodyExit') or {}
    died=(bx.get('died') or {}) if isinstance(bx,dict) else {}
    print(t, dict(날=last[ix['day']], 인구=last[ix['pop']], 선포=w.get('decl'), 전투=w.get('battle'), 공승=w.get('atkWin'), 방승=w.get('defWin'), 사상=w.get('cas'), 포로=w.get('captured'), 돌격=w.get('assault'), 철수=w.get('withdraw'), 항복=w.get('surrender'), 교전=wl.get('engage'), 대치=wl.get('standoff'), 궤주정산=wl.get('rout'), 몸전사=died.get('war'), 몸죽음=died))
