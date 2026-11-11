# T1270 재현과 CPU 회계

## 고정 판

- 카드: `지시/지시_T1270.md`. PM의 T1248 두 가지 미채택/닫음 판정 이후 **main 틱 판만** 계측한다.
- 측정 main: `b17f6089`(land1067 뒤), 독립 archive `/tmp/t1270-main`.
- Node v22.23.0 Linux x64, 실제 본 판 CPU affinity 0,1. 공유 머신 CPU quota4, 허용 logical CPU0–4. 초기에는 별도 OFF/짧은 검증이 함께 돌았다. 경과 시간 차이를 알고리즘 배속으로 해석하지 않는다.
- 시드1020, 51마을, `VILLAGE_NPC_CAP=Infinity`(T577가 아이 env에서 지워 운영 무제한), `VILLAGE_DAY_MS=1440000`, `T745_VCLOCK=1`, `T1243_FARM_ON=1`, 집/상단 운영 기본. **라이브 하루 길이를 가상 시계로 앞당긴 판**이다.
- `T1241_DES=0`, `T1241_PROBE=1`. 원래 T1241 관측과 같은 CPU 부담을 유지한다. 사건 후보를 실행/수정하지 않는다.
- 배선 선행: `lab-wiring-check.js` 실제 실행 실패0·기존 경고1.

```bash
mkdir -p /tmp/t1270-main
git archive b17f6089 | tar -x -C /tmp/t1270-main
ln -s /workspace/Mini/node_modules /tmp/t1270-main/node_modules
T577_PORT_BASE=55000 taskset -c 0,1 \
 /workspace/.tools/node-v22.23.0-linux-x64/bin/node scripts/t1270/run.cjs /tmp/t1270-main30-final 30
```

출력은 **새 디렉터리**를 쓴다. 원본 첫날 대조는 같은 명령의 인수 `1 plain`이며 별도 포트/출력이다. `profile.cjs`가 Module._compile에서 관측 문을 붙이고 원본 JS/모델 파일에는 쓰지 않는다. product/관측 소스 SHA는 source.json에, 완료 후 동일성은 source-validation.json에 남긴다.

## CPU 구간과 합

1. `process.threadCpuUsage()` user+system μs를 구간 전환 시 읽는다. 바로 이전 구간에 차이를 더한다. 중첩된 하위 구간은 별도 이름에 들어가므로 부모와 더해도 중복이 없다.
2. main thread 전 구간 합을 존 `process.cpuUsage()`에서 뺀 나머지가 다른 스레드 CPU다. 관리자/중앙 stub 등 **다른 프로세스**는 제외한다.
3. 기존 아홉 갈래와 비슷한 경계를 둔다: 몸 결정/이동/밀기, econ 조각·모델 사건 장부, 일 마감 job, path-core, 교역로, 저장/DB, 관찰기, 첫 gameTick 전 기동, 나머지 콜백/함수·배경 CPU인 기타. 소문 그래프 함수는 별도 이름으로 표시한다. 요청한 생활층 마감·길찾기 등은 전체 CPU 표에도 제시한다.
4. 기타 세부 이름은 root tick의 조건문/반복문/블록, 마을 프레임/캐러밴/전쟁 몸 함수, 타이머 콜백과 가상 시계 펌프다. 조건문의 계량 횟수는 **조건 평가를 포함한 문 완료 수**이며 조건 안 함수가 매번 실행됐다는 뜻은 아니다.
5. `frame:setup-and-dispatch`는 다른 문을 덜어 낸 실제 gameTick 콜백 self CPU다. 로컬 변수·클로저 준비/함수 본문 나머지와 관측 bookkeeping을 포함한다. 실제 소스의 35개 선언을 frame-self-statements.json에 보존했다. 게임 모델의 빈 비용으로 가정하지 않는다.
6. `other::unattributed-native`와 배경 CPU 중 GC로 확인되지 않은 `unattributed-background`는 **미분류**로 남긴다. 이 둘은 분해율 분자에 넣지 않는다. 분해율 = (기타 CPU−이 미분류 합)/기타 CPU. 이름을 바꿔 미분류를 없애지 않는다.

## GC — 실제 thread CPU, 중복 제거

- Node native trace categories `v8,disabled-by-default-v8.gc`를 켠다. CPU 필드는 **tts/tdur**(thread timestamp/duration μs), 경과 필드는 **ts/dur**다. 경과 지속시간을 CPU로 쓰지 않는다. 별도 메커니즘 실험의 실제 예는 gc-clock-proof.json에 있다.
- `MinorGC`/`MajorGC` B/E의 tts 차이 및 `V8.GC…`/`v8.gc` 카테고리 X의 tdur를 수집한다. 이름에 GC가 없는 ConcurrentMarking/RememberedSet 작업도 카테고리로 포함한다.
- **같은 tid의 CPU 구간을 합집합**으로 만든다. 부모 GC·자식 단계·병렬 단계의 겹친 시간을 중복 합산하지 않는다. 서로 다른 tid의 CPU는 더한다.
- 배경 GC는 실제 배경 thread CPU에서 떼어 별도 기타 칸에 둔다. 나머지 배경 CPU를 전부 GC라고 부르지 않는다(JIT·I/O·추적기 등은 미분류 잔여).
- main GC의 소유 구간은 PerformanceObserver의 실제 시작 시각과 최근 구간 전환 ring을 연결한다(100μs 허용). **CPU 양 자체는 native tts/tdur**다. 매칭한 양만 원래 함수 칸에서 빼 같은 큰 갈래의 GC 칸에 더한다. 매칭하지 못한 GC는 원래 콜백 칸에 남기고 진단량을 별도 표시한다. 이 진단량을 표 합에 다시 더하지 않는다.
- 회전 파일은 `trace-${pid}-${rotation}.json` 전부 읽는다. metadata/GC B/E가 파일 경계를 넘을 수 있어 상태를 이어 읽고, 마지막에 thread별 CPU 구간 합집합을 구한다.

## 관찰기와 타이머

- 원래 ledger 관측기 외피와 새 일별 JSON 쓰기는 observer, 실제 모델 scanDay/발생기 next는 econ 안 사건 장부다. 별도 구간으로 중복을 뺀다.
- setInterval/setTimeout/setImmediate의 **정적 소스 위치**를 AST로 붙인다. ms 식을 한 번만 평가하고 인수·this·반환 타이머를 보존한다. 소스 위치별 등록 수, 실제 콜백 진입 수, 요청 주기 분포를 기록한다.
- interval 등록 수, source 종류 수, 종료 시 heap 길이는 다른 수다. 종료 큐를 살아 있는 간격 수로 바꿔 부르지 않는다.
- 가상 시계의 `RT.setImmediate(pump)`는 별도 `clock:virtual-timer-pump` 함수로 잰다. 주기는 매400개 가상 콜백 뒤 실제 I/O에 양보하는 방식이다. 실제 시계 서버의 product 콜백과 판자의 가속기 비용을 구분한다.

## 일별 값과 단가

- scanDay가 끝난 시점(마지막은 exit 관측)의 process CPU·main CPU·갈래 차분·인구·몸·프레임을 적는다. 마지막 날의 구간은 process.exit 안에서 닫힐 수 있어 완료 호출 수는 마지막 열린 호출을 세지 못할 수 있다.
- 경제 인구와 players Map 몸(캐러밴·병사 포함, 동물 mobs 제외)은 다르다. 첫날은 부분 날이고 기동도 포함한다. 그래프의 전체 CPU는 분리한 기동을 뺀다.
- 일별 함수 곡선은 **GC 포함 콜백 CPU**다. 전체30일 표는 매칭 GC를 떼어 별도 표시한다. 일별 별도 GC 진단을 일별 콜백 CPU에 더하지 않는다.
- “이것만0”은 그 덩이 CPU만 빼고 나머지는 그대로 둔 산술 시나리오다. 실제 최적화 판정을 대신하지 않는다.
- 함수의 inclusiveUs/categoryUs 호출 통계는 중첩되므로 합산 표로 쓰지 않는다. path-core 평균은 export API 생애(기동 포함)의 inclusive CPU/완료 호출이며, 실행 중 exclusive path 표와 다르다. 시작/재개/pathStep/smooth를 합쳐 새 A* 수로 부르지 않는다.

## 계측 비용·예비 실행

- 빈 계량 쌍 5×100,000회는 1.36–2.06μs/쌍이었다. 실제 경로의 key/GC/JIT 분포는 달라 이를 정확한 보정값으로 빼지 않는다. 숫자는 **관측을 포함한 실제 CPU**다. 작은 문은 관측 비용의 영향을 특히 받는다.
- 한 날 plain/관측의 raw world는 같았다. 본 판의 첫날도 plain과 직접 비교했다. 예비 관측판은 native-event-loop 귀속을 바로잡기 전 버전이므로 본 판 CPU 표에 쓰지 않는다. 당시 소스 두 개를 manifest SHA와 일치하게 보존했다.
- 초기 관측기 경로/CJS 파서 수정은 기동 확인 단계였다. 첫 긴 시도는 회전 번호 없는 trace 파일명이 앞 구간을 덮는 것을 발견해 **18일에서 명시 중단**, 완주로 세지 않았다. 부분 CPU/GC를 새 판에 이어 붙이지 않는다. interrupted-trace-rotation.json에 실제 상태를 남겼다.
- 유효 본 판은 `/tmp/t1270-main30-final` 한 번의 처음부터30일 완주다. 회전 파일 전체, 실제 종료0/clock0/판 JSON/51곳 양수 시딩을 함께 확인한다.

## 새 끔 기준선

```bash
T577_PORT_BASE=45000 T1241_DES=0 \
 /workspace/.tools/node-v22.23.0-linux-x64/bin/node scripts/server-baseline-check.js \
 계측/서버기준선_2026-11-11.json --vclock --plan 1020:400
```

시계 보정 T1253/T1258은 main 기본 켬 그대로다. 인구3914·날/마을 지문400일·판 JSON/여덟 수 **같음1/1**, 실제 종료0, 645초. 몸 전부/농사 켬 30일과 다른 기준선 게이트이며 속도를 직접 비교하지 않는다.

DB는 원자료에서 제외하고 JSON/JSONL/log/native trace를 gzip(mtime0) 보존한다. 저장소 루트에서 `sha256sum -c 계측/T1270_2026-11-12/SHA256SUMS`로 원자료·도구·보고를 검증한다.

## 타이머 전수 대조와 회전 검증

정적 등록기는 interval14개, 가상 시계는15개였다. 별도 timer-audit.cjs(plain 한 날)에서15개를 전부 등록 시 읽었다. 차이1개는 Node core `Server.setupConnectionsTracking (node:_http_server:548)`의30초 연결 점검이었다(첫날39회). 감사 판의 첫날 세계 값도 plain과 같다. 본 판에서 이 콜백 CPU는 가상펌프 칸에 합쳐 있으며 독립 비용0이라고 하지 않는다. 그 칸은 “펌프+Node HTTP 연결 점검”으로 읽는다. timeout 등록이 가상 시계와 같은지도 확인하고, 전체 가상 fired에서 등록기 callback 진입 합(실제 setImmediate 제외)을 뺀 값으로 이 Native콜백의 전체 호출 수를 구한다.

기존 NPC 안 `__t1241Clock` 두 번과 카운터 갱신은 몸 결정 CPU에 남는다. observer 칸만으로 모든 관측 비용이라고 부르지 않는다. 바깥 계량·GC추적 비용도 관측된 CPU에 포함되며 임의로 빼지 않았다.

회전 검증은 별도 Node에서 다음처럼600,000개 AsyncResource init/destroy를 만든 메커니즘 실험이다. 게임 판이 아니다. trace3개에 init600,000개가 모두 남음을 rotation-proof.json에 기록했다.

```bash
node --trace-event-categories=node.async_hooks \
 '--trace-event-file-pattern=/tmp/t1270-rotation-async/trace-${pid}-${rotation}.json' \
 -e "const {AsyncResource}=require('node:async_hooks');for(let i=0;i<600000;i++)new AsyncResource('rotation-check').emitDestroy();"
```

SQLite는 prepare/exec/run/get/all/iterate 호출 범위를 잰다. iterate 반환 커서의 후속 next CPU는 이를 소비하는 함수 칸에 남는다. GC 추적은 preload에서 켠 뒤부터이며, 그 앞의 초기 Node/관측기 로딩 CPU는 원래 기동/배경 칸에 남는다.
