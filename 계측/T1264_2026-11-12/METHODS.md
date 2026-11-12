# T1264 계측 방법

- 베이스: `05b66c73`(main, land1066 뒤). 제품 변경 0. `product-source-before.json.gz`는 server/sim/public의 모든 추적 파일 SHA-256이다. 수집 때 현재 파일 전부와 다시 대조한다.
- Node 22.23.4. `scripts/t1264-run.py <출력폴더>`: OFF / WOOD / TERR / V2_WOOD 네 팔, 시드 1020·7·42 각각 400일. 팔끼리 동시, 각 팔의 시드는 순서대로 실행한다. 별도 OFF_GATE는 새 기준선 1020:400을 견주나 생활층 누락이 있어 진단 자료로만 쓴다. 공식 게이트는 관찰기를 뺀 OFF_GATE_FULL이다.
- 시드는 정본 T577 훅이 `createWorldV2`에 주는 economy seed다. zone은 전부 `hanbando`이며 지도 조건을 별도로 바꾸는 실험은 아니다.
- 모든 팔은 같은 `server-baseline-check.js --make ... --days 400 --seeds 1020,7,42 --vclock --par 1`. T577 기본 250ms/일, 마을당 주민 몸 상한 1, 집 행위 0, 캐러밴 상한 0. 기본 시계 고침 두 개(`T1253_CLOCK_FIX`, `T1258_ARTISAN_CLOCK`)는 재정의하지 않아 켬이다.
- 팔의 네 환경변수 순서: `(T325_WOOD_ACT,T1259_WOOD_CAP,T1207_TERR_REAL,T1238_TERR_V2)` = OFF 0000 / WOOD 1000 / TERR 0011 / V2_WOOD 1011. 자리 손잡이는 전부 명시적으로 0. 다른 신기능 손잡이는 베이스 기본값을 따른다. 이 끔은 네 실험 손잡이를 끔이라는 뜻이다.
- `scripts/t1264-observe.js` 프리로드는 정본 tickVillage/scanDay의 원래 호출과 반환을 보존한다. 마을 상태 필드와 순수 `villageFamine`만 읽는다. 가격·자리·영토 계산이나 랜덤 함수는 호출하지 않는다. `__p3Bind({})`는 빈 객체로 현재 state를 얻는다.
- 날마다 세계 인구/식량 빚 사망 누계/굶음 마을 수, 10일마다 마을별 영토(_terrSet)/밭(_farmSet)/그중 마른밭(_drySet), 땅, 주거, 목재, 직업, 확장 장부(_t1207), 출생 문 누계를 저장한다. farm과 dry는 합하지 않는다(dry는 farm의 부분집합).
- 출생 관측은 tickVillage 호출 전후 econ 주민 객체 집합의 신규 항목 수(T1230의 관측 정의와 같음). 주거 문은 정본 _dpDebug.gated. '출생 0의 주거 문 몫' = 주민이 있는 날 중 신규 주민 0이며 gated인 날 / 신규 주민 0인 날. 세계 값은 마을별 분자·분모를 합해 계산한다. 인구 차 상위 다섯 마을은 같은 시드의 TERR−OFF가 가장 작은 다섯 곳이다.
- 굶음(villageFamine)은 _dpDebug.hunger < 0인 마을-날이며, 식량 빚 사망은 _fdDeadTot이다. 서로 다른 척도다. native bodyExit.died.starve도 원자료에 보존한다.
- 통나무 막힘 몫은 T1251과 같이 _t1207.stallWood / _t1207.days. days는 실제 영토 확장을 시도한 마을-날이다. 확장 시도 없는 팔의 몫은 해당 없음이다. woodIn은 개간 벌목이 정본 woodToGranary를 통해 실제로 들어온 양이다.
- CPU는 process.cpuUsage의 실제 프로세스 CPU초다. 가상 hrtime/Date를 실제 경과 시간으로 쓰지 않는다. controller status의 wallSeconds만 Python monotonic으로 잰 실제 경과다.
- `scripts/t1264-clock-replay.py <같은 출력폴더>`는 진단 OFF_GATE가 끝난 뒤, 동일한 새 제품에서 시계 고침 두 개만 0으로 둔 OFF/V2_WOOD 시드1020 400일을 별도로 실행한다. 옛 보고 숫자를 새 실측으로 대체하지 않는다. 두 시계 변경을 함께 되돌리는 대조이며 둘 사이 기여를 분리하지 않는다.
- `scripts/t1264-collect.py <출력폴더>`는 모든 native 종료0/400일/51마을/양의 초기 인구, 관찰 오류0/시계 오류0, 제품 SHA 같음, 새 OFF 3시드 날 지문·여덟 수·판 JSON hash 같음을 확인하고 원자료를 gzip(mtime=0)으로 모은다. DB는 보관하지 않는다.

## 중단한 첫 실행

첫 턴 중단 때 controller와 서버 프로세스가 함께 종료됐다. `interrupted-first/`에 첫 실행의 원자료와 완주 여부를 보존했다. 그때 끝난 TERR/1020 판도 최종 비교에는 넣지 않으며, 새 matrix를 모두 0일에서 다시 시작했다. 미완주 판을 잇지 않는다. 보고 날짜는 완주 작업의 사용자 시각(2026-11-12, Asia/Seoul)이다.

## 사용하지 않는 관찰 칸

원자료 `snapshots[].villages[].woodIn`은 제품에 없는 `econ._t325WoodTot`을 읽어 fallback 0을 적은 보조 칸이다. 이 칸은 분석·보고·파생 topFive에서 제외한다. **개간 목재 입고의 정본은 `snapshots[].villages[].territoryCost.woodIn` = `vil._t1207.woodIn`**이며, 별도 칸으로 정확히 기록한다. 원자료는 수정하지 않고 보존한다. 이 보조 칸은 세계 계산이나 다른 관측값에 쓰이지 않는다.

## 생활층 지문 누락과 별도 공식 게이트

이번 관찰기는 프리로드 때 villages를 먼저 require한다. 그 뒤 로드되는 정본 t740-side-hook의 module-loader 주입이 이미 캐시된 villages에 붙지 않아 **관찰기를 실은 판의 생활층 지문은 0일**이다. 경제 scanDay 400일·여덟 수·판 JSON 비교에는 이 누락이 없으며 그 범위에서만 사용한다. 비교 12판과 종전 시계 대조의 생활층 일치를 주장하지 않는다. 첫 OFF_GATE는 자가 '같음 1/1·생활층 0일'이라고 출력한 진단 사례로만 보존한다.

공식 게이트는 `scripts/t1264-full-gate.py <출력폴더>`로 **NODE_OPTIONS의 관찰기 없이** 따로 실행한다(시계 대조가 끝나거나 OFF·TERR 두 팔이 끝나 슬롯이 비면 시작). 새 기준선과 경제 400일·판 JSON·여덟 수·생활층 **400일**이 모두 같아야 받는다. 수집기는 native t740 원자료의 날짜 1~400을 검사하고 정본과 같은 sha1 규약으로 재축약한 전체 side 객체를 기준선과 정확히 대조한다. 그 판의 T745 종료 로그가 실제로 오류0인지도 요구한다. 따라서 필요한 15판은 비교12+종전시계2+공식게이트1이며, 진단 게이트1은 별도다. 기준선 자가 누락0일을 통과시키는 문제는 제품을 고치지 않고 회부한다.

검증 범위: OFF make 3시드는 경제 지문/여덟 수/판 JSON 3/3, 생활층 증명은 별도 공식 게이트1020의400/400이다.

선행 T1259의 `/tmp/t1259/OFF_GATE/controller.log`도 생활층0일 비교였음을 확인했다. 원로그는 `prior-gate-coverage/T1259-OFF_GATE-controller.log.gz`에 보존했다. 경제400일·판 JSON·여덟 수 일치와 생활층 검증 범위를 구분한다. 이번 카드에서 과거 제품이나 보고 원본을 수정하지 않았다.

## 추가 정본 게이트 반복

빈 슬롯에서 게이트를 먼저 실행하려고 대기 중인 도구 셀을 종료했으나, 그 안의 Python 대기 프로세스는 살아남았다. 그 결과 정본 게이트가 두 번 실행됐다. `/tmp/sbc-9igWYB`와 `/tmp/sbc-mV3pm4`는 각각 독립적인 새 세계의 실제400일 판이며, 각 native check.json의 자식 종료0/같음400일과 원본 t740의400일 전체, T745오류0을 별도로 확인했다. 공유 controller 파일의 최종 값은 두 번째(mV3pm4)이며, 수집기는 그 실제 경과와 native check.sec의 일치도 요구한다. 앞선9igWYB는 `additional-official-gate/`에 별도 보존한다. 필요한15판(비교12+종전시계2+공식1)에 진단1판·추가정본반복1판이 더 있어 이번 완주 원자료는17판이다. 비교 수치나 분모에 반복 판을 합치지 않았다.
