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
