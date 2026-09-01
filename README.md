# 듀랑고 미니 — 분산 존 서버 프로토타입

한국 청동기(송국리 문화기) 오픈월드 경제 시뮬레이션.
**하나의 월드를 여러 서버 프로세스가 지역별로 나눠서 시뮬레이션**하는 구조를 실제로 구현했습니다.

월드는 **26개 존**으로 나뉘어 있고(그중 7개는 바다), 합쳐서 약 **2.26억 셀**(1셀 = 1m)입니다.
각 존은 독립된 Node.js 프로세스가 **30Hz**로 권위적으로 시뮬레이션하고, 자기 SQLite 파일에 영속화합니다.
플레이어가 경계를 넘으면 클라이언트의 WebSocket 연결이 다음 존 서버로 전환됩니다(핸드오프).

운영 배포는 존 하나 = 도커 컨테이너 하나이고, 현재는 단일 VPS(1 vCPU)에서 돕니다.

## 실행 방법

```bash
npm install
npm start                                        # central + dispatcher + 26개 존
ENABLED_ZONES="hanbando,nippon" npm start        # 일부만
```

`npm start`(= `node scripts/launch-all.js`)는 **zone-config.js 의 ZONES 를 그대로** spawn합니다
— 설정과 프로세스 목록이 어긋날 수 없습니다. 그다음 브라우저에서:

```
http://localhost:3000        # dispatcher (정적 파일 + 존 라우팅)
http://localhost:3010        # central (계정·신원·존 목록 /zones)
```

존 서버는 3001~3030 범위의 각자 포트를 씁니다(`zone-config.js`).

### 무거운 층 끄기

세계 시뮬(마을·야생·도적)은 부팅과 tick 비용의 대부분입니다. 개발·측정용으로 끌 수 있습니다:

```bash
ENABLE_VILLAGES=0 ENABLE_WILDLIFE=0 ENABLE_BANDITS=0 npm start
```

### 성능 플래그 (기본 꺼짐)

지형 통행 판정(`isPointInRiver` 등)이 존 tick과 부팅 비용의 지배적 항목입니다.
같은 답을 내는 두 가지 가속이 들어 있고, 둘 다 기본 꺼져 있습니다:

```bash
TERRAIN_SEG_INDEX=1     # 강·능선 선분을 512px 격자로 색인 — "처음 묻는 질문"을 줄인다
TERRAIN_TILE_CACHE=1    # 타일 단위 메모(4비트/타일) — "다시 묻는 질문"을 없앤다
```

실서버 실측(`BENCHMARK.md` §3-B): 같은 세계에서 `tick_avg` **454~888ms → 15~28ms**,
클라 관측 p50 **515 → 34ms**, 부팅 **13분 51초 → 7분 10초**.

## 조작

- **WASD / 화살표키** — 월드 방향 이동 (W=북, D=동, S=남, A=서). 아이소 시점이라 D를 누르면 화면상 "오른쪽-아래" 대각선 — 그게 월드의 동쪽
- **E** — 채집 · **C** — 토지 점유 · **Shift+T** — 마을 거래소(마을 중심 근처에서만)
- **존 경계로 이동** — 자동 핸드오프. 인접 존을 미리 observer로 구독해 끊김을 줄입니다

## 구조

```
durango-mini/
├── server/
│   ├── zone-config.js       # 존 토폴로지(26개) · 월드 배율 · 시계 — 모든 프로세스의 공통 정본
│   ├── zone.js              # 존 서버 — 한 지역의 시뮬레이션 권위(30Hz)
│   ├── central.js           # 계정·게스트 영속 신원·존 목록(/zones) · central.db
│   ├── dispatcher.js        # 정적 파일 + 존 라우팅
│   ├── villages.js          # NPC 마을 시뮬(경제·인구·교역)   ENABLE_VILLAGES=0 으로 no-op
│   ├── wildlife.js bandits.js roads.js soil.js rooms.js carry.js …
│   ├── terrain.js           # 지형 판정 정본 (+ terrain-segindex.js / terrain-tilecache.js)
│   └── zone-local-db.js     # 존별 SQLite(world-<zone>.db)
├── public/
│   ├── index.html style.css
│   └── client/              # 클라이언트 14조각 (00-const … 99-main)
├── scripts/                 # 러너 51개(`// @regress` 자동 발견) + 측정·배포 하네스
└── 인계/                     # 세션 인계 문서 (아카이브는 인계/아카이브/)
```

**클라이언트는 한 파일이 아닙니다.** `public/client/*.js` 14조각을 `index.html` 이 순서대로 로드합니다
(고전 스크립트 — 번들러 없음). 새 기능 = 새 파일 + 등록 1줄. 최상위 실행문은 `99-main.js` 에만 둡니다.
결합 결과가 분할 전과 바이트 동일한지는 `bash scripts/split-verify.sh` 가 검사합니다.

## 데이터

* **SQLite** (`node:sqlite` / `better-sqlite3`). 메모리 저장이 아닙니다.
  * `central.db` — 계정·게스트 영속 신원·인벤토리·마지막 존
  * `world-<zone>.db` — 존별 건축물·자원·클레임·몹·마을 상태
* 존은 자기 DB만 씁니다. 존 사이의 공유 상태는 central을 거칩니다.

## 핸드오프 (존 경계 넘기)

1. 출발 존이 대상 존에 `POST /handoff_prepare` — 토큰 + 플레이어 상태
2. 출발 존이 클라에 `{type:'handoff', targetZone, token}`
3. 클라가 대상 존에 `?handoff_token=…` 로 재접속
4. 대상 존이 출발 존에 `POST /handoff_ack` → 출발 존이 옛 몸을 정리 (3초 안에 ACK 없으면 fallback 정리)

경계 양쪽 **256px 는 겹침 띠**(`HANDOFF_COMMIT`)입니다. 그 안에서는 핸드오프하지 않으므로
경계에 서서 왔다갔다 해도 재접속 핑퐁이 없습니다 — 실측으로 확인했습니다(`BENCHMARK.md` §4-C:
경계선 71회 통과 · 핸드오프 0회).

⚠**알려진 결함**: 핸드오프 페이로드에 도구 인스턴스·장비·제작 숙련·kg 원장이 빠져 있어
존을 넘으면 도구가 영구히 사라집니다. `KNOWN_ISSUES.md` N.6.

## 실측 (`BENCHMARK.md`)

실서버(1 vCPU · 1.9 GiB) 한 존(NPC 1,566 · 몹 449 · 마을 50):

```
                        서버 tick_avg      클라 p50      수용 인원(무릎)
  NPC 없음·플래그 끔       2.4 ~ 11 ms        33 ms          5명
  NPC 있음·플래그 끔      454 ~ 888 ms       515 ms        1명 미만
  NPC 있음·플래그 켬       15 ~  28 ms        34 ms      10명에서도 p50 62ms
```

사람이 0명인 존은 tick 본문을 통째로 건너뜁니다(idle skip) — 빈 존의 CPU는 3.9%입니다.
즉 세계 시뮬 비용은 **누군가 접속하는 순간** 청구됩니다.

## 다음 단계로 확장하기 좋은 것들

- **존 간 백엔드 메시지 버스** — 지금은 zone↔zone HTTP. Redis pub/sub·NATS로 바꾸면 핸드오프 ACK가 단순해집니다
- **핸드오프 페이로드의 정본화** — 위 N.6. "몸의 정본이 어디인가"를 한 곳으로 정하는 문제
- **GeoIP 라우팅** — 디스패처가 클라이언트 IP로 가장 가까운 존을 추천
- **실제 다국가 배포** — 각 존 컨테이너를 다른 클라우드 리전에

## 주요 설계 선택

**왜 클라이언트가 직접 존 서버에 붙는가** — 디스패처가 메시지를 중계하면 디스패처가 병목이 됩니다. 클라이언트가 직접 존 서버에 붙고, 디스패처는 라우팅 정보만 알려주는 게 분산 구조의 핵심.

**왜 권위는 존 서버에 있는가** — 같은 지역 안의 플레이어들끼리 상호작용할 때 단일 권위 서버를 거치는 게 일관성 유지에 가장 단순.

**왜 핸드오프는 WS 재연결로 처리하는가** — 존 간 직접 통신(P2P 서버) 대신 클라이언트를 통한 리레이가 프로토타입에선 훨씬 간단. 본격 운영 시에는 존 간 백엔드 메시지 버스(Redis pub/sub, NATS) 추가 권장.
*(2026-09-01 보강: 지금은 재연결 **한쪽만** 클라를 거치고, 상태 이전은 zone↔zone HTTP `handoff_prepare`/`handoff_ack` 입니다. 위 "핸드오프" 절 참조.)*

**왜 클라이언트 예측이 있는가** — 서버 tick 주기 때문에 즉시 반응이 안 보임. 입력 즉시 클라가 예측하고, 서버 권위 좌표와 어긋나면 보정.
*(2026-09-01 정정: 옛 README는 tick을 10Hz라고 적었으나 실제는 **30Hz** 입니다 — `zone.js:471 TICK_HZ = 30`.)*
