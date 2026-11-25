#!/usr/bin/env python3
# 러너 밖: 원자료를 trial별 요약/압축. 역사값은 계산에 넣지 않는다.
import pathlib,json,gzip,sys,re,hashlib,platform
raw=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/var/tmp/t1490')
out=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else '계측/T1490_2026-11-26');out.mkdir(parents=True,exist_ok=True)
rows=[]; packed=[]
for done in sorted((raw/'done').glob('*.done')):
 tag=done.stem; kind,arm,k=tag.split('-'); text=(raw/'raw'/(tag+'.log')).read_text(errors='replace'); info=done.read_text()
 try: info=json.loads(info)
 except: info={'rc':int(info),'seconds':None}
 if not isinstance(info,dict): info={'rc':info,'seconds':None}
 obs=raw/'raw'/(tag+'.obs.jsonl'); events=[json.loads(l) for l in obs.read_text().splitlines()] if obs.exists() else []
 chats=[v for v in events if v.get('k')=='chat']; briefs=[v for v in events if v.get('k')=='msg' and v.get('type')=='village_brief']
 def category(press):
  if press.get('passed'):return 'npc_denied'
  if press.get('far'):return 'too_far'
  if any('꺼냈습니다' in str(n) for n in press.get('notices',[])):return 'withdraw_success'
  return 'unknown'
 chat=chats[2] if kind=='re' and len(chats)>=3 else chats[0] if chats else None
 wr=raw/'raw'/(tag+'.walk.json'); walk=json.loads(wr.read_text()) if wr.exists() else None
 if kind=='mem':
  match=re.search(r'^.*[✓✗].*⑦ 곳간.*$',text,re.M); line=match.group(0) if match else ''
  far='너무 멉니다' in line; passed=bool(match and '✓' in line)
 else:
  press=walk.get('press3' if kind=='re' else 'press1',{}) if walk else {}
  passed=press.get('passed',False);far=press.get('far',False)
 prior=[v for v in briefs if chat and v['t']<=chat['t']]
 row={'tag':tag,'kind':kind,'arm':arm,'trial':int(k),'rc':info.get('rc'),'seconds':info.get('seconds'),'passed':passed,'far':far,'observed':bool(chat),'cacheEmpty':chat is not None and chat.get('nearVid') is None,'body':chat,'briefBefore':len(prior),'briefBusyBefore':sum(v.get('busy') is True for v in prior),'briefBusyTotal':sum(v.get('busy') is True for v in briefs),'arrived':walk.get('arrived') if walk else None,'handlerChats':len(chats),'resultLine':line if kind=='mem' else press,'responses':{n:category(walk[n]) for n in ['press1','press2','press3','press4'] if walk and n in walk} if kind!='mem' else {'primary':'npc_denied' if passed else 'too_far' if far else 'unknown'},'requests':chats,'queuedBriefWrites':sum(v.get('k')=='set' and any('_drainVillageWaitQ' in s for s in v.get('stack',[])) for v in events)}
 rows.append(row); packed.append({'tag':tag,'done':info,'log':text,'observer':events,'walk':walk})
with gzip.open(out/'runs.jsonl.gz','wt') as f:
 for p in packed:f.write(json.dumps(p,ensure_ascii=False)+'\n')
summary=[]
for kind,arms,n in [('mem',['off','on'],40),('re',['off','on'],30),('walk',['on'],20)]:
 for arm in arms:
  a=[r for r in rows if r['kind']==kind and r['arm']==arm]
  summary.append({'kind':kind,'arm':arm,'planned':n,'completed':len(a),'passed':sum(r['passed'] for r in a),'far':sum(r['far'] for r in a),'missing':sum(not r['passed'] and not r['far'] for r in a),'handler':sum(r['observed'] for r in a),'emptyCache':sum(r['cacheEmpty'] for r in a),'busyBefore':sum(r['briefBusyBefore']>0 for r in a),'queueDrained':sum(r['queuedBriefWrites']>0 for r in a),'busyTotal':sum(r['briefBusyTotal']>0 for r in a),'rcNonzero':sum(r['rc']!=0 for r in a)})
(out/'trials.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
lines=['| 판 | 손잡이 | 완료/계획 | NPC권한거절(거리통과) | 거리오류 | 미판정 | handler | 표시 빔 | 누르기 전 busy brief | 전체 busy brief | 실제큐해제쓰기 | rc≠0 |','|---|---|---|---|---|---|---|---|---|---|---|---|']
for r in summary:lines.append('| '+ ' | '.join(str(r[k]) if k!='completed' else f"{r[k]}/{r['planned']}" for k in ['kind','arm','completed','passed','far','missing','handler','emptyCache','busyBefore','busyTotal','queueDrained','rcNonzero'])+' |')
(out/'table.md').write_text('\n'.join(lines)+'\n'); print('\n'.join(lines))
