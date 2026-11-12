import csv,json,math
from pathlib import Path
import sys
folder=Path(sys.argv[1]);out=Path(sys.argv[2]);s=json.loads((out/'summary.json').read_text());s.update(json.loads((out/'curve-analysis.json').read_text()));p=json.loads((folder/'profile.json').read_text());m=json.loads((folder/'world-days.jsonl.meta.json').read_text());daily=list(csv.DictReader((out/'daily.csv').open()));top=s['otherBlocks'][:3]
translations={'zone:body:movement-preparation':'이동 준비(_wwPre)','zone:space:rebuild-index':'공간 인덱스 재구축','zone:body:gauges-stairs-regeneration':'계단·낙하·게이지·회복','zone:animals:AI':'동물 AI','zone:animals:stairs-fall':'동물 계단·낙하','zone:space:active-chunks':'활성 청크','villages:tickCaravanBodies':'캐러밴 몸 전진','villages:tickBodyExits':'줄어드는 몸','villages:tickWarBodies':'전쟁 몸 전진','villages:_granBroadcast':'곳간 변화 방송','villages:_mktBroadcast':'장마당 변화 방송','villages:_t731Tick':'마을 현지 하루 문','villages:_t690Plan':'생활층 하루 계획','frame:setup-and-dispatch':'프레임 변수·클로저·계량 복귀','clock:virtual-timer-pump':'가상펌프·HTTP 연결 점검','GC:main-thread':'주 스레드 GC','GC:background-threads':'배경 스레드 GC','unattributed-native':'미분류 주 스레드','unattributed-background':'미분류 배경 스레드'}
def pretty(row):return translations.get(row['name'],row['name'])
def cell(text):return str(text).replace('|','&#124;').replace('\n',' ').replace('`','&#96;')
def count(row):
 c=p['calls'].get(row['name']);return c['n'] if c else None
rank=' · '.join(f'{i+1}위 {pretty(r)}({r["percentOfOther"]:.1f}%)' for i,r in enumerate(top))
lines=[f'기타 {s["otherCpuMinutes"]:.3f}분 → {rank} · 쪼갠 합 {s["coveragePercent"]:.2f}% · 날 단가 오르는 까닭 몸 증가에 따른 프레임당 반복 비용 증가 · 끈 판 1/1 · 회부 2', '', '# T1270 — main 틱 판 기타 CPU 분해', '', '**측정 대상:** 고정 main `b17f6089`(land1067 뒤). **가지:** `batch/body-profile-2-1111`. 2026-11-12 KST. **제품 변경0·채택/설계 판정0.**', '',
 f'- 몸 전부·라이브 하루 길이1,440,000ms·시드1020·농사 켬·가상 시계 **30일 완주**, 실제 존/러너 종료0·clock 오류0. CPU 총 **{s["processCpuMinutes"]:.3f}분**, 그중 기타 **{s["otherCpuMinutes"]:.3f}분**.',
 f'- 기타의 이름 붙인 합 **{s["identifiedOtherCpuMinutes"]:.3f}분({s["coveragePercent"]:.2f}%)**. 나머지 **{s["unknownCpuMinutes"]:.3f}분**은 미분류로 남겨 분자에서 뺐다.',
 f'- 첫10일 기타 평균 **{s["dailyAverages"]["first10OtherMinutes"]:.3f}분/날** → 마지막10일 **{s["dailyAverages"]["last10OtherMinutes"]:.3f}분/날**. 인구/몸 수와 프레임당 비용 곡선을 함께 보존했다.',
 '- 새 기준선 **인구3914·1020:400 같음1/1**, 실제 종료0. 제품/원 관측 파일 SHA는 고정 main과 일치한다.',
 '- 간격 타이머15개를 전수 대조했다. 정적14개 밖 하나는 Node HTTP 연결 점검30초다. GC는 벽시간이 아닌 native thread CPU의 합집합으로 나눴다.',
 '- 회부2: 남은 미분류의 추가 귀속과 계량 비용/펌프 합산 경계를 고려한 후속 범위는 PM이 정한다. 이번 카드는 CPU 표·원자료만 낸다.', '',
 '## 1. CPU 합과 기타 분해', '',
 '콜백·문·함수 전후 `threadCpuUsage()`로 실제 main thread CPU를 중첩 제외 계량했다. 프로세스 전체에서 뺀 나머지는 배경 CPU다. 아래 전체 갈래 합과 기타 세부 합은 같은 존 process CPU에 닫힌다. 모델/관리자 다른 프로세스는 제외한다. 기동·관찰기·계량 비용도 포함한 **관측된 CPU**다.', '',
 '| 큰 갈래 | CPU분 | 전체 % |','|---|---:|---:|']
coarseNames={'body_tick':'몸 결정·이동·밀기','econ':'econ 하루·모델 사건 장부','life_daily':'생활층 등 하루 끝','pathfinding':'path-core','trade_routes':'교역로','storage':'저장·DB/저장용 순회','observers':'감싼 관찰기','startup':'첫 gameTick 전 기동(main thread)','other':'기타'}
for k,n in coarseNames.items():
 us=s['coarseUs'].get(k,0);lines.append(f'| {n} | {us/60e6:.3f} | {us/(s["processCpuMinutes"]*60e6)*100:.2f} |')
lines += [f'| 합 | {s["processCpuMinutes"]:.3f} | 100 |', '',
 '생활 마감·교역로·길찾기 등은 큰 갈래 경계로도 분리한다. 기타의 비율 분모에 이 갈래 CPU를 다시 더하지 않는다. 소문 그래프는 별도 이름으로 표시한다. T1262의 고정 V4와 이번 main은 소스/프로파일이 다르므로 두 실행의 분 수 차이를 제품 개선으로 판정하지 않는다.', '',
 '### 기타 이름별 CPU와 이것만0인 30일', '',
 '다른 칸은 그대로 두고 해당 칸 CPU만 뺀 산술 시나리오다. 실제 구현·제거 가능성 판정은 아니다. GC는 매칭한 양을 원래 함수 칸에서 덜어 별도 행으로 뒀다. 호출 수는 완료된 계량 문/함수 수이며, 조건이 거짓이어도 조건문 평가 완료는 센다. 마지막 열린 호출은 종료 지점에 따라 완료 수에 빠질 수 있다.', '',
 '| 이름/구간 | CPU분 | 기타 % | 완료 계량 횟수 | 이것만0이면 전체30일 분 |','|---|---:|---:|---:|---:|']
for r in s['otherBlocks']:
 n=count(r);lines.append(f'| {cell(pretty(r))} | {r["cpuMinutes"]:.4f} | {r["percentOfOther"]:.2f} | {n:,}' .replace('None,','')+f' | {r["zeroOnlyThisMinutes"]:.3f} |' if n is not None else f'| {cell(pretty(r))} | {r["cpuMinutes"]:.4f} | {r["percentOfOther"]:.2f} | native CPU/잔여 | {r["zeroOnlyThisMinutes"]:.3f} |')
lines += ['', '원시 이름·소스 위치·전체 갈래의 이것만0 값까지 [blocks.csv](../계측/T1270_2026-11-12/blocks.csv)에 있다. 미분류를 이름만 바꿔 넣지 않았고, 분해율은 미분류 주 스레드/배경 CPU를 제외해 계산했다.', '',
 '## 2. 큰 셋: 호출 수 × 단가와 반복', '']
for i,r in enumerate(top):
 n=count(r);unit=f'{n:,}회 × {r["cpuUs"]/n:.3f}μs/완료 구간' if n else 'native CPU 구간의 thread별 합집합'
 lines.append(f'{i+1}. **{pretty(r)} — {r["cpuMinutes"]:.3f}분, 기타 {r["percentOfOther"]:.2f}%:** {unit}. 원시 키 `{r["key"]}`. 소스 `{r["source"]}`.')
lines+=['', '\n\n'.join(json.loads((out/'top3-explanations.json').read_text())['paragraphs']), '',
 '`frame:setup-and-dispatch`는 다른 문을 뺀 실제 gameTick 함수 self CPU이며 변수/클로저 준비와 계량 bookkeeping이 함께 있다. 35개 선언은 frame-self-statements.json에 있다. 이 값 전부를 순수 모델 로직이라고 부르지 않는다. 원래 NPC 안 clock 두 번·카운터는 몸 결정에 남으므로 observer 행만으로 모든 관측 비용이 되지는 않는다.', '',
 '빈 계량 쌍 실험 5×10만 회는 약1.36–2.06μs/쌍이었다. 실제 문은 키/중첩/GC/JIT 분포가 달라 정확한 보정값으로 빼지 않았다. 낮은 단가의 문은 관측 비용의 영향을 특히 받는다.', '',
 '## 3. 날별 곡선: 인구·몸 수·프레임당 비용', '',
 '![일별 CPU와 주요 함수·인구·몸 수](../계측/T1270_2026-11-12/daily-cpu.png)', '',
 '첫날은 기동을 포함한 부분 날이다. 위 전체 CPU 선은 분리한 기동을 뺐다. 함수별 일 곡선은 **GC 포함 콜백 CPU**이며 전체30일 표의 GC 분리 뒤 값과 합쳐 더하지 않는다. 몸은 players Map(캐러밴·병사 포함, 동물 제외), 인구는 경제 명부다.', '',
 '| 날 | 전체 CPU분 | 기타 CPU분 | 인구 | 몸 | 누적 frame |','|---:|---:|---:|---:|---:|---:|']
for r in daily:lines.append(f'| {r["day"]} | {float(r["cpuMinutes"]):.3f} | {float(r["otherMinutes"]):.3f} | {r["population"]} | {r["bodies"]} | {r["frames"]} |')
lines+=['', '| 주요 콜백(곡선은 GC 포함) | 첫10일 분/날 | 마지막10일 분/날 | 배수 | 첫/끝10일 μs/전체frame |','|---|---:|---:|---:|---:|']
for d in s['dailyDrivers']:
 lines.append(f'| {cell(d["key"])} | {d["first10MeanMinutes"]:.3f} | {d["last10MeanMinutes"]:.3f} | {d["lastVsFirst"]:.2f} | {d["first10MeanUsPerOuterFrame"]:.2f} / {d["last10MeanUsPerOuterFrame"]:.2f} |')
lines+=['', '날마다 frame 격자는 거의 일정하지만 인구·실제 몸 수와 함께 프레임당 처리 비용이 바뀐다. 일별 종단 몸 수와 하루 전체 방문량은 같지 않으며, 상관만으로 원인을 확정하지 않는다. 큰 셋의 반복 구조와 위 구간별 단가 변화가 어느 덩이에서 증가했는지의 근거다. 일정 날 단가로400일을 늘리는 가정은 이번30일에서도 고정되지 않았다. 이후370일은 이번 판에서 재지 않았다.', '',
 '## 4. GC와 body 밖 타이머', '',
 '### GC 실제 CPU', '',
 f'- main GC native CPU: **{s["gc"]["mainUs"]/1e6:.3f}초**, 그중 함수에 매칭해 별도 행으로 덜어낸 양 **{s["gc"]["mainAssignedUs"]/1e6:.3f}초**. 미매칭 **{s["gc"]["mainUnassignedUs"]/1e6:.3f}초**는 원래 함수 칸에 남는다(진단량을 표에 다시 더하지 않음).',
 f'- 배경 GC native CPU: **{s["gc"]["backgroundUs"]/1e6:.3f}초**. 전체 배경 CPU **{s["otherThreadCpuMinutes"]*60:.3f}초**의 나머지를 GC라고 부르지 않는다.',
 '- CPU 필드는 `tts/tdur`, 경과 필드는 `ts/dur`다. 같은 tid에서 부모/자식 단계의 CPU 구간 합집합으로 중복을 뺐다. GC 이름 없는 ConcurrentMarking 등도 v8.gc 카테고리로 포함했다.',
 f'- 미매칭 main GC 전체를 추가로 기타의 미분류로 가정하는 보수적 상계도 분해율 **{s["coveragePercent"]-s["gc"]["mainUnassignedUs"]/(s["otherCpuMinutes"]*60e6)*100:.2f}%**다. 이는 CPU 표의 재배분이 아닌 불확실성 상계다.',
 '- GC 소유 함수는 실제 PerformanceObserver 시작 시각과 최근 콜백 경계를 연결했다. 매칭 실패는 억지 분배하지 않았다. 추적 회전 파일을 모두 보존했고 Native 시간 예는 gc-clock-proof.json에 있다.', '',
 '### 간격 타이머 전수', '',
 '정적 등록기14개와 Node HTTP 서버의30초 연결 점검1개를 합쳐15개다. 아래의 콜백 CPU는 마킹한 하위 작업/GC를 뺀 self CPU다. 게임Tick 자체는 본문 여러 칸으로 나뉘므로 이 행만으로 전체 gameTick CPU가 되지는 않는다.', '',
 '| 소스 | 요청 주기ms | 등록 | 실제 콜백 진입 | CPU분/범위 |','|---|---:|---:|---:|---|']
bykey={r['key']:r for r in s['allBlocks']};ticksite=p['labels']['other::frame:setup-and-dispatch']['source']
for t in p['timers'].values():
 if t['kind']!='interval':continue
 key='other::frame:setup-and-dispatch' if t['site']==ticksite else 'other::timer:interval:'+t['site'];row=bykey.get(key);cpu=f'{row["cpuMinutes"]:.4f}' if row else '다른 명명 칸';period=', '.join(t['periods'])
 lines.append(f'| {t["site"]} | {period} | {t["registrations"]} | {t["calls"]:,} | {cpu} |')
gap=m['clock']['fired']-sum(t['calls'] for t in p['timers'].values() if t['kind']!='immediate');lines.append(f'| node:_http_server setupConnectionsTracking | 30000 | 1 | {gap:,} | 가상펌프와 합산 |')
lines+=['', f'전체 interval 등록15개 중 gameTick1개를 뺀 body 밖 등록은14개다. Node HTTP 콜백의 본 판 호출 수 **{gap:,}회**는 전체 가상 fired에서 포착한 콜백 진입 합을 빼서 구했다. 별도 한 날 감사에서는15개를 모두 등록 시 읽었고 Node HTTP 콜백39회·세계 raw plain 일치·종료0을 확인했다.', '',
 f'setTimeout 정적 소스 {sum(t["kind"]=="timeout" for t in p["timers"].values())}종·등록 {sum(t["registrations"] for t in p["timers"].values() if t["kind"]=="timeout"):,}회, setImmediate 정적 소스 {sum(t["kind"]=="immediate" for t in p["timers"].values())}종도 원자료에 있다. 등록 수와 호출 수·종료 큐 길이는 구분했다. 자세한 전수 대조는 timer-inventory.json이다.', '',
 '가상펌프는 매400개 가상 콜백 뒤 실제 I/O에 양보한다. 이 함수 CPU에는 독립 마킹하지 않은 Node HTTP 연결 점검이 포함된다. 따라서 펌프와 해당 Native콜백의 CPU를 합친 구간이며 독립 비용0이라고 하지 않는다. 이 펌프는 가속 판자에 속한다. setTimeout/setImmediate의 소스별 등록/호출/주기 분포도 summary.json의 timers에 있다.', '',
 '## 5. 요청 범위와 검증', '',
 '- 생활층 일 끝/econ 마을별/모델 사건 장부/교역로/path-core는 큰 갈래·이름별 원자료에 있다. npcLifeTick의 사람별 일과 선택은 몸 결정 안이며, 이를 기타에 중복해서 더하지 않는다. 별도 소문 그래프 호출은 rumor 이름으로 포착한다(호출0이면0으로 읽음).', '',
 '### path-core 호출 수 × 평균', '',
 '아래 평균은 기동/하위 호출/GC를 포함한 생애 inclusive CPU/완료 호출이다. 별도 runtime exclusive path 칸과 다르다. 시작 API·pathStep 재개·smooth는 서로 다른 수다.', '',
 '| API | 호출 | inclusive CPU분 | 평균μs |','|---|---:|---:|---:|']
for key,c in p['calls'].items():
 if key.startswith('path:'):lines.append(f'| {key} | {c["n"]:,} | {c["inclusiveUs"]/60e6:.4f} | {c["inclusiveUs"]/c["n"]:.3f} |')
lines+=['', '- 본 판: 요청30일·실제 종료0·clock 오류0·51곳 양수 시딩·world JSON30일. 원본 JS/관측 helper SHA 고정 main/실행 시작·끝을 대조했다.',
 '- 새 끔 기준선: `서버기준선_2026-11-11.json --vclock --plan 1020:400`, 인구3914·같음1/1·실제 종료0·645초. 시계 보정은 main 기본 켬 그대로다.',
 '- 계측기: 첫날 raw world는 plain과 동일. 타이머 감사도 같은 첫날 world다. 빈 probe 비용은 별도 메커니즘 실험이며 완료 날로 세지 않았다.',
 '- 회전: 앞 긴 시도는 파일명에 rotation이 없어18일에서 중단했다. 그 CPU/GC를 본 판에 이어 붙이지 않았다. 본 판은 시작부터30일을 다시 돌렸으며 회전 파일 전부를 보존했다. 별도60만 이벤트 시험도3파일에60만 init 보존을 확인했다.',
 '- 변경: `scripts/t1270/`, 이 보고, `계측/T1270_2026-11-12/`만. 제품/계수/손잡이 기본값 변경0. 최적화·채택 판정0.', '',
 '**회부2:** (1) 미분류 잔여의 추가 귀속 및 Node HTTP/가상펌프 합산을 더 나누는 후속 측정 여부. (2) 관측 비용과 반복 원자료를 바탕으로 실제 최적화 범위를 정하는 PM 판단. 본 카드는 목표90% 이상 분해와 표를 완료한 범위다.', '',
 '[재현·단위 정의](../계측/T1270_2026-11-12/METHODS.md) · [전체 블록과 이것만0 CSV](../계측/T1270_2026-11-12/blocks.csv) · [일별 CSV](../계측/T1270_2026-11-12/daily.csv) · [주요 구간 일별 CSV](../계측/T1270_2026-11-12/daily-drivers.csv) · [요약 JSON](../계측/T1270_2026-11-12/summary.json). 원문 trace·JSON·로그·source SHA는 같은 폴더 runs/와 source-validation.json, SHA256SUMS에 있다.', '']
Path('보고/T1270_2026-11-12.md').write_text('\n'.join(lines));print(lines[0])
