# T1248 V4 측정 방법

## 소스와 런타임

- 저장소 simjaemin1/Mini, main25591a58에서 시작. 제품 V4는5ad9d3b8의 네 게임 파일이며 이후 커밋은 관측/보고/원자료다. `v4-game-source.json`으로 구분한다.
- Node22.23.4: `source /workspace/.toolchains/activate-mini-node.sh`. 최초 온보딩의 검증된 설치/시작 지침은 환경 초안에 저장돼 있다. Node24의 다른 기존 기준선 결과를 이 런타임 결과와 섞지 않는다.
- 계측에는 frozen-v4의 server/sim/scripts 복사와 같은 public/node_modules를 사용했다. 재현은 같은 게임 파일 해시의 기존 체크아웃에서 가능하다. 새 Git worktree는 필요하지 않다. 긴 판 중 제품/관측 소스를 바꾸지 않는다.
- `source.json`은 게임/기존 T577와 관측 hook/runner의 SHA256을 남긴다. 종료 시 소스 검증은 별도 파일에 둔다.

## 재현 명령

아래는 저장소 루트에서 실행한다. 출력 경로는 매번 새 디렉터리를 쓴다. 이 문서는 실행 기록의 실제 ROOT/OUT 값과 함께 읽는다.

```bash
source /workspace/.toolchains/activate-mini-node.sh
mini_task_out=$(mktemp -d /tmp/mini-t1248.XXXXXX)
T1248_OUT="$mini_task_out" T1241_DES=1 T1243_FARM_ON=1 T1248_CHECKPOINTS=30,100 node scripts/t1248-run.js 100 1020
```

틱30일은 DES=0/FARM=1/인수30, 1마을400일은 VILLAGE_MAX=1/인수400, 기본 대조는 FARM=0이다. 독립 반복은 새 OUT/새 프로세스로 처음부터 실행한다. 전체51마을 판에서는 VILLAGE_MAX를 설정하지 않는다.

runner는 VILLAGE_DAY_MS=1440000, VILLAGE_NPC_CAP=Infinity를 T577에 전달한다. T577가 Infinity 문자열을 자식 env에서 제거해 운영 무제한 기본을 적용한다. villages.js에 문자열 Infinity를 직접 넘기면 같은 뜻이 아니므로 이 정규화 경로를 사용한다. 집 행위/캐러밴은 제품 기본 켬이며 T1244의 집/캐러밴끔 시간과 직접 배속 비교하지 않는다.

공식 OFF의 종료 시계 로그는 stdout 파이프 끝부분 절단으로 확보되지 않아 오류 수를0으로 간주하지 않는다. checker0/400일JSON/1:1일치를 확인한 게이트이며 다른 계측 hook의 clock0 증거와 구분한다. 공식 OFF는 다음 별도 게이트다(빠른 기준선 시계이며 라이브 연간 비용 아님).

```bash
T1241_DES=0 T1243_FARM_ON=0 node scripts/server-baseline-check.js 계측/서버기준선_2026-11-08c.json --vclock --plan 1020:400
```

관련 하네스: `node scripts/test-t1241-des.js`, `node scripts/test-move-soa.js`, `node scripts/test-t1248-nopoll.js`. 실제 V4 결과는58/0,286/0,3/0. 미끼의 자식1은 의도한 검출이며 정상 검사의 실패를 숨긴 것이 아니다.

## 완주와 중간 관측

- 실제400/30/100일: 자식0·요청 일수 이상 결과JSON·가상 시계오류0·양수 시딩을 모두 확인한다.
- 1마을 진단은 T577의 고정40마을 단언 때문에 부모1을 그대로 남기고 위 조건을 독립 검증한다. 부모1을0으로 고쳐 쓰지 않는다.
- 사건30일은 실제100일 판의 immutable checkpoint30이다. 별도30일 자식 완주가 아니다. 100일 종료 검증이 뒤따른다.
- V3의 시작 전 취소 세 판은 skip77/validfalse다. V4의 새 완주 판으로 대체했으며 통과 수에 넣지 않는다.

## 실제 N 전체 틱 비용

51마을·FARM0·T315_MAPBEDS0·인위 시딩77/314명으로 실제3927/16014명을 만든다. T1248_TICK_BENCH=1, EXPECT_N=3900/16000, BENCH_WARMUP=300, BENCH_TICKS=1000, T577_CAND_SEEDPOP=77/314, 인수1이다.

실제 onGameTick 콜백 전후의 process CPU와 hrtime wall을 매 틱 읽는다. 관측 소유 몸 수는 시간 창 뒤에서 세고, 표본의 실제 몸 수·소유 수·1000 CPU/wall 표본·자식0/시계오류0을 확인한다. 기존 PROBE1 비용 포함이다. 창 완료 SIGTERM은 정상 fixture 종료이며 T577 하루 완주로 세지 않는다. `benchmarkFixtureCompleted`와 `fullDaysCompleted`를 분리한다.

최종 표는 `v4-controlled-scale-*`: 나머지 비핵심 판 모두 종료 후 CPU1–3에서 네 창을 순서대로 잰다. 전체100일 판은 CPU0에서 계속될 수 있고 각 시작 조건을 기록한다. 혼합 부하 `v4-scale-*` 및 V3 비용은 원자료로 보존하지만 최종 표에 섞지 않는다. 공유 캐시/메모리 영향은 남으므로 CPU와 wall을 함께 제시한다. 빈 큐 커널 벤치는 실제 전체 존 비용의 대체가 아니다.

## 시간·부하·자리

전체100일은 시작부터 모든 스레드 CPU0, 다른 초기 판은CPU1–3에서 공유 실행했다. 초반30일의 경과64.387분/400일 외삽858.488분은 이 조건의 실제 관측/단순 외삽이다. 400일 실측이 아니며,100일 이후 인구·작업 비용 변화는 예측에 없다. 최종100일 외삽도 같은 한계를 적는다.

CPU는 zone process user+system(부모·중앙stub 제외). meta의 wall은 preload 시작부터 종료까지 real hrtime이다. nsStep/nsMove/nsQueue는 벽시계 구간이며 CPU 비율로 빼거나 나누지 않는다. V2 inspector self 표본은 첫3일/기동을 포함한 이전 소스 진단이다.

body trace의 첫 d=-1은 기동+첫 부분 날이며 기동만의 비용이 아니다. 이후 d=scanDay-1이고 d=0행은 없다. 누적/증분 구간을 섞지 않는다. 자리 CP는 원래 T1241의10일마다 현지 한낮, 안정 신원,32px=1m,좌표0.01px 기록이다. 실제 CP/짝 수·가운데/p90/최대·신원누락과 시점별 가운데를 함께 제시한다.

## 공식 동일성과 원인

SBC의 econ 날/전체12자리 지문·마을 곳간/사람/집/금고4자리씩을 그대로 쓴다. 일치 기준은 바꾸지 않는다. 정본 R6 원문에서 첫 마을/필드/값을 함께 저장한다. 원시 개간칸/작물 장부는 공식 네 칸과 별도 관측이다. 밭끔 공식400/400과 개간235/222가 공존하는 이유다.

과거−5.1%는8c02124c의 고정 server/sim/scripts와 세 실험 갈래만 넣은 historical 소스에서 재현한다. 농부 걸음 제외는 보조 대조. 첫 결정 즉시는 아침 창 자체 제거가 아니며44px은 건축에도 영향을 준다. 추가 아침 창 대조는 같은historical-window 소스의 DAWN1 대조와 DAWN1+NATIVE_MORNING1을 비교한다. 정본0.137 문턱의 사건 기한을 정본TICK_MS 하나 앞당기며 실제 선택된 windowCuts/windowCutMs를 남긴다. 다른 판과 큰 인구 순차 계측이 끝난 뒤 실행한다. 전체 아침 창 제거와 구분한다. 농부 전용 후속 한 판은 해당 술어에simJob===farmer 한 줄만 더한 별도 소스이며, 공통 첫결정 대조와 비교하고 소스가 동일하다고 보지 않는다. 추가 반경 대조는 개간 출근만 대상으로 원래Route를 자르지 않고, 위치별빠르기/시각과 기존nextDecisionAt을 써44px에서 가능한 첫 결정에 깨운다. 모든작업 경로를 자른 기존STOP44와 구분한다. 기한 조정 카운터들은 최소 토막 수락 전 선택 수여서 실제 새 사건 수와 다르다. 준비 몸 순서는 별도 frozen-v2 쌍으로 권한 배정 전체의 인과를 확정하지 않는다. 다른 소스의 수치를 현재 V4 성공으로 쓰지 않는다.

## 증거의 한계와 보존

FIFO는 기존 선점 뒤에 연결했고 정본 권한/수량 예약 전체를 교체하지 않았다.30일 즉시 승인되지 않은 시설 요청은0회였고100일 최종은22,855회/전체요청2,982,417회다. queued는 이미 줄에 있는 몸의 재요청을 포함할 수 있어 새 삽입 수·고유 몸 수·서비스 완료 수가 아니다. 첫 양수 일 기록은scanDay35다. workKinds는 작업토막 개시 수이며 대기·분할·재개를 포함하므로 작업 완료 수가 아니다. 작물은 시작 효과+후속 체류 종료다. 중앙 미방문 fixture0은 화살/유령 동기화 등 남은 전체 players 열거를 포함한 전역0의 증명이 아니다. 실제 native 재시작 바인딩 진단은 자연8/8/번호변경0/8로 요구 실패를 재현했다(네 자식0/clock0, 하네스1). SQLite 큐+몸 한 행 저장은 다운타임/세계 원자 재시작 전체 검증이 아니다. PID fixture overlay를 포함한 코드를 기록했고 장기 판/게임 파일은 그대로다.

V1/V2/V3 대체 판·컨트롤러 종료 시 자식이 남는다는 틀린 추정·07:11 세션 소실의 실제 부분 날수와 종료 메타 부재를 보존했다. 중단 판을 이어 붙이거나 완주로 세지 않았다. 새 foreground 호출을 끝까지 await해 자식이 유지되는 것을 확인한 후 처음부터 재실행했다.

JSON/JSONL/log는 gzip mtime0으로 보존하고 DB는 제외한다. 유효 완주/fixture 폴더에는 archive-validation marker, 부분 판에는 validfalse interruption marker를 둔다. SHA256SUMS는 커밋에 포함한 파일만 대상으로 만들고 확인한다. 소스/측정 조건/타이밍과 원문을 보존하며 이전 실패를 최종 성공으로 덮지 않는다.

최종 final-source-and-timing-validation.json은 선택29개 계측의 기록된 소스 파일 해시와 완료 상태를 확인한다. V4 제품4파일 및 기록된 관측 코드 해시는 현재 파일과 대조했다. 초기 historic-tick400/proto400의 관측 코드 해시는 미기록으로 남겼다.30일 사건 체크포인트와 틱 종료의 가상 시각은1767268547528.4807ms로 같다. 공식 OFF의 종료 시계 오류 수 미확인과 별도 실제 재시작 요구 실패를 일반 계측 성공과 분리한다.
