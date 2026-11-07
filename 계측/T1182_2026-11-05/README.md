# T1182 계측 재현

판정과 수치 정의는 `보고/T1182_2026-11-05.md`에 있다. 제품 코드 기준은 `50f87fd3`, 시작 main은 `863acbf1`이다. Node 22.23.4 / ICU 78.3을 사용한다. 기본 Node 24로 바꾸면 수정 전 소스도 공식 기준선과 달라진다.

`summary.json`은 서버/랩 표의 원자료다. `measurements.json.gz`는 UTF-8 JSON 객체이며, 각 키는 상대 파일 이름, 값은 원본 파일 내용이다. `manifest.json`에 원본별 SHA256과 압축 파일 SHA256이 있다. DB와 대형 실서버 로그는 싣지 않았다. 경계 시험 로그와 최종 상태, 계측 관측, SBC 판 JSON/날별 지문은 보존했다.

```bash
# 저장소 루트, 고정한 Node 활성화 후
node scripts/t1182-table.js /tmp/t1182-server /tmp/t1182-lab

# 원본 하나를 열기
python - <<'PY'
import gzip,json
with gzip.open('계측/T1182_2026-11-05/measurements.json.gz','rt') as f:
    data=json.load(f)
print('\n'.join(data))
print(data['server/both-plan/sbc-1020.json.t1182.json'])
PY
```

## 서버

같은 호스트에서 서버 하네스는 한 번에 하나씩 실행했다. `(body,escort)`는 off `(0,0)`, body `(1,0)`, escort `(0,1)`, both `(1,1)`이고 `T1136_BASKET=0`을 유지한다.

```bash
export T762_CARAVAN_BODY=1 T1136_ESCORT_CARRY=1 T1136_BASKET=0
export NODE_OPTIONS="--require $PWD/scripts/t1182-observe.js"
node scripts/server-baseline-check.js 계측/서버기준선_2026-11-04c.json \
  --plan 1020:400,7:60,42:60 --par 1
node scripts/server-baseline-check.js --make /tmp/t1182-candidate.json \
  --days 800 --seeds 1020 --par 1
# 몸을 멈추고 시계만 흘리는 30일 반례
T1182_FREEZE_UNTIL=10 node scripts/server-baseline-check.js \
  --make /tmp/t1182-freeze.json --days 30 --seeds 1020 --par 1
```

끔 공식 기준선은 두 손잡이를 0으로 하고 `--days 400 --seeds 1020,7,42 --par 1`로 비교한다. 켬 비교의 종료 코드 1은 결과 차이이며, 실행 오류와 구분한다. 후보 `--make`는 `/tmp`에만 쓴다.

## 랩

각 모드에서 1020,7,42를 각각 800일 돌린다. base는 두 정본 소스만 시작 main의 git 객체에서 읽는다. 나머지 상대 의존성은 같은 저장소 파일이다. off/body/escort/both는 현재 코드, basket은 두 손잡이와 바구니 모두 1인 시험이다.

```bash
T762_CARAVAN_BODY=0 T1136_ESCORT_CARRY=0 T1136_BASKET=0 \
T17_JSON=/tmp/t1182-base.json \
NODE_OPTIONS="--require $PWD/계측/T1182_2026-11-05/reproduce-base-preload.js --require $PWD/scripts/t1182-lab-observe.js" \
  node scripts/t17-metrics.js 800 1020
```

## 경계·강제 종료·브라우저

```bash
HANDOFF_ACK_MS=12000 HANDOFF_TOKEN_MS=15000 \
T762_CARAVAN_BODY=1 T1136_ESCORT_CARRY=1 T1136_BASKET=0 \
T1030_XZ_MARKET=1 XZ_WAIT_S=600 \
T1182_OBSERVE_DIR=/tmp/t1182-xzone-observe \
NODE_OPTIONS="--require $PWD/scripts/t1182-observe.js" \
  node scripts/e2e-xzone-caravan.js
# T1030_XZ_MARKET=0으로 기본 경계 경로도 별도 실행.
# 테스트 전용 checkpoint preload는 e2e가 자식에만 자동 적용.
```

브라우저의 `file:` 접근이 제한된 환경에서는 `browser-http-preload.js`로 같은 파일을 로컬 HTTP에서 연다. 보안 옵션을 끄지 않는다.

```bash
CHROME_PATH=/usr/bin/chromium \
NODE_OPTIONS="--require $PWD/계측/T1182_2026-11-05/browser-http-preload.js" \
  node scripts/test-lab-market.js
```

관측 preload는 main thread만 읽고 제품 수량을 바꾸지 않는다. `T1182_FREEZE_UNTIL`을 준 시험만 몸 이동을 멈춘다. 경계 SIGKILL 시험의 관측 파일은 주기 덤프이므로 마지막 몇 초가 없을 수 있다. 실제 수량의 단 한 번 귀환은 e2e의 저장 전후 단언이 검증한다.
