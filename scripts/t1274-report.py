"""Render T1274 only from completed, validated measurements."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1];O=R/'계측/T1274_2026-11-12'
x=json.loads((O/'summary.json').read_text());A=x['arms'];F=x['fast'];rat=x['bodyRatios']
names={'OFF':'끔','WOOD':'나무꾼만','TERR':'v2만','V2_WOOD':'묶음'}
fmt=lambda n:f'{n:,.1f}'
pct=lambda n,d:f'{100*n/d:.1f}%' if d else '—'
cpu=' / '.join(f'{A[a]["cpu"]["meanDays2ToEnd"]:.1f}' for a in names)
same=all(d['sameDirection'] for d in x['directions'].values())
effect=x['clockJointEffect'];old=effect['oldClockPopulation'];delta=effect['difference']
L=[f'몸 세계 100날 끔비 — 묶음 {rat["V2_WOOD"]:.3f} · v2만 {rat["TERR"]:.3f} · 나무꾼만 {rat["WOOD"]:.3f}(빠른 판 1.184 · 0.743 · 0.784) · 방향 같음 {"○" if same else "✗"} · 시계 고침 몫 {delta:+}명({100*delta/old:+.3f}%·둘 합) · 하루 CPU {cpu}초(끔/나무꾼/v2/묶음·2~100일 평균) · 끈 판 1/1 · 회부 켬 기본은 재민 판정',
'', '# T1274 — 나무꾼+영토 v2, 몸 전부·라이브 비율 100일 (2026-11-12 시작 · GPT 1)', '',
'`[승인 대기 · T1274]` · 가지 `batch/wood-v2-body-1112` · 베이스 `a6b7aba5`(land1068) · 제품 변경 0 · 판정 0.', '',
'계측 완료: 2026-11-13 09:32 KST(감독 기록 UTC 00:32:06).', '',
'묶음은 인구 +39.2%, 2~100일 평균 CPU +70.6%(끔 대비)다. 다만 이탈 누계는 193 대 6이고, 묶음의 주민 몸/인구 최솟값은94.42%다. 영토 두 판의 실제 몸 완공 카운터는 모두0이며 비관측 일괄 경로를 포함한다. 이 조건과 한 시드·100일 범위를 함께 재민 판정에 회부한다.', '',
'## 1. 실제 100일 네 판', '',
'시드1020, 51마을의 새 세계. 마을 주민 몸 상한 없음, 하루1,440,000ms의 운영 비율, T745 가상 스케줄러. 집 행위0·캐러밴 상한0·밭 묶음0은 T1244/T1251 판 꼴 그대로다. `T1259_WOOD_CAP=0`을 전부 명시했다. OFF+WOOD, TERR+V2_WOOD를 둘씩 실행했다.', '',
'| 팔 | 실제 끝 인구 | 끔비 | T1264 빠른400 끔비 | 빈 마을 | 식량 빚 사망 | 주민 몸 아사 | 몸 노화 사망 | 관측 신규 주민 | 이탈 누계 |',
'|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for a,v in A.items():
 r=v['final'];rr=1 if a=='OFF' else rat[a];ref=1 if a=='OFF' else x['directions'][a]['referenceFast400Ratio']
 L.append(f'| {names[a]} | {v["population"]:,} | {rr:.3f} | {ref:.3f} | {r["empty"]} | {r["debtDeaths"]} | {r["bodyStarve"]} | {r["bodyExit"]["died"]["old"]} | {r["bornCumulative"]} | {r["emigrationCumulative"]} |')
L+=['', '주민 몸/인구의 일별 최솟값은 ' + ' · '.join(f'{names[a]} {100*v["bodyCoverage"]["minimumBodyToPopulationRatio"]:.2f}%(최대 인구−몸 {v["bodyCoverage"]["maxPopulationMinusBodies"]}명)' for a,v in A.items()) + '이다. 몸 상한 Infinity는 실행 조건이며, 각 경계의 실제 몸 수를 인구와 같다고 강제하지 않았다. 퇴장·동기화 등의 native 경로를 그대로 재며 차이의 원인을 하나로 단정하지 않는다.', '', '식량 빚 사망(`_fdDeadTot`)과 몸 아사(`bodyExit.died.starve`)는 별개 기록이며 서로 더하지 않는다. 신규 주민은 econ 틱 앞뒤 객체 차라는 관측 정의다. 이탈·외부 유입이 있어 출생−사망만으로 끝 인구를 분해하지 않는다. 켬 기본은 인구뿐 아니라 사망·이탈·빈 마을과 아래 관측 범위를 함께 보고 재민이 판정한다.', '',
'## 2. 10일 간격 — ledger 끝 상태', '',
'출생·이탈·벌목·입고·모델 몫은 앞10일 값이다. 식량 빚/몸 아사·말뚝·영토 완료·새 집 칸은 누계, 재고·영토·밭·주거는 그날 값이다. CPU는 앞10일 평균이며 첫 구간에 기동이 포함된다. `새 집 칸`은 최초 econ 틱 전 좌표 이외에 처음 더 관측한 완공 집 좌표이며, 같은 자리 재건 횟수는 아니다.', '']
for a in names:
 L += [f'### {names[a]}', '',
 '| 날 | 인구 | 주민 몸 | 빈 마을 | 신규 주민10일 | 이탈10일 | 식량 빚 사망누계 | 몸 아사누계 | CPU초/일 |',
 '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
 for r in x['tenDayTables'][a]:
  L.append(f'| {r["day"]} | {r["population"]:,} | {r["bodies"]:,} | {r["empty"]} | {r["birth10"]} | {r["emigration10"]} | {r["debtDeathsCumulative"]} | {r["bodyStarveCumulative"]} | {r["cpuMean10"]:.1f} |')
 L+=['', '| 날 | 영토 칸 | 밭 칸(순증) | 통나무 막힘 | 벌목반환10일 | 행위입고10일 | econ잠재몫10일 | 목재 재고 | 말뚝목재누계 | 개간후영토칸(몸) | 새 집 칸누계 | 주거 |',
 '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
 for r in x['tenDayTables'][a]:
  t=r['territoryCost'];L.append(f'| {r["day"]} | {r["territory"]:,} | {r["farm"]:,} ({r["farmNetNewCells"]:+}) | {pct(t["stallWood"],t["days"])} ({t["stallWood"]}/{t["days"]}) | {fmt(r["felledWood10"])} | {fmt(r["acceptedBodyWood10"])} | {fmt(r["modelWoodD10"])} | {fmt(r["woodStock"])} | {fmt(t["wood"])} | {t["cells"]:,} ({t["body"]:,}) | {r["newHouseCellsCumulative"]} | {fmt(r["housing"])} |')
 L+=['']
L+=['벌목반환은 정본 나무 베기 창구의 `loot.wood` 합으로 개간 등 같은 창구의 작업도 포함한다. 행위입고는 정산 전 inflow 누계와 마지막 미정산 inflow를 합한 정본 입구 값이며 나무꾼·개간이 함께 들어간다. econ 잠재몫은 현재 틱의 `_woodOutLast` 합이다. 세 수와 재고 증감을 같다고 가정하지 않는다. 기존 T1251 시점(이전 틱 모델 몫/정산 앞 입구)도 원문으로 남겼다.', '',
'개간후영토칸은 `_t1207.cells`로, 개간·말뚝을 마쳐 영토가 된 누계다. 괄호는 그중 native 몸 완료(`body`)다. 개간 중·말뚝 대기 칸의 총수는 별도 수집하지 않았으며, 밭 칸 순증을 그 수로 대신하지 않았다. 주민 몸 상한을 없애도 영토 과업은 관측자 여부를 따른다. 정본 `_t1207Pay`는 `_t449Seen`일 때 실제 일감 줄, 그 밖의 v2는 `_t1238Batch`를 고른다. 이 판에는 사람 관측자를 더하지 않았다. 따라서 이 표의 native `body`와 전체 `cells`를 함께 읽어야 하며, 주민 몸이 있는 판의 결과를 관측자 근처 영토 실제 과업의 검증으로 확대하지 않는다. v2 일괄의 전역 `bodyCells`는 그 이름만으로 물리 완공 증거가 아니다. 밭의 순증·지도 새 집·추상 주거도 각각 다른 수다.', '',
'## 3. 하루 CPU와 몸 수', '',
'![일별 CPU와 주민 몸](../계측/T1274_2026-11-12/daily-cpu.png)', '',
'| 팔 | 기동 포함 첫 경계 CPU초 | 2~100일 평균초 | 중앙초 | 가장 큰 날·CPU초 | ledger100까지 CPU분 |',
'|---|---:|---:|---:|---:|---:|']
for a,v in A.items():
 c=v['cpu'];L.append(f'| {names[a]} | {c["firstBoundaryIncludingStartup"]:.1f} | {c["meanDays2ToEnd"]:.1f} | {c["medianDays2ToEnd"]:.1f} | {c["maxDay"]}일 · {c["maxDaySeconds"]:.1f} | {c["sumThroughLastLedger"]/60:.1f} |')
L+=['', '매일의 원값은 `daily.csv`와 각 판의 `*.t1274-days.jsonl.gz`다. zone 프로세스의 사용자+시스템 CPU, 여러 스레드와 관찰 비용을 포함한다. Python monotonic 실제 경과와 구분하며 가상 hrtime/Date를 실제 CPU로 쓰지 않았다. CPU 차이는 각 판의 인구·몸·행동량도 다른 관측값이며 같은 부하의 알고리즘 속도 비교가 아니다.', '',
'## 4. 빠른 판·기간·시계 고침 대조', '',
'T1264 참고는 고정 베이스05b66c73의 빠른400일, 이번 몸 판은a6b7aba5의100일이다. 같은 a6b7aba5에서 빠른 묶음도 새로 재고, 같은400일 러너의100일 지점 인구도 읽어 기간 차이를 보조로 분리했다.', '',
'| 판 | 기간 | 끔 | 묶음 | 끔비 |', '|---|---:|---:|---:|---:|']
m=x['matchedHorizon100']
L += [f'| 현재 몸 판 | 실제100일 종료 | {m["bodyOff"]:,} | {m["bodyCombined"]:,} | {m["bodyRatio"]:.3f} |',
 f'| 현재 같은 소스 빠른 판 | 실제400일 중100일 지점 | {m["fastOff"]:,} | {m["fastCombined"]:,} | {m["fastRatio"]:.3f} |',
 f'| 현재 같은 소스 빠른 판 | 실제400일 종료 | {F["OFF_GATE"]["population"]:,} | {F["FAST_CURRENT"]["population"]:,} | {x["fastCurrentRatio"]:.3f} |',
 '| T1264 참고(05b66c73) | 실제400일 종료 | 3,914 | 4,636 | 1.184 |', '',
 f'두 시계 손잡이만0으로 둔 현재 소스 빠른 묶음은 **{old:,}명**, 둘을1로 둔 묶음은 **{effect["currentPopulation"]:,}명**이다. 고침의 합친 차이는 **{delta:+}명({100*delta/old:+.3f}%)**다. 다른 판 조건·소스는 같다. T1253과T1258 각각의 몫은 나누지 않았다. 모든 수는 실제400일 완주이며400일 외삽이 아니다.', '',
'## 5. 방향과 마을 차이', '',
f'T1264 빠른400일 대비 세 팔의 방향이 모두 같은가: **{"○" if same else "✗"}**.', '']
for a,v in x['directions'].items():
 L.append(f'- {names[a]}: 빠른 참고 {v["referenceFast400Ratio"]:.3f} → 몸100일 {v["bodyRatio"]:.3f}, 방향 {"같음" if v["sameDirection"] else "다름"}.')
if not x['directionFlipVillages']:
 L+=['', '1의 위·아래가 뒤집힌 팔이 없어 카드4의 조건부 다섯 마을 원인 분석 대상은 없다. 100일 한 시드 결과를 여러 시드·몸400일 결과로 확대하지 않는다.']
for a,rows in x['directionFlipVillages'].items():
 L += ['',f'### {names[a]} 방향 반전 — 기여 차 상위 다섯 마을', '',
 '순위는 마을의 (켜기−끔)/세계 끔 인구 기여가 몸100일과 참고 빠른400일 사이 얼마나 달라졌는지의 절댓값이다. 기간·소스가 다른 참고 비교이며 단독 원인 기여율 실험으로 해석하지 않는다.', '',
 '| 마을 | 빠른 끔→켬 | 몸 끔→켬 | 기여차%p | 몸 영토 끔→켬 | 몸 목재 끔→켬 | 몸 식량빚사망 끔→켬 | 이탈 끔→켬 |',
 '|---|---:|---:|---:|---:|---:|---:|---:|']
 for r in rows:
  b,o,f,fo=r['body'],r['bodyOff'],r['fast400'],r['fastOff400']
  L.append(f'| {r["name"]} | {fo["pop"]}→{f["pop"]} | {o["pop"]}→{b["pop"]} | {100*r["contributionDifference"]:+.2f} | {o["territory"]}→{b["territory"]} | {o["wood"]:.1f}→{b["wood"]:.1f} | {o["debtDeaths"]}→{b["debtDeaths"]} | {o["emigration"]}→{b["emigration"]} |')
 L += ['', '각 마을의 몸 수·목재 입구·말뚝 막힘·주거 문과 사망/이탈은 `summary.json`의 원문 단면에 함께 있다. 정본은 영토 목재 출구와 주거 목재를 같은 곳간에서 치르고, 개간 목재 입구는 T325 조건을 받는다. 몸 판은 걷기·벌목·귀환에 쓸 게임 시간이 길고 주민 몸도 제한하지 않는다. 위 표와10일 시계열에서 관측한 자원·이동·인구 경로를 기준으로 반전을 회부하며, 기간 차이와 소스 차이를 몸 효과 하나로 단정하지 않는다.']
L+=['', '## 6. 검증·재민 판정에 회부', '',
'- 네 몸 판 모두 실제100일·51마을·양의 초기 시딩, CLI와zone 실제 종료0, 시계오류0, 지정 관찰기 오류없음. 정본 끝 인구/식량 빚 사망/몸 아사와 새 관측 끝 수가 일치한다.',
'- 공식 끈 판: 새 기준선 **1/1·인구3,914**, 경제400일·판JSON·여덟 수와 **생활층 실제400/400일** 일치. raw t740를 별도로 다시 축약해 전체 객체를 대조했다. 0일 비교를 통과로 받지 않았다.',
'- 관찰기 유무의 첫1일 경제 지문 일치. 환경 전환으로 중단된 앞 실행은 모두 분리·제외했고, 새100일은0일부터 완료했다. 정상 종료0만으로100일을 받지 않는다.',
'- 제품 파일 SHA와 베이스 대비 diff가 모두 같다. 실행 중 관찰기·러너도 고정했다. DB는 커밋하지 않는다.',
'- 켬 기본은 재민 판정이다. 이 가지는 기본값·생산량·직업자리·영토 정책을 고치지 않는다. 100일·시드1020·집 행위끔 조건과 몸/입고/일괄의 측정 범위를 함께 회부한다.', '',
'## 원자료와 재실행', '',
'`계측/T1274_2026-11-12/`: `summary.json`, 일별 `daily.csv`, CPU PNG/SVG, `runs/`, `controllers/`, source/hash/환경/방법·체크섬. 각 관측 시점과 계량 정의는 `METHODS.md`를 따른다.', '',
'실행은 Node22와 Python matplotlib 환경에서 독립 POSIX 세션으로 `scripts/t1274-supervise.py <새 출력 폴더>`를 시작한다(현재 실행의 PID/그룹은 processes.json에 기록). 같은 폴더에 새 세계를 덮어 시작하지 않는다. 완료 후 다음을 실행한다.', '',
'```bash', 'source /workspace/.toolchains/activate-mini-node.sh', 'setsid python3 scripts/t1274-supervise.py /tmp/t1274-replay </dev/null >/tmp/t1274-replay.log 2>&1 &', 'python3 scripts/t1274-progress.py /tmp/t1274-replay', '# supervisor-complete.json의 complete와 두 종료0을 확인한 뒤:', 'python3 scripts/t1274-collect.py <완료된 출력 폴더>', 'python3 scripts/t1274-report.py', '```', '']
(R/'보고/T1274_2026-11-12.md').write_text('\n'.join(L))
print(L[0])
