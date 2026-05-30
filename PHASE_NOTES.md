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

---

## Phase 14: 길드 도시 건설 MMO 인프라 (설계 문서 기반)

DESIGN_DOC.md의 시스템 일부를 점진적으로 도입. 인프라 우선, 게임플레이는 후속.

### 14.1 자원 편재 (biome 기반)
- **chunk.js + zone.js**: biome별 자원 생성 가중치 대폭 편재
  - **korea (mountains)**: rock 55%, ore 20%, tree 10%, herb 8%, berry 5%
  - **russia (forest)**: tree 70%, berry 15%, herb 8%, rock 5%
  - **usa/china (plains)**: berry 50%, herb 25%, tree 20%, rock 4%
- 설계 §2.2: "지역마다 편재 → 위치 독점 분쟁 구조적 소멸, 특화·교역 발생"

### 14.3 신규 자원 — herb, ore
- **herb (약초)**: HP 1, drop 2 herb. 평원·산악에 편재. (향후) 요리·치료 재료
- **ore (광물)**: HP 5, drop 1 ore + 1 stone 부산물. 산악 편재. (향후) 고급 도구 제작 재료
- 클라 drawHerbIso(녹색 꽃)·drawOreIso(금빛 결정) 추가
- 인벤토리 이모지: 🌿 (herb), ⛏️ (ore)

### 14.2 길드 vp + treasury + behavior_tier 인프라 (central)
- **central.tribes** 컬럼 추가: vp REAL, vp_updated_at, treasury_json, is_npc INTEGER, behavior_tier TEXT
- **vp lazy 감쇠**: 시간당 -5, 멤버 합산 X (설계 §4.2 — 탈퇴/추방으로 세탁 불가)
- **warDialFromGuildVp()**: 청정(<30)/보통(<80)/악성(≥80) 3단계 약탈률·손상률 다이얼 (설계 §5.2)
- **API**:
  - POST `/tribe/add_vp` — 길드 vp 가산 (lazy decay 적용 후)
  - POST `/tribe/treasury` — 금고 입출금 (delta 형식)
  - POST `/tribe/npc_upsert` — NPC 길드 1급 객체 등록
- central-client.js 헬퍼: tribeAddVp, tribeTreasury, tribeNpcUpsert, getTribe

### 14.4 NPC 길드 1급 객체 등록
- 설계 §7.1: "NPC 길드 = 플레이어 길드와 동일 엔티티, 플래그로 구분"
- zone 부팅 시 각 마을(서울·부산·광주·모스크바·...)을 central에 NPC 길드로 upsert
- 모든 마을 기본 `behavior_tier='passive'` (배경 세력, 저비용)
- `villageGuildIds` Map: villageName → central tribe_id (zone 메모리 캐시)

### 14.5 공성 캠프 (siege_camp building)
- 설계 §3.2: "전쟁 시 적 도시 인근 군사 전진기지, 빠른 decay"
- **비용**: 나무 4 + 섬유 2 (돌 X — 임시 구조물)
- **위치 제약**: 사유지 밖에만 설치 가능 (자기 영지 안 건축과 정반대)
- **자동 decay**: 10분 후 자연 해체 (`expiresAt` 타임스탬프, 5초마다 체크 + DB 삭제)
- **시각**: 갈색 텐트 + 빨간 깃발 + 잔여 시간 게이지
- **단축키**: Q + 버튼 UI

### 14.6 길드 패널 명성·금고 UI
- 내 길드 정보에 ⚖️ 명성 (vp/200) + 단계 색상 (청정 녹/보통 노/악성 적)
- 🏦 금고 자원 표시 (아이콘 + 개수)
- NPC 길드는 🤖 배지 + behavior_tier 라벨
- 길드 목록에 tier 한 글자 태그 + 색상

### 14.7 마을 단위 시뮬레이션 (treasury 자동 생산)
- 설계 §7.4: "마을(NPC 길드)이 시뮬레이션 주체, 개별 NPC는 표현"
- **1분마다 1회** 각 마을 treasury에 biome 편재 산물 가산:
  - mountains: stone+3, ore+1, wood+1
  - plains: berry+4, herb+2, wood+1
  - forest: wood+4, berry+1, herb+1
- 마을이 살아 있는 듯한 느낌 + 향후 전쟁 시 약탈 대상

### 아직 안 한 것 (다음 sprint 후보)
- 공성 캠프에서 리스폰 (군사 거점 기능)
- 명분 다이얼 실제 PvP 적용 (loot/damage rate 사용)
- 길드 간 전쟁 선포 API (War 엔티티)
- NPC 길드 가입 + 운영권 인수 (설계 §7.3)
- 길드 금고 RBAC + 출금 (설계 §6.1)
- 평판 시스템 (선택)
- behavior_tier='strategic' NPC 길드 — 효용 함수 의사결정


---

## ⚡ 14.x 변경분 deploy 명령어 (사용자가 일어났을 때)

**mac terminal**:
```bash
cd ~/Mini/durango-mini
rm -f .git/*.lock .git/objects/*/tmp_obj_*
git add -A
git commit -m "Phase 14.1-14.7: 자원 편재 + 길드 vp/treasury + 공성캠프 + NPC 길드 1급 + 마을 시뮬레이션"
git push
```

**Vultr 서버 ssh** (root@141.164.35.114):
```bash
cd /opt/Mini && git pull && /tmp/rebuild.sh
```

**브라우저 (강제 새로고침)**: Cmd+Shift+R 또는 비밀 탭

### 부팅 로그에서 확인할 메시지
- `[korea] 옛 NPC 건축물 N개 정리` — DB wipe 성공
- `[korea] ✅ NPC 길드 등록: 서울 → central tribe_id=N (passive)` (× 3 마을 × 4 zone = 12개)
- `[korea] 🏘️ 마을 [서울] @ (5120,2560) — N명`
- 1분 후: `[korea] 🏭 마을 생산 (3곳): stone+3 ore+1 wood+1`

### 게임 안에서 검증
1. **자원 편재** — 한반도(산악)에서 광물(⛏️)·돌이 압도, 러시아에서 나무, 미국/중국에서 베리·약초(🌿)
2. **공성캠프** — Q 키 → 사유지 밖에서 텐트 만들기 → 10분 뒤 자동 해체
3. **길드 패널** — N 키 → 내 길드에 ⚖️ 명성 + 🏦 금고. NPC 길드(서울/부산/광주 등)에 🤖 배지
4. **NPC 길드 가입 가능** — 길드 목록에서 NPC 길드 [서울] 등에 가입 (운영권 인수는 미구현, 단순 멤버만)

---

## Phase 14.8~14.14 — 전쟁 시스템 본격 도입

### 14.8 PvP 명분 다이얼 실제 적용
- `applyPvpAttackPenalty(attacker, victim)`: 피해자 길드 vp 기준 페널티 조절
  - 청정 피해자: 개인 ×2.0, 길드 +20 vp
  - 보통: 개인 ×1.0, 길드 +5
  - 악성 (정의구현): 개인 ×0.5, 길드 0
- 전쟁 중이면 양측 면제 (`isAtWar()` 체크)
- 길드 vp 캐시 60s TTL (`guildVpCache`) + 활성 전쟁 캐시 30s TTL (`activeWarsCache`)

### 14.9 길드 간 전쟁 (War 엔티티)
- central.wars 테이블: id, attacker/defender_guild_id, started_at, ended_at, loot_rate, damage_rate, aggressor_vp_gain, tier, declared_by
- **선포 시점 스냅샷** — 전쟁 내내 같은 dial 사용 (실시간 vp 변동 악용 차단, 설계 §5.5)
- API: `POST /war/declare`, `POST /war/end`, `GET /wars/active`
- 청정 침략 시 침략자 길드 vp +대량 자동 가산 (정의구현 트리거)
- UI: 길드 패널에 [선포] 버튼 + 진행 중 전쟁 + [종전] 버튼

### 14.10 공성 캠프 리스폰
- 사망 시 같은 길드 활성 siege_camp 중 가장 가까운 곳에서 부활
- 없으면 zone 중앙 (기존 fallback)
- 군사 거점 기능 활성화 — 전선 형성 가능 (설계 §3.2)

### 14.11 NPC 길드 운영권 인수
- NPC 길드 가입 시 인간 멤버 수 체크 → 1명이면 첫 사람 자동 leader 승계
- 응답 `{ promoted: true }` → 클라가 👑 알림
- 향후 기여도 기반으로 확장 (설계 §7.3)

### 14.12 Strategic NPC 의사결정 (utility AI 뼈대)
- behavior_tier='strategic'인 NPC 길드만 대상 (현재 모든 마을 passive — 발동 X)
- `utilityForWar(attackerVp, defenderVp)` = 상대vp×0.7 + (1-내vp)×0.3
- 임계 0.6 이상 시 자동 선포
- 30분 1회 tick (`STRATEGIC_AI_ENABLED=process.env.STRATEGIC_AI==='1'`)
- **안전상 DEFAULT OFF** — `env STRATEGIC_AI=1`로 enable, 또는 마을을 manually strategic 승격 (UI 미구현)

### 14.13 약탈 시스템
- 적 길드 chest를 인출 시도 시:
  - 전쟁 중 + 적 길드면 약탈 모드
  - 실제 인출량 = `요청량 × loot_rate` (war 다이얼 사용)
- 본인 chest는 기존대로 100% 인출. 건축물 영구파괴 X (설계 §3.3, §6.1)

### 14.14 건축물 손상 인프라
- `BUILDING_MAX_HP` 테이블 추가 (wall:80, fence:30, ...)
- 실제 공격/수리 로직은 다음 sprint (인프라만 준비)

---

## 종합 검증 시나리오 (deploy 후)

1. **자원 편재 확인**: 한반도(산악) 가서 ⛏️ ore 자주 나오는지, usa 가서 🌿 herb 많은지
2. **NPC 길드 등록**: docker logs에 `✅ NPC 길드 등록: 서울 → tribe_id=X (passive)` 12개
3. **마을 생산**: 1분 뒤 `🏭 마을 생산 (3곳): ...` 로그
4. **길드 패널 (N키)**: ⚖️ vp + 🏦 treasury + NPC 길드 🤖 배지 + tier 색상
5. **공성 캠프 (Q키)**: 사유지 밖에서 텐트, 10분 후 자동 해체, 만료 게이지
6. **공성 캠프 리스폰**: 자기 길드 캠프 옆에서 죽으면 그쪽에서 부활
7. **NPC 길드 가입 → 운영권 인수**: 길드 패널에서 [서울] 가입 → 👑 알림
8. **전쟁 선포**: 내 길드 → 다른 길드 [선포] → tier 표시 + 활성 전쟁 목록
9. **명분 다이얼**: 청정 길드 멤버 공격 시 큰 vp 가산, 악성 길드 공격 시 면제 (notice 메시지)
10. **약탈**: 전쟁 중 적 길드 chest 인출 시도 → loot_rate% 만큼만 가져옴

## 알려진 한계 (다음 단계 후보)

- 건축물 wall HP/공격/수리 — 인프라(BUILDING_MAX_HP)만 있고 로직 미구현
- 길드 금고 RBAC + 출금 권한 — 현재 누구나 read만
- 평판 시스템 (마피아42식, 설계 §4.3) — 미구현
- 신고-검증 파이프라인 (설계 §8.5) — 미구현
- LLM 촌장 대화 (설계 §7.5) — 미구현
