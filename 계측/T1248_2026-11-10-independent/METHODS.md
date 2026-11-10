# T1248 측정 재현 메모

기준 main 25591a58. Node v22.23.4. 라이브 시계 1440000 ms/날, 몸 상한 Infinity. 가상 시계 T745. 시드 1020.

현재 코드: /workspace/Mini. 예전 시제품: git 8c02124c(server,sim,scripts) + historical-ablation.patch. 당시 원본 틱·사건 판도 같은 패치 소스에서 손잡이만 끔.

실행 순서와 분기: cases.json, historic-cases.json, batch.py, historic-batch.py, scale.py 참조.
- 기본 밭 끔: tick400 / candidate400-final / proto400 및 나머지 6개 원인 분리 판, 마을1.
- 같은 판 반복: candidate400-replay. 끔 기존 코드: tick-old, main25591a58 복사본.
- 밭 켬: farm-tick400 / farm-candidate400, 마을1.
- 전체51마을 밭 켬: full-des30 / full-des100. prefix 동일성도 별도 비교.
- 실제 부하: scale-3900-{0,1}, scale-16000-{0,1}. T577_CAND_SEEDPOP=77/314, T315_MAPBEDS=0, 밭 끔. 자연 인구 판과 구분.
- 공식 OFF: T1241_DES=0 node scripts/server-baseline-check.js 계측/서버기준선_2026-11-08c.json --vclock --plan 1020:400. 원본 /tmp/sbc-7OXw5p, off-source.json.

환경 실행은 source /workspace/.toolchains/activate-mini-node.sh 후 수행. NODE_OPTIONS는 t1248-run.js가 t1248-hook → t745-vclock → 공식 SBC 순으로 설정한다.

공통 관측 PROBE=1. CPU=process.cpuUsage(user+system), wall=실제 hrtime. 여러 판 동시 실행 때문에 wall 비교에는 CPU 경합이 포함된다. 몸 한 틱 계측은 결정/이동/힙의 범위만이며 전체 존 tick 값과 다르다.

큰 인구 tick 관측은 실제 onGameTick 콜백 전체를 감싼다. 3,900명은 첫 scanDay까지 wall 매 틱, CPU 256틱당1회. 16,000명은 실제 인구 >=기대90% 이후 300틱 예열·1,000틱 표본이며 CPU도 매 틱이다. 틱 window 종료는 의도한 SIGTERM 정상 종료로, T577 하루 완주와 구분한다. >=기대 인구90%인 샘플만 사용. 기존 마이크로타이머 포함. 1일 판은 첫 scanDay까지의 기동/첫날 구간이며 정상 연간 평균이 아니다. tick-observer3/passivity.json은 관측 켬/끔 공식 지문3일 비교.

마을1에서 T577 부모는 고정된 >=40마을 시딩 단언 때문에 exit1. 자식 종료0, JSON400일, 가상 시계 오류0, 양수 시딩을 독립 검사한다. 부모 성공으로 바꾸어 기록하지 않는다.

scale-3900-0 최초 status.valid=false는 결과 파일 이름 가정(base 대신 seedpop77) 버그다. 원본 status를 보존하고 independent-validation.json에 실제 자식 JSON/종료/시계 오류를 재검사한 결과를 남겼다. 이후 러너는 파일 접미사로 찾는다.

중단/실패 초안: superseded-candidate.json, superseded-v1-processes.json, superseded-v1/ 및 smoke*. 최종 증명에는 사용하지 않는다. 중간 v1은 공통 crop dwell 키 문제와 잔여 순회를 고친 뒤 다시 시작했다. 원본 로그와 소스 사본의 계보를 남긴다.

전체 DB 파일은 저장소에 넣지 않는다. gzip은 원본 JSON/JSONL/로그를 압축할 뿐 지문값을 고치지 않는다. SHA256SUMS로 보관 파일을 확인한다.

16,000명 제어기 scale16000.py는 명시적 T1248_BENCH_TICKS=1000, WARMUP=300. 기존 scale.py 제어기만 종료했고 3,900명 자식은 계속 완주했다(scale-controller-retired.json). tick-window-check는 실제 8명·1000 CPU/wall 표본·자식0·시계오류0, 부모 T5771(의도한 조기 종료)을 확인했다.

원격 동일 카드 가지 기존 작업을 보존했다. 2026-11-10 04:46 UTC a47e08a5가 이미 원격 batch/des-work-1110에 있어 최초 푸시가 거절됐다. 이번 코드는 batch/des-work-1110-independent/3b852a5e로 분리 푸시했으며 기존 코드와 증명을 혼용하지 않는다.

최종 v3(998fe42d): 남은 밀기/비GC낚시/스냅샷/입력 순회 제거, 동일 몸 재등록 제외, 생존/열좌표 모드 전체 틱 폴백. v3-game-source.json으로 제품고정. v3-full-des30/100, v3-full-tick30, v3-{farm-}tick400/candidate400 및 farm-replay400, v3-scale4판, v3-off를 새로 실행한다. v2 전체세계12/7일은 중단해 최종30/100증명에서 제외했다.
제어기만 종료하려던 v2 handoff는 실행세션 정리로 자식도 종료됐다. controller-handoff-correction.json 참조. tick400335/candidate295/proto355 및 scale3900DES 미완료는 완주로 세지 않는다. 진행 중 제어기는 더 이상 종료하지 않고 최종소스 대조를 새로 수행한다.
새 부하4판은 전부 실제51마을, 초기77/314명씩, 침상제한끔, 밭끔, 300예열+1000틱 CPU/wall 동시표본으로 통일했다. 타이머는 측정함수 전후의 process CPU와 hrtime wall이며 소유수 집계는 함수시간 밖이다. 이 부하판의 body_count 집계를 생산 경로의 몸 순회0 증명으로 사용하지 않는다(별도 실제100틱 미방문/미끼 하네스3/0).

2026-11-10 06:16:30 UTC: 네 V3부하 판이 모두 완료된 뒤,4 CPU 할당량을 위해 100일판 전체 스레드를CPU0으로, 다른 이번 작업의 제어기/엔진을CPU1,2,3으로 배정했다. 당시 세계판은각8일이었다. affinity-transition.json 및 실제100일엔진11스레드CPU0 확인 affinity-verification.json 참조. 게임/가상시계/소스는 바꾸지 않았다. 30일·100일의wall은 서로 다른 자원 조건이고,100일 자체도 전/후 혼합 조건이다. CPU와wall을 나누고400일 외삽은실측과구분한다. unreadable /proc목록은 대상이 아닌 종료/다른 프로세스의 읽기 실패이며 실제100일엔진은 별도 확인했다.

## V4 current source and execution lifetime
V4 changes only npcs.delete body index retention; original AI-set deletion is not players body deletion. Before/after role fixtures and 58/0,286/0,3/0 logs are preserved. Queue metrics are wall instrumentation, process user+system is CPU. Thirty-day DES observation is an immutable checkpoint inside one actual100-day run, not an independent completed30-day child. Checkpoints cannot replace completed100-day exit validation. Old V3 queued FARM cases explicitly skip77/validfalse and are replaced by V4.
All old active sessions disappeared around07:11UTC, cause unestablished. session-loss-v4.json records exact partial daily counts. Detached probe died; fully awaited foreground probe completed. New orchestration keeps the outer call alive until every child finishes. No partial run is spliced or counted complete. V4world100 CPU0; remaining V4 measurements share CPUs1,2,3. A valid N3927 OFF1000tick fixture completed before interruption and remains usable; no unfinished V4 case is reused.
