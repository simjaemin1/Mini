"""Wait for the frozen validation runs; render actual results only. No commit/push."""
import hashlib,json,subprocess,time
from pathlib import Path
repo=Path('/workspace/Mini-t1496');out=repo/'계측/T1496_2026-11-27'
read=lambda p:json.loads(p.read_text())
while not (out/'body30-done.json').exists():
 rows=read(out/'body30-status.json')
 assert not any(r.get('exit',0)!=0 for r in rows),rows
 time.sleep(10)
assert read(out/'body30-done.json')['passed']==2
base=read(out/'off-baseline-result.json');assert base['exit']==0 and base['sourceUnchanged']
assert hashlib.sha256((repo/'server/villages.js').read_bytes()).hexdigest()==base['sourceSha256']
gates=read(out/'gates/done.json');assert gates['passed']==21 and gates['failed']==0 and gates['additionalPassed']==7 and gates['additionalFailed']==0
assert 'PASS 18 FAIL 0' in (out/'harness.txt').read_text()
old=(out/'old-code-red.txt').read_text();assert '빨강 1 · 크래시 0 · 초록 0 · 모름 0' in old
obs=read(out/'body-on-30-observed.json');assert not obs['errors']
assert obs['bodyTicks']>0 and obs['bodyWood']>0,('no real lumberjack work sample',obs)
for name,days in [('off-baseline',400),('wood-off-compare',30),('body-on-30-observed',30)]:
 text=(out/(name+'.txt')).read_text();assert f'경제 {days}/{days} · 생활층 {days}/{days}' in text,name
ci=read(repo/'scripts/ci-class.json')['rows']['test-t1496-body-first.js'];assert ci['core'] and len(ci['runs'])==5 and all(r['green'] for r in ci['runs'])
result=dict(card='T1496',sourceSha256=base['sourceSha256'],harness=dict(passCount=18,failCount=0,baits=2,oldCodeAssertionRed=1,oldCodeCrash=0),selected=gates,officialOffDays=400,woodActOffMatchedDays=30,bodyOnDays=30,observerInvariantDays=30,bodyObservation=obs,default='OFF',remoteCI='not verified')
(out/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=1))
p=repo/'보고/T1496_2026-11-27.md';s=p.read_text();lines=s.splitlines()
lines[0]=f"몸 먼저→일괄은 부족분만 · T1496_BODY_FIRST 끔 기본 · 새 하네스18/0·미끼2/2·옛 코드 빨강1/1(크래시0) · 영향21/0+보충7/0 · 끔400/400·나무켬/새끔30/30 같음 · 몸 세계30날 손 목재 증가{obs['bodyWood']:.6f}단·관찰 무변30/30 · 기근 직업 문 회부1"
s='\n'.join(lines)+'\n'
s=s.replace('- 검증: 최종 실행이 끝난 뒤 아래 표를 실제 결과로 갱신한다.', '- 검증: 아래는 모두 고정 소스로 끝난 실제 결과다. 계측기·실행 명령·원표는 같은 가지에 보존했다.')
s=s.replace('최종 결과 대기.', f"""| 검증 | 실제 결과 |
|---|---|
| 새 하네스 | 18 PASS / 0 FAIL, 새 모듈 캐시·실제 벌목/입고/마감 함수 |
| 파일 안 미끼 | 2/2: 제품 한 곳 변경 및 의도한 결과 단언 실패 확인 |
| 옛 제품 | 새 하네스 빨강1/1, 크래시0·초록0·모름0 |
| 최종 영향 목록 | 21종/21 초록, 보충7종/7 초록 |
| 다섯 규약 | 몸 필드·충돌 격자·hp 쓰기·현지 날·lint 초록 |
| 정본 끔 | 시드1020 400날, 경제400/400·생활층400/400·판JSON·여덟 수 같음 |
| 나무 행위 켬·새 손잡이 끔 | 옛 제품 대조30날, 경제30/30·생활층30/30·판JSON·여덟 수 같음 |
| 새 손잡이 켬 몸 세계 | 시드1020·몸∞·하루24분·집켬, 30날 완료 |
| 나무꾼 몸 관측 | 몸 틱{obs['bodyTicks']}, 손 목재 증가{obs['bodyWood']:.6f}단 |
| 같은 몸 세계 관찰기 무변 | 경제30/30·생활층30/30·판JSON·여덟 수 같음 |
| 번들→인라인→배선 | 통과·통과·실패0(기존 경고2) |
| CI 분류 | 새 하네스5/5 초록, core 등록·기존 core5잡/서버2잡 유지 |

[검증 요약](../계측/T1496_2026-11-27/verification.json) · [실행 명령·상태](../계측/T1496_2026-11-27/world-status.json) · [30날 몸 판](../계측/T1496_2026-11-27/body30-status.json) · [최종 끔 소스 해시](../계측/T1496_2026-11-27/off-baseline-result.json) · [원표·재현 자료](../계측/T1496_2026-11-27/README.md).

3날 몸 판도 정상 종료·관찰 무변3/3이었으나 나무꾼 몸 틱0이라 벌목 증거에서 뺐다. 이 때문에 같은 조건을30날로 넓혔다. 손 목재 증가는 실제 몸 틱 전후의 양수 차를 더한 관측이며, 세계 전체 입고량이나 인구 개선율이라는 뜻은 아니다. 단위 하네스가 실제 몸 벌목→입고→일괄 부족분→다음 날 열림과 손/짐 보존을 별도로 검증한다.

정본400날은 최종 소스 해시를 실행 전후 확인해 다시 돌린 결과다. 경계 검사 보완 전의 첫400날 통과와 초기 소스 검사 빨강은 history-initial에 남겼다. 원격 Actions는 확인하지 못했으며 로컬 초록과 구분한다.
""")
s=s.replace('몸 없는 일꾼의 기존 명부와 하루 한도는 유지한다.', '기존 명부·관측 마을 제한·하루 걸음 한도 안에서만 몸 없는 일꾼의 부족분을 낸다.')
p.write_text(s.rstrip()+'\n')
(out/'README.md').write_text("""# T1496 실제 검증 자료

검증 집계는 verification.json, 고정 제품/하네스 해시는 manifest.json, 초기 영향 목록과 최종21종 목록은 touched-plan*.json이다. gates/에는 최종21종·보충7종의 실제 로그/종료 코드가 있고 history-initial/에는 보완 전 빨강을 구분했다. 데이터는 서로 다른 판을 섞어 평균내지 않았다.

- off-baseline-result.json/off-baseline.txt: 최종 소스의 정본1020/400날 끔 바이트 동일.
- wood-off-base.json/wood-off-compare.txt: 나무 행위 켬·새 손잡이 끔의 옛 제품 대조30날. base-hook.cjs는 기준 커밋의 villages.js만 읽어 올린다. 다른 제품은 같은 트리다.
- body-on-plain.json/body-on-observed.*:3날 몸 세계. 실제 나무꾼 몸 표본0이라 벌목 증거로 쓰지 않았다.
- body-on-30-plain.json/body-on-30-observed.*: 같은 몸∞·24분·집켬 조건의30날 판. 관찰기 무변30/30과 실제 손 목재 증가를 확인했다.
- body30-status.json/world-status.json: 실제 명령·지정 손잡이·종료 코드·걸린 시간. 경과시간을 CPU 절감률로 해석하지 않는다.
- observe.cjs는 제품 반환값을 유지하고 별도 관측 객체만 센다. 생존/직업/이동 값을 바꾸지 않는다.
- ci-measure.txt와 scripts/ci-class.json의 행은 최종 새 하네스5회 실측이다. 원격 Actions 초록 주장은 없다.

재현은 Node22.23.0/ABI127에서 한다. world-checks.py/body30.py/final-default.py에 명령이 있다. 옛 소스는 `git show 2ce164b94:server/villages.js > /tmp/t1496-base-villages.js`로 준비하고 계측기의 경로를 현재 작업 트리에 맞춘다. TMP의 관찰기 파일은 이 폴더의 사본과 같다. 긴 판은 끝 표시 JSON을 보고 재실행 여부를 판단하며 완료된 판을 덮지 않는다.

제품은 server/villages.js 한 파일이며 새 저장 필드는 없다. 기근 직업 문 자체·어부 길·기본 켬 채택은 이번 결과로 판정하지 않는다.
""")
print(json.dumps(dict(ready=True,observation=obs),ensure_ascii=False))
