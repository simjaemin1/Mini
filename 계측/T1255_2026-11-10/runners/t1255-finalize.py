from pathlib import Path
import subprocess,json,hashlib
r=Path('/workspace/Mini-T1255');out=r/'계측/T1255_2026-11-10'
subprocess.run(['python3','/tmp/t1255-collect.py'],cwd=r,check=True)
a=json.loads((out/'comparison.json').read_text());old=a['metrics']['off_old'];new=a['metrics']['make_new'];seeds=['1020','7','42']
changed=sum(not(q['sameDaily']==400 and q['sameRunHash']and q['sameEight']and q['sameSide']and q['sameEmpty'])for q in a['oldVsNew'].values())
fmt=lambda x:f'{x:,.3f}'
rows=['| 시드 | 인구 옛→새 | 빈 마을 옛→새 | 굶음(FD사망) 옛→새 | 곳간 kcal 옛→새 | 추상 고기400일(econ 단위) 옛→새 |','|---|---:|---:|---:|---:|---:|']
for s in seeds:
 x,y=old[s],new[s];rows.append(f"| {s} | {x['population']}→{y['population']} | {x['empty']}→{y['empty']} | {x['fdDeaths']}→{y['fdDeaths']} | {fmt(x['foodKcal'])}→{fmt(y['foodKcal'])} | {fmt(x['legacyMeatEconUnits400'])}→{fmt(y['legacyMeatEconUnits400'])} |")
rows+=['','| 살아 있는 종 | 1020 옛→새 | 7 옛→새 | 42 옛→새 |','|---|---:|---:|---:|']
ids=sorted(set(['water_deer']).union(*(set(m[s]['mobsAlive'])for m in [old,new]for s in seeds)))
names=json.loads(subprocess.check_output(['/workspace/.tools/node-v22.23.0-linux-x64/bin/node','-e',"const A=require('./server/animals');console.log(JSON.stringify(Object.fromEntries(Object.entries(A.ANIMALS).map(([id,a])=>[id,a.ko]))))"],cwd=r,text=True))
for sp in ids:rows.append('| '+names.get(sp,sp)+' (`'+sp+'`) | '+' | '.join(f"{old[s]['mobsAlive'].get(sp,0)}→{new[s]['mobsAlive'].get(sp,0)}"for s in seeds)+' |')
maxChunks=max(v['maxActiveChunks']for m in [old,new]for v in m.values());wildticks=max(v['wildlifeTicks']for m in [old,new]for v in m.values());peak=max(v['waterDeerPeakDaily']for m in [old,new]for v in m.values())
coverage=f'이 표준판400일×3시드에서 활성 청크 최대 **{maxChunks}**, 야생 블록 틱 최대 **{wildticks}**, 고라니 일별 최대 **{peak}**였다. 손님0·몸 상한1인 기존 판의 뷰 조건을 유지한 결과다. 기본 켬 술어가 참이어도 이 판은 고라니가 서는 실제 AOI를 검출하지 못했다. 이 한계는 후보 채택 자료에 남긴다.'if maxChunks==0 else f'표준판 활성 청크 최대 {maxChunks}, 야생 블록 틱 최대 {wildticks}, 고라니 일별 최대 {peak}였다. 종별 전체 원값은 comparison.json에 보존했다.'
finding='세 시드 모두 기존 econ400일·곁 칸400일·판 JSON·여덟 수가 같았다. 고라니 이외의 수치 변화도 없었다. 이 결과는 고라니의 실제 AOI 영향과 실제 시계/가상 시계 동등성을 검증한 결과가 아니다. 시계 동등성은 T1253 범위다.'if changed==0 else f'기존 기준선과 바뀐 시드는 {changed}개다. 원문 일치 여부와 끝 수치는 comparison.json에 필드별로 남겼다. 고라니 외 변화의 직접 원인 분해는 추가 관측이 필요하며 채택 판정에 포함한다.'
s=Path('/tmp/T1255_REPORT_DRAFT.md').read_text();values={'MAKE':'완료','POP_TOTAL':format(sum(v['population']for v in new.values()),','),'DEER_TOTAL':str(sum(v['waterDeerAlive']for v in new.values())),'DIFF_SEEDS':str(changed),'OFF':'3','REP1':'3','REP2':'3','LAB':'5,929','REFERRALS':'3','METRICS_TABLE':'\n'.join(rows),'COVERAGE':coverage,'FINGERPRINT_FINDING':finding,'POP_LIST':' · '.join(format(new[x]['population'],',')for x in seeds)}
for key,value in values.items():s=s.replace('{{'+key+'}}',value)
assert '{{'not in s
(r/'보고/T1255_2026-11-10.md').write_text(s)
assert not subprocess.check_output(['git','diff','bc096dc9','--','README.md','인계/공통.md'],cwd=r)
for f,sha in a['sourceSHA256'].items():assert hashlib.sha256((r/f).read_bytes()).hexdigest()==sha
shutilSource=Path('/tmp/t1255-finalize.py');(out/'runners/t1255-finalize.py').write_bytes(shutilSource.read_bytes())
(out/'README.md').write_text('''# T1255 기준선 후보 증거

`comparison.json`: 구/신 세 시드400일 지문과 인구·굶음·짐승·열량·추상 고기 비교. `make_new/`와 `repeat1/`, `repeat2/`는 서로 다른 새 DB 실행이다. 실제 존 종료는 각 `.t1255-exit.json.gz`, 부모 종료는 controller/exit.json.gz.

`section0/`: T1246 두 가지 원값·diff·세 게이트 메모리 대조. `checks/`: 고라니38/38·기존 몸 필드7/3·t17 5,929·관측기 무간섭 자료.

종별 kg는 실물 사냥 경로가 꺼진 표준판에서 미산출이다. 추상 고기 econ 단위를 물리 kg로 바꾸지 않았다. 고라니 실제 AOI 검출 범위와 몸 필드 기존 빨강을 보고서에서 확인한다. 후보 채택은 재민 판정이다.
''')
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest()for p in out.rglob('*')if p.is_file()and p.name!='manifest.json'};(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['git','diff','--check'],cwd=r,check=True)
print(s.splitlines()[0]);print('evidence files',len(manifest))
