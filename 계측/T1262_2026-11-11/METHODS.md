# T1262 재현·단위

- 제품 베이스: main `7f5696bcb238d6dd64c99c5e2b312af5dbbdcf99`(land1066 포함). 계측 대상은 main 제품이 아니라 지시서가 고정한 V4 `08bf759726a14218b1bc8e43672132a253c0b2d0`의 독립 archive다.
- Node v22.23.0 Linux x64. 공식 배포 tarball과 SHASUMS256.txt 일치 확인 후 사용. 과거 V4 문서는 v22.23.4로 적혀 있으므로 과거와 현재의 절대 시간 차이를 코드 개선으로 해석하지 않는다.
- CPU quota 4, affinity 허용 0–4. 두 본 판은 tick 0,1 / event 2,3으로 서로 다른 affinity, 동일 2 CPU 폭. 기동 무렵 짧은 검증·OFF가 함께 실행되었고, 공유 자원 영향이 남는다. wall 배속은 알고리즘 개선 판정에 쓰지 않는다.
- `lab-wiring-check.js`: main/V4 각각 실패0·경고1. 기본 sandbox의 child spawn EPERM 결과는 유효 검증에서 제외하고 실제 실행 권한으로 다시 실행했다.

## 명령

```bash
mkdir -p /tmp/t1262-v4
git archive 08bf7597 | tar -x -C /tmp/t1262-v4
ln -s /workspace/Mini/node_modules /tmp/t1262-v4/node_modules
T1243_FARM_ON=1 T577_PORT_BASE=51000 taskset -c 0,1 \
  /workspace/.tools/node-v22.23.0-linux-x64/bin/node scripts/t1262/run.cjs /tmp/t1262-tick30 30 0
T1243_FARM_ON=1 T577_PORT_BASE=53000 taskset -c 2,3 \
  /workspace/.tools/node-v22.23.0-linux-x64/bin/node scripts/t1262/run.cjs /tmp/t1262-event30 30 1
```

두 명령은 별도 실행기에서 동시 실행했다. runner는 `T1241_PROBE=1`, 원래 T1248/T1241 관측기, 가상 시계, `VILLAGE_DAY_MS=1440000`, NPC cap Infinity, seed1020을 고정한다. Infinity는 원래 T577가 운영 무제한으로 정규화한다. 집·상단은 운영 기본 켬이다. 새 출력 디렉터리로 실행해야 한다. 계측 전용 스크립트의 제품 파일 쓰기는 없다.

```bash
T1253_CLOCK_FIX=0 T1258_ARTISAN_CLOCK=0 T1241_DES=0 T577_PORT_BASE=47000 \
  /workspace/.tools/node-v22.23.0-linux-x64/bin/node scripts/server-baseline-check.js \
  계측/서버기준선_2026-11-08c.json --vclock --plan 1020:400
python3 scripts/t1262/analyze.py 계측/T1262_2026-11-11 /tmp/t1262-tick30 /tmp/t1262-event30
```

현재 main의 기본 시계 보정은 켬이며 새 기준선 인구3914다. 요청된 구 기준선3867은 두 보정 손잡이를 명시적으로 끈 별도 게이트다.

## CPU 회계

V8 wall 샘플이나 원래 T1241의 nsStep/nsMove/nsQueue를 CPU로 쓰지 않았다. `process.threadCpuUsage()`의 user+system 마이크로초를 콜백/벌크 문 전후에 읽어 **중첩을 제외한 main thread CPU**를 적산했다. 구간 전환마다 이전 구간에 차이를 더하므로 서로 다른 칸은 겹치지 않는다. 전체 존 프로세스의 `process.cpuUsage()`에서 main thread 합을 뺀 스레드 CPU(GC 등)는 기타에 둔다. 관리자/스텁 프로세스는 제외한다. 표의 아홉 칸 합은 실제 존 CPU 합과 같다.

- 몸 틱: `_decOne` 전체 순회·`_moveOne` 전체 순회·`sepNpcs`·DES 큐 `_desPulse`. NPC마다 CPU syscall을 넣지 않았다. 개별 생존/게이지·공간 재구축 등 별도 문은 기타다. 기존 npcStep 안 T1241 clock 탐침 비용은 이 벌크 문에 포함된다.
- econ: 일 조각 `econ`, `tickWorldV2Parts` head/village/trade/caravans/tail. 마을 호출 수·단가를 따로 기록한다. 실제 사건 장부 scan과 그 발생기 next도 이 칸이다.
- 생활층 하루 끝: econ/save/dist 외 일 조각(생활·상단 동기·영토·도로·방송 등). 세부 job 이름별 호출 수도 원자료에 있다. 평시 프레임 작업까지 모두 하루 마감으로 옮겨 세지 않는다.
- 길찾기: `sim/path-core.js` export 6개. 시작 API, `pathStep` 재개, smooth를 구분한다. 호출 평균은 **inclusive main-thread CPU / 호출 수**이며 기동 중 호출도 포함한다. 표의 길찾기 몫은 기동을 제외하고 중첩도 제외한 값이므로 그 평균×전체 횟수와 같다고 하지 않는다.
- 교역로: warm/redig/dist/background 재개. 그 안 path-core CPU는 길찾기에 둔다.
- 저장: 일 save, `_periodicSave`, SQLite prepare/exec/close 및 statement run/get/all/iterate의 호출 CPU. JSON 준비는 감싼 저장 문 안이면 포함된다. 이 실행의 SQLite iterate가 동기 반복자를 돌리는 경우, 이후 `.next()` 비용은 호출자의 칸에 남는다.
- 관찰기: 원래 훅의 scanDay 외피·body probe, 새 날별 계측 쓰기. 실제 모델 scan은 안쪽 econ으로 돌려 중복을 뺀다.
- 기동: preload 진입 전부터 **첫 실제 game tick 진입 전까지 main-thread CPU**. 기동의 background thread CPU도 위 원칙상 기타다. 프로파일 AST 파싱/컴파일도 기동에 포함된다.
- 기타: 위에서 감싸지 않은 게임/타이머/이벤트 루프·공간/몸 보조 문·프로파일 전환 비용 및 다른 스레드 CPU. 이것을 모두 제거 가능한 관리비로 간주하지 않는다.

`calls`의 inclusiveUs/categoryUs는 원인 설명용 중첩 통계다. 서로 더해 CPU 표를 만들면 안 된다. 최종 process.exit가 관측기 내부에서 발생하므로 마지막 열린 호출의 CPU는 칸 합에 들어가지만 완료 호출 수에는 들어가지 않을 수 있다.

## 날짜·외삽·계측 영향

`profile-days.jsonl`은 scanDay가 끝난 시점(마지막 날은 exit 관측기)의 누적/차분 CPU·경제 인구·players 실제 몸/AI Set/사건 소유 몸을 기록한다. body 수는 캐러밴·병사도 포함한 players Map이며 동물 mobs는 별도다. 첫 경제 날은 시작 현지 시각 때문에 완전한 24분보다 짧고 기동도 포함한다. 곡선은 기동을 빼며 400일은 **기동 1회 + (30일 CPU−기동)×400/30**이라는 일정 일 단가 가정의 시나리오다. 새 인구·이벤트 분포의 400일 실측으로 부르지 않는다.

관측을 붙인 원본과 plain 대조의 첫날 원시 세계 trace를 비교한다. 별도의 FARM0 초기 smoke도 보존하며 최종 FARM1 본 판과 혼합하지 않는다. 짧은 CPU 차이는 AST/계측 overhead와 공유 CPU 부하가 함께 들어 있어 순수 탐침 비용 추정이 아니다. 표는 탐침 비용을 임의로 빼지 않은 관측된 CPU다. 원래 V4 PROBE1을 끄거나 제품 최적화를 하지는 않았다.

## 보존

각 본 판 source/status/profile/day trace/T577 JSON/로그와 종료 메타데이터를 gzip(mtime0)으로 보존한다. DB는 제외한다. SHA256SUMS는 커밋에 포함한 증거 파일만 대상으로 한다. frozen V4 제품 해시, main 변경 파일 목록, 실제 결과 상태를 마지막에 다시 확인한다. 두 가지의 기존 보고 원문과 제품 diff는 refs.json의 고정 SHA에 대응한다.

저장소 루트에서 `sha256sum -c 계측/T1262_2026-11-11/SHA256SUMS`로 커밋 대상 원자료·도구·보고 해시를 확인한다. main과 V4의 package-lock.json SHA는 같으며, 설치된 node_modules의 숨은 lock은 별도 형식의 파일로 따로 기록했다.

원래 `days.jsonl.meta.json.cpuSeconds`는 T1248 훅 로드 뒤부터의 창이다. 새 `profile.json.processUs`는 프로세스 시작부터 마지막 계측 시점의 창이므로 preload/AST 준비 CPU 등이 더 들어간다. 두 창의 차이를 `source-validation.json`에 기록하며, 표는 항상 새 processUs와 그 아홉 칸 합을 쓴다. 마지막 profile JSON 쓰기 뒤의 종료 꼬리는 포함하지 않는다.
