# T1264 report from collected native measurements; no model mutation.
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1];P=R/'계측/T1264_2026-11-12';x=json.loads((P/'summary.json').read_text());C={(r['arm'],r['seed']):r for r in x['cases']};seeds=[1020,7,42]
ratio=lambda a,s:C[a,s]['population']/C['OFF',s]['population']
ratios=lambda a:' · '.join(f'{ratio(a,s):.3f}' for s in seeds)
pct=lambda n,d:f'{100*n/d:.1f}%' if d else '—'
debugK=lambda v: '—' if (v.get('gate') or {}).get('K') is None else f"{v['gate']['K']:.1f}"
clock=x['historicalReproduction']['OLD_CLOCK_V2_WOOD'];new=x['historicalReproduction']['V2_WOOD'];actual=ratio('V2_WOOD',1020)
repro='○(새 main·소수 둘째 자리)' if round(actual,2)==1.20 else '✗(새 main)'
oldratio=C['OLD_CLOCK_V2_WOOD',1020]['population']/C['OLD_CLOCK_OFF',1020]['population']
repro += '·종전 시계 ' + ('○' if round(oldratio,2)==1.20 else '✗')
lines=[f'끔비 — v2 + 나무꾼 {ratios("V2_WOOD")} · v2 만 {ratios("TERR")} · 나무꾼만 {ratios("WOOD")} · T1251 1.20 재현 {repro} · v2 가 줄이는 까닭 땅·목재 제약과 이탈·사망·출생 문(아래 근거) · 끈 판 1/1 · 회부 켬 기본은 재민 판정',
'', '# T1264 — 빠진 팔과 영토 v2 단독의 인구 차 (2026-11-12 · GPT 1)', '',
'`[승인 대기 · T1264]` · 가지 `batch/wood-v2-1111` · 베이스 `05b66c73`(land1066 뒤) · 제품 변경 0 · 판정 0.', '',
'## 1. 새 main에서 3시드 × 4팔 × 400일', '',
'시드 순서 1020·7·42. 각 팔의 끔비는 **이번에 다시 잰 같은 시드의 OFF**를 분모로 한다. T1259의 끔 숫자를 분모로 쓰지 않았다.', '',
'| 시드 | 끔 | 나무꾼만 | 끔비 | v2만 | 끔비 | v2+나무꾼(자리 끔) | 끔비 |', '|---|---:|---:|---:|---:|---:|---:|---:|']
for s in seeds:
 lines.append(f'| {s} | {C["OFF",s]["population"]:,} | {C["WOOD",s]["population"]:,} | {ratio("WOOD",s):.3f} | {C["TERR",s]["population"]:,} | {ratio("TERR",s):.3f} | {C["V2_WOOD",s]["population"]:,} | {ratio("V2_WOOD",s):.3f} |')
lines += ['', '묶음의 식량 빚 사망(끔→묶음, 시드 1020·7·42)은 ' + ' · '.join(f'{C["OFF",s]["debtDeaths"]:,}→{C["V2_WOOD",s]["debtDeaths"]:,}' for s in seeds) + '로 모두 늘었다. 빈 마을은 ' + ' · '.join(f'{C["OFF",s]["empty"]}→{C["V2_WOOD",s]["empty"]}' for s in seeds) + '다. 이 지표도 켬 기본 판정에 함께 회부한다.']
lines += ['', 'v2+나무꾼 ÷ v2 단독(시드 1020·7·42): ' + ' · '.join(f'{C["V2_WOOD",s]["population"]/C["TERR",s]["population"]:.3f}' for s in seeds) + '.', '', '빠른 시계 250ms/일 · 가상 시계 · 마을당 주민 몸 상한 1 · 집 행위/캐러밴 상한 끔. `T1253_CLOCK_FIX`와 `T1258_ARTISAN_CLOCK`는 새 main 기본 켬. 12판 모두 native 400일/자식 종료0/51마을/초기 인구 양수, 시계·관찰 오류0. 자리 손잡이 `T1259_WOOD_CAP=0`은 전부 명시했다.', '',
'| 시드·팔 | 빈 마을 | 식량 빚 사망 | 굶음 마을-날 | 주민 몸 아사 | 영토 칸 | 밭 칸 | 통나무 막힘 | 출생0 중 주거 문 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for s in seeds:
 for a in ['OFF','WOOD','TERR','V2_WOOD']:
  r=C[a,s];t=r['territoryCost'];lines.append(f'| {s} {a} | {r["empty"]} | {r["debtDeaths"]} | {r["famineVillageDays"]} | {r["bodyStarve"]} | {r["territory"]:,} | {r["farm"]:,} | {pct(t["stallWood"],t["days"])} ({t["stallWood"]}/{t["days"]}) | {pct(r["zeroBirthHouseDays"],r["zeroBirthDays"])} ({r["zeroBirthHouseDays"]}/{r["zeroBirthDays"]}) |')
lines += ['', '굶음은 정본 `villageFamine`(_dpDebug.hunger<0)이고 식량 빚 사망/몸 아사와 다른 척도다. 주민 몸 아사 열은 native `bodyExit.died.starve`이며 산적의 `bandit_starve`는 별도 원자료에 남긴다. 밭 칸은 `_farmSet`(그중 `_drySet`을 다시 더하지 않음). 통나무 막힘의 분모는 영토 확장 시도 마을-날이다.', '',
'## 2. T1251의 1.20 대조', '',
'T1251 보고 베이스는 `c4c6ce70`, 빠른400 원자료 HEAD는 `5c0d34ed`다. 두 커밋 사이 제품 변경은 0(관찰기/표 스크립트만 추가). 당시 같은 시드1020은 OFF 3,867 / WOOD 3,561 / v2 3,025 / v2+나무꾼 4,642였고, 4,642÷3,867=1.200414다. v2+나무꾼에는 자리 손잡이가 없었다.', '',
'| 조건 | 끔 | v2+나무꾼 | 끔비 |', '|---|---:|---:|---:|', '| T1251 원자료 | 3,867 | 4,642 | 1.200414 |',
f'| 새 main 기본 시계(실측) | {C["OFF",1020]["population"]:,} | {C["V2_WOOD",1020]["population"]:,} | {actual:.6f} |',
f'| 새 main·시계 고침 두 개만 0(실측) | {C["OLD_CLOCK_OFF",1020]["population"]:,} | {C["OLD_CLOCK_V2_WOOD",1020]["population"]:,} | {C["OLD_CLOCK_V2_WOOD",1020]["population"]/C["OLD_CLOCK_OFF",1020]["population"]:.6f} |', '',
f'종전 시계 v2+나무꾼 ↔ T1251: 400일 지문 같음 **{clock["sameDays"]}**, 여덟 수 같음 **{clock["sameEight"]}**, 판 JSON hash 같음 **{clock["sameRunHash"]}**, 생활층 지문은 **미계측({clock["sideDays"]}/{clock["referenceSideDays"]}일)**. 새 기본 시계와 T1251의 첫 날 지문 차이는 {new["firstDifferentDay"]}일이다.', '',
f'새 기본 시계의 첫 갈림 마을·칸: {json.dumps(new["firstDifferentVillageFields"],ensure_ascii=False)}.', '',
f'새 main의 절대 인구 차(T1251 대비): 끔 {C["OFF",1020]["population"]-3867:+}명, 묶음 {C["V2_WOOD",1020]["population"]-4642:+}명. 끔비 변화는 분모와 분자의 변화가 함께 만든 값이다.', '',
'손잡이·자·관찰기 diff: 두 판의 실험 손잡이는 같은 `T325=1,T1207=1,T1238=1`, 새 팔의 `T1259=0`은 명시적 끔이다. 판 자 t577/server-baseline-check/t745는 제품 베이스 간 변경이 없다. T1251의 v2 훅은 50일마다 영토 장부/가격 캐시 **읽기**, 이번 훅은 10일마다 상태 읽기와 날마다 출생 문 관찰이다. 두 관찰기는 가격 함수를 호출하지 않는다. 제품 차이는 `T1251-to-main.diff.gz`와 `T1259-to-main.diff.gz`에 보존했다. 새 main은 시계 두 개 기본 켬, 고라니 기본 켬, 식량 읽기·나무꾼 자리 등 끔 기본 코드를 포함한다. 시계 대조는 동일한 새 제품에서 두 시계 손잡이만 바꾼 것이므로 두 시계의 **합친 효과**를 분리한다. 각 시계의 개별 기여는 이 카드에서 분리하지 않았다.', '',
'## 3. 영토 v2 단독 — 인구 차 상위 다섯 마을', '',
'각 시드에서 TERR−OFF가 가장 작은 마을 다섯 곳. 모든 `끔→v2` 수치는 같은 시드 400일 끝 상태/누계다. 주거 문은 출생0일 중 비율이다. 기록된 K는 마지막 정본 `_dpDebug.K`이며, 빈 마을에서는 마지막 유효 틱의 기록일 수 있다.', '']
for s in seeds:
 lines += [f'### 시드 {s}', '', '| 마을 | 인구 끔→v2(차) | 영토 칸 끔→v2 | 밭 칸 끔→v2 | v2 통나무 막힘 | 식량 빚 사망 끔→v2 | 주거 문 끔→v2 |', '|---|---:|---:|---:|---:|---:|---:|']
 for q in x['topFive'][str(s)]:
  o,v=q['off'],q['v2'];t=v['territoryCost'];lines.append(f'| {q["name"]} | {o["pop"]}→{v["pop"]} ({q["populationDifference"]:+}) | {o["territory"]:,}→{v["territory"]:,} | {o["farm"]:,}→{v["farm"]:,} | {pct(t["stallWood"],t["days"])} ({t["stallWood"]}/{t["days"]}) | {o["debtDeaths"]}→{v["debtDeaths"]} | {pct(o["zeroBirthHouseDays"],o["zeroBirthDays"])}→{pct(v["zeroBirthHouseDays"],v["zeroBirthDays"])} |')
 lines += ['', '| 마을 | 곳간 목재 끔→v2 | 주거 끔→v2 | 기록된 K 끔→v2 | v2 개간 그루 | v2 개간 목재 입고 | v2 누적 묵혀 빠진 칸 |', '|---|---:|---:|---:|---:|---:|---:|']
 for q in x['topFive'][str(s)]:
  o,v=q['off'],q['v2'];t=v['territoryCost'];lines.append(f'| {q["name"]} | {o["wood"]:.1f}→{v["wood"]:.1f} | {o.get("housing",0):.1f}→{v.get("housing",0):.1f} | {debugK(o)}→{debugK(v)} | {t["felled"]} | {t["woodIn"]:.1f} | {v["fallenCells"]} |')
 lines += ['', '| 마을 | 신규 주민 관측 누계 끔→v2 | econ 사망 누계 끔→v2 | 이탈 누계 끔→v2 |', '|---|---:|---:|---:|']
 for q in x['topFive'][str(s)]:
  o,v=q['off'],q['v2'];lines.append(f'| {q["name"]} | {o.get("born",0)}→{v.get("born",0)} | {o["deaths"]}→{v["deaths"]} | {o["emigration"]}→{v["emigration"]} |')
 lines += ['']
example=x['topFive']['1020'][0];eo,ev=example['off'],example['v2']
lines += ['### 까닭 한 단', '',
'영토 v2는 `_t1238Land` 표지에서 기존 금고 확장을 중단하고(`sim/economy-sim.js`의 expand), 서버가 몸의 낮·개간·말뚝 통나무를 치른 영토로 땅을 정한다(`_t1238Batch`). 통나무 막힘은 영토 확장을 늦추고 econ이 읽는 땅 크기와 생산 자리에 영향을 준다. 동시에 개간으로 벤 나무는 `_t1207Fell → woodToGranary`로 보내는데, T325가 끔이면 입구가 0을 반환하고 남은 짐을 드는 줄도 켬 갈래이므로 v2 단독의 개간 목재 입고는 0이다. 주거도 같은 곳간 목재에 제약받고(`built=min(...,storage.wood/HOUSE_WOOD)`), 정본 출생은 주거 상한에서 막힌다(`_dpDebug.gated`). 위 표는 각 마을의 통나무 막힘·영토/밭·목재/주거·출생 문과 사망을 함께 제시한다. 이는 이 코드 경로와 관측의 설명이며, 목재/영토/주거 각각의 기여율을 분리한 인과 실험은 아니다. 고친 곳은 없다.',
f'최대 감소 예인 1020 {example["name"]}은 인구 {eo["pop"]}→{ev["pop"]}, 이탈 누계 {eo["emigration"]}→{ev["emigration"]}, 식량 빚 사망 {eo["debtDeaths"]}→{ev["debtDeaths"]}, 출생0 중 주거 문 {pct(eo["zeroBirthHouseDays"],eo["zeroBirthDays"])}→{pct(ev["zeroBirthHouseDays"],ev["zeroBirthDays"])}다. 마을별 직접 감소 경로에는 이탈과 사망도 포함되며, 마을에는 외부 유입·유출이 있으므로 신규 주민 관측·이탈·사망 누계를 단순한 전체 인구 분해식으로 해석하지 않는다.', '',
'## 4. 끈 판과 제품 무접촉', '',
f'- 새 기준선 `서버기준선_2026-11-11.json` 1020:400: **같음 1/1 · 인구 3,914**. 관찰기를 뺀 별도 native gate이며 생활층 지문 **400/400일**까지 일치한다. 시계 오류0은 그 판의 정본 T745 종료 로그로 확인했다.',
'- 새 OFF make 3시드도 기준선의 경제 400일 지문·여덟 수·판 JSON hash가 같다(3/3). 생활층은 관찰기 순서 문제로 0일이며, 아래 별도 공식 게이트에서 1020의 400일 전부를 대조했다.',
f'- server/sim/public 추적 파일 **{x["productFilesUnchanged"]:,}개** SHA-256 전후 같음. 모든 controller의 소스 전후 같음. 비교 12판 + 종전 시계 대조 2판 + 별도 공식 게이트 1판 = 유효한 15개 400일 판 완주. 이 밖에 생활층 비교가 0일이었던 진단 게이트 1판과 추가 정본 게이트 반복 {len(x["additionalGateRepeats"])}판도 원자료로 남겼다.',
'- 이 카드에서 제품 하네스는 추가/실행하지 않았다. 계측과 요구된 기준선 게이트만 실행했다.', '',
'## 5. 재민 판정에 회부', '',
'1. 나무꾼+v2(자리 끔)의 3시드 결과를 위 표대로 회부한다. 켬 기본은 재민 판정이며 이 가지는 기본값을 바꾸지 않는다.',
'2. v2 단독의 통나무 비용·개간 목재 입구·주거 문 연결을 회부한다. 제품 수정은 0이다.',
'3. 기준선 자는 생활층 0일 비교도 같음으로 표시했다. 이번 관찰기의 조기 모듈 로드가 그 경우를 만들었다. 새 제품 판정에 쓰지 않고 관찰기 없는 공식 게이트 400/400으로 보완했다. 자의 누락 감지는 별도 회부한다. T1259 OFF_GATE 원로그도 생활층0일임을 확인해 `prior-gate-coverage/`에 첨부했다. 그 경제400일·판 JSON·여덟 수 비교는 유효하며 생활층400일 증명으로 확대하지 않는다.',
'4. 시계 고침 두 개의 개별 기여, 라이브 시계·몸 전부 400일에 이 결과가 유지되는지는 별도 범위다. 이번 판은 카드가 지정한 빠른 시계 자다.', '',
'## 원자료와 다시 하기', '',
'- `계측/T1264_2026-11-12/summary.json`: 15판 검증·결과·마을 비교·옛 판 재현 비교.',
'- `runs/<팔>/<시드>/`: native JSON/날 지문/생활층 지문/시계 메타/새 관찰기/서버 로그(gz). DB는 제외했다.',
'- `official-gate/`: 관찰기 없는 정본 끔 판·생활층 400일·종료 로그.', '- `additional-official-gate/`: 대기 러너가 살아남아 추가 실행된 같은 게이트. 두 실행은 native 디렉터리별로 분리했고 모두 400일·생활층400일·시계오류0이다. 비교 팔에 합치지 않았다.',
'- `interrupted-first/`: 중단한 첫 실행 원자료·제외 사유(최종 비교 제외).',
'- `controllers/`: 정확한 argv·팔 환경변수·입력 SHA·실제 경과·native 종료 로그.',
'- `METHODS.md`, `execution-environment.json`, `SHA256SUMS`: 정의·환경·무결성.', '- 원자료의 마을 직속 `woodIn`은 존재하지 않는 보조 필드를 읽어 0이므로 제외했다. 보고의 개간 입고는 정본 `territoryCost.woodIn`이다(원자료 무수정).', '',
'```bash', 'source /workspace/.toolchains/activate-mini-node.sh', 'python3 scripts/t1264-run.py /tmp/t1264-replay', 'python3 scripts/t1264-clock-replay.py /tmp/t1264-replay', 'python3 scripts/t1264-full-gate.py /tmp/t1264-replay', 'python3 scripts/t1264-collect.py /tmp/t1264-replay', 'python3 scripts/t1264-report.py', '```', '']
(R/'보고/T1264_2026-11-12.md').write_text('\n'.join(lines))
print(lines[0])
