# Phase 1-5 종합 변경 노트

KNOWN_ISSUES.md의 우선순위에서 *건축·NPC·거래소·자원영속화·운영도구* 5가지를 한 번에 도입.

## Phase 1: 자원 영속화

- DB에 `resources` 테이블 추가 (zone별 자원의 위치·HP·종류 저장)
- zone 서버 시작 시: DB에 자원이 있으면 로드, 없으면 새로 spawn
- 채집 시 HP 변경 → DB 갱신, 채집 완료 시 → DB 삭제
- **결과**: 서버 재시작해도 같은 월드(나무·돌 위치 그대로) 유지

## Phase 2: 건축 시스템 (벽 + 상자)

- DB에 `buildings` 테이블 추가
- 두 종류:
  - **벽** (B키): 나무 2 + 돌 1. 충돌 박스로 이동 차단 (서버 권위 collision)
  - **상자** (H키): 나무 5 + 돌 2. 인벤토리 외 추가 저장 공간 (wood, stone)
- 자기 토지(claim) 안에서만 설치 가능. 같은 타일에 중복 불가
- 32px 격자에 자동 스냅
- 캔버스 클릭으로 가까운 상자 열기 → 모달 UI에서 1개씩 입출
- 영속화: 서버 재시작에도 건축물 + 상자 내용물 유지

## Phase 3: NPC + 전투

- HP 시스템 도입: 모든 플레이어 100/100, mob도 HP
- F키 공격 (사거리 60, 데미지 10, 쿨다운 0.5초)
- 우선순위: 가까운 mob → 없으면 가까운 플레이어 (PvP)
- 2종 mob:
  - **사슴** (deer): HP 10, 평화, 배회. 처치 시 wood +1
  - **늑대** (wolf): HP 30, 시야 300px 내 플레이어 어그로, 사거리 30 데미지 5. 처치 시 stone +1
- 바이옴별 분포: 평원(china/france)에 사슴 많음, 산악/숲(korea/japan)에 늑대 많음
- 사망 시 5초 후 zone 중앙 부활. mob 15초 후 리스폰
- HP 회복: 전투 종료 1초 후 초당 ~10 HP

## Phase 4: 글로벌 거래소

- 새 서버: `server/marketplace.js` (포트 3010). HTTP API만
- 주문 매칭: 새 주문이 들어오면 즉시 반대 side 주문과 매칭. 같은 가격이면 FIFO 체결
- Escrow: 주문 등록 시 인벤토리에서 미리 차감 (DB 직접). 매칭 시 양쪽에 결과 반영
- M키로 거래소 모달 열기 (게스트는 사용 불가)
- 거래는 wood ↔ stone (반대 통화로만)
- 디스패처에 `/market/orders|order|cancel` 프록시 라우트 추가 (CORS 우회)
- 모든 zone의 플레이어가 같은 거래소 사용 — 진짜 글로벌

## Phase 5: 운영 도구

- 각 zone에 `/metrics` 엔드포인트 (Prometheus 형식)
  - players, observers, resources, buildings, mobs, claims
  - handoffs_out/in/acks/timeouts, chats/attacks/builds
  - ws_connects/closes, uptime
- `/health` 강화 (latency, 모든 카운터 포함)
- `ecosystem.config.js` 추가 — PM2로 자동 재시작, 메모리 모니터링, 로그 분리
  - 사용: `pm2 start ecosystem.config.js` → `pm2 monit`

## 클라이언트 통합 변경

- HP 바 (HUD 상단), 데미지/회복 즉시 반영
- 건축물·mob 렌더링 (iso 다이아몬드 + 사슴/늑대 스프라이트)
- 상자 모달 (캔버스 클릭으로 열림)
- 거래소 모달 (M키)
- 새 키 매핑: F(공격), B(벽), H(상자), M(거래소)
- HP 표시: 다른 플레이어 머리 위, mob 머리 위 (체력 손실 시만)
- 사망 시 자동 부활 알림, 화면 그대로 유지

## 실행 (5개 zone + 디스패처 + 거래소 = 7 프로세스)

```
npm install
npm start
```

→ `concurrently`가 7개를 한 번에 띄움. PM2 사용 시 `pm2 start ecosystem.config.js`.

## DB 마이그레이션

기존 `world.db`가 있어도 자동 마이그레이션 (ALTER TABLE). password_hash, password_salt 컬럼은 NULL이라 게스트 + 신규 가입자에 영향 없음. 자원·건축은 첫 실행 시 새로 만들어짐.

## 신규 zone과 거래소 인덱스

- world.db
- 새 테이블: `resources`, `buildings`
- 자원/건축은 zone별 인덱스로 빠른 로드

## 알려진 한계

1. **거래소는 단일 프로세스 — 다중 인스턴스 X**. Redis 분산 락 없으면 수평 확장 어려움. 현재 규모(동시접속 수십)에선 충분.
2. **mob은 DB 영속화 안 함**. 매 서버 재시작 시 새로 spawn. 의도적 — mob 위치를 영속할 필요 없음.
3. **PvP는 같은 zone 안에서만**. AOI 시야 안 mob/player가 attack 대상. 크로스존 PvP 없음.
4. **벽은 자기 영지 안에서만**. 영지 없으면 건축 불가 — 토지 점유 먼저 해야.
5. **상자는 자기 것만 열기·넣기·꺼내기 가능**. 협력 길드 시스템은 미구현.
