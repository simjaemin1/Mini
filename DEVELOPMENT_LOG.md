# 듀랑고 미니 — 개발 일지

오픈월드 게임을 지역별로 다른 국가 서버가 관리하는 구조를 실제로 만들어본 기록.

## 출발점

질문: 단일 오픈월드 맵을 지역에 따라 여러 서버가 관리하고, 그 서버들을 각각 다른 국가에 두는 게 가능한가?

답: 기술적으로 가능. 다만 게임 장르(빠른 액션 PvP는 불가능, 슬로우 페이스 생존/탐험은 OK)와 네트워크 지연 처리가 핵심. 실제 PZ식 아이소메트릭 탑다운 2D + 채집/토지/거래가 있는 듀랑고 스타일 프로토타입으로 검증해보기로 함.

## 결정한 아키텍처

- **클라이언트**: HTML5 + Canvas + 바닐라 JavaScript (브라우저에서 즉시 플레이 가능)
- **서버**: Node.js + WebSocket (zone별 독립 프로세스)
- **디스패처**: Express, 정적 파일 + zone 라우팅 정보 제공
- **5개 zone** (서→동): France · China · Korea · Japan · USA
- **인공 지연** (`LATENCY_MS` 환경변수)로 실제 다국가 데이터센터 흉내. 한국 기준 RTT: France 270ms, China 50ms, Korea 10ms, Japan 30ms, USA 180ms

## 진행 과정 (간략)

### 1단계 — 기본 골격
- 3-zone (china/korea/japan) WebSocket + Canvas 탑다운
- 클라가 입력 보내고 서버가 위치 권위
- zone 경계 넘으면 서버가 `handoff` 메시지로 클라에게 알리고 클라가 다음 zone에 WS 재연결
- 토지 점유, 거래, 채집 기본 시스템 동작

### 2단계 — 시각 개편
- 탑다운 → 아이소메트릭(2:1 다이아몬드) 투영. PZ 스타일
- 시야 반경 + 비네팅(가장자리 어둡게)으로 PZ 느낌
- 인접 zone에 observer로 자동 구독 → 경계 부근에서 옆 zone의 자원·플레이어가 미리 보임 (오버랩 구간)
- 미니맵에 5개 zone과 플레이어 위치 점

### 3단계 — 컨트롤 시행착오
- 처음엔 화면 기준 WASD (PZ식 회전 매핑) 시도 → 사용자가 일본 못 찾음
- 다시 월드 방향으로 (D = 동쪽). 아이소 시점이라 화면상으론 오른쪽-아래로 가지만 그게 월드 동쪽
- 화면 가장자리에 인접국 방향 화살표 + HUD에 좌표 상시 표시

### 4단계 — 핸드오프 지옥
가장 시간 많이 쓴 구간. 핸드오프 메시지 의존이 취약점이었음.

**증상**: 한국 동쪽 경계로 가면 자꾸 "갇히거나", "뒤로 끌리거나", "1.5초마다 zone이 막 바뀌거나" 함

**원인 추적**:
- 서버가 핸드오프 메시지를 보내고 100ms 후 WS를 닫는 구조였는데, 메시지가 클라에서 제대로 처리 안 되는 경우 발생
- 서버 입장: 플레이어를 삭제했는데
- 클라 입장: 여전히 한국 primary라고 믿음
- 한국 tick에 플레이어가 없으니 snap 대상도 없음 → 예측만 계속 도망 → zone clamp가 발동해서 경계로 끌림 → 이게 "튕겨나오는" 현상

**여러 안전망을 추가하다 더 꼬임**:
- zone clamp (predicted를 현재 zone 범위로 가두기)
- 강제 핸드오프 (1.5초 stuck이면 자동 전환)
- reconcile (predicted 보고 primary 자동 선택)
- orphan 감지 (tick에 내 pid 안 오면 재연결)
- 각각은 합리적이었지만 서로 간섭. reconcile + welcome snap 조합이 1.5초마다 다른 zone으로 점프시키는 사이클 발생

**일단 항복**: 좌표 변경 로직 다 빼고 클라이언트를 진실의 원천으로 → 부드러워졌지만 보안적으로 망함

### 5단계 — 인공 지연 + 5개 zone
- France, USA 추가. 5개 zone 구조
- `LATENCY_MS` 환경변수로 송수신 양쪽에 지연 시뮬레이션
- ping/pong으로 실제 RTT 측정 → HUD에 표시
- zone 갈아탈 때 RTT가 10ms → 30ms → 180ms → 270ms로 변하는 게 가시화됨

### 6단계 — 멀티플레이 보안 논의
- "지금 client-authoritative면 멀티플레이 위험하지 않나?"
- → 위험함. `myAbsPredicted.x = 5000` 한 줄로 텔레포트 가능. 속도 핵, 벽 통과, 토지 침범, 자원 복사 다 됨
- 친구끼리 신뢰 기반 멀티면 OK, 모르는 사람들이랑 PvP/거래는 안 됨
- 진지하게 만들려면 server-authoritative로 돌아가야 함

### 7단계 — 제대로 다시 (server-authoritative + 신뢰성 있는 핸드오프)

**핵심 4가지를 한 번에**:

1. **서버 권위 위치**: 클라는 `{type:'input', vx, vy}` 입력만 보냄. predicted는 시각용
2. **HTTP 기반 핸드오프 + 토큰**:
   - source zone(예: korea)이 target zone(japan)에 직접 HTTP POST (`/handoff_prepare`)
   - 토큰과 함께 플레이어 상태(이름, 좌표, 인벤토리, 속도) 전달
   - target zone이 `pendingHandoffs` 맵에 5초 TTL로 저장
   - source가 클라에게 `{type:'handoff', token}` 전달
   - 클라가 `ws://target/?handoff_token=xxx`로 접속 → target이 토큰 매치 → 저장된 상태로 player 생성
   - source는 1.5초 뒤 자기 측 플레이어 삭제
3. **부드러운 보정** (snap 대신 lerp): `applyServerCorrection`이 거리에 따라 무시/lerp/snap 분기
4. **회복 메커니즘 단일화**: reconcile/stuck 다 제거, orphan만 마지막 안전망 (2초 동안 내 pid가 tick에 없으면 primary 재연결)

**한 줄짜리 잔존 버그**: 변수 선언 지우면서 `checkOrphan` 안의 `handoffCooldownUntil` 참조 안 지움 → 매 프레임 ReferenceError → render 통째로 중단 → 빈 화면. 콘솔 봤으면 1초 만에 찾았을 거.

### 8단계 — 미세 튜닝
- 보정 임계값이 3px이라 정상 client-side prediction의 10~30px 드리프트도 매번 lerp로 끌어옴 → "키 떼면 뒤로 끌리는" 느낌
- 임계값 100px로 완화. 정상 드리프트는 무시, 큰 desync(100~500px)만 부드럽게 보정, 비정상(500px+)만 snap
- 서버 측: `handingOff` 상태 플레이어는 broadcast에서 제외 (핸드오프 진행 중 동결된 위치 안 보냄)

## 만난 버그들과 교훈

### "1.5초마다 zone 사이클"
- 원인: cooldown 만료 시점에 reconcile이 발동, welcome이 predicted를 다른 zone 좌표로 snap, 다시 mismatch, 또 reconcile…
- 교훈: **여러 보정 메커니즘을 동시에 두지 말 것**. 진실의 원천이 하나여야 함

### "월드 6140에 박혀서 못 움직임"
- 원인: 핸드오프 메시지 손실로 서버는 플레이어를 삭제했는데 클라는 여전히 같은 primary 유지(유령 상태). predicted가 zone clamp 한계까지 도망
- 교훈: **단방향 메시지에 신뢰성을 의존하지 말 것**. ACK 패턴이나 직접 통신(HTTP) 필요

### "텔레포트로 뒤로 끌림"
- 원인: 작은 드리프트도 즉시 보정해서 시각적으로 거슬림
- 교훈: **client-side prediction은 본질적으로 서버보다 살짝 앞서감**. 그걸 받아들이고 큰 desync만 보정해야 함

### "한 줄짜리 ReferenceError로 화면 전체가 안 보임"
- 원인: 리팩토링하면서 변수 선언만 지우고 참조 안 지움
- 교훈: **JS 콘솔 먼저 보기**. 추측보다 빠름

## 최종 구조

```
durango-mini/
├── server/
│   ├── zone-config.js   # 5개 zone 토폴로지 (offset, latency, 이웃)
│   ├── zone.js          # zone 서버: WebSocket + HTTP handoff_prepare
│   └── dispatcher.js    # 정적 파일 + /zones, /health
└── public/
    ├── index.html
    ├── style.css
    └── client.js        # Canvas iso 렌더 + 입력 + WS 다중 구독
```

### 클라이언트 흐름
- `worldKeysDir()`: 키 입력을 월드 단위벡터 (vx, vy)로 변환
- `sendInput()`: 30Hz로 input만 서버에 전송 (위치 안 보냄)
- 매 프레임:
  - 입력으로 predicted 즉시 이동 (시각 반응성)
  - 서버 권위 보정 (correctionVel 적용)
  - 전역 월드 범위 clamp만
- `applyServerCorrection`: 100px 이하 무시 / 100~500 lerp / 500+ snap
- `handoff` 메시지: 토큰으로 새 zone WS 열기. predicted는 안 건드림
- `welcome` 첫 회만 snap, 이후엔 보정으로

### 서버 흐름
- tick(10Hz): 입력 기반 위치 계산
- 경계 넘으면 `fireHandoff` (async): 토큰 생성 → target zone에 HTTP POST → 클라에 토큰 전달 → 1.5초 후 자기 플레이어 삭제
- `handingOff` 플레이어는 broadcast 제외
- `/handoff_prepare`: 다른 zone이 보낸 핸드오프 상태를 받아 `pendingHandoffs`에 저장
- WS 접속 시 `handoff_token` 쿼리 있으면 그 상태로 플레이어 생성

### 5개 zone 토폴로지

| Zone | Port | Offset | RTT (한국 기준) |
|------|------|--------|----------------|
| France | 3004 | 0 | 270ms |
| China | 3001 | 2048 | 50ms |
| Korea | 3002 | 4096 | 10ms |
| Japan | 3003 | 6144 | 30ms |
| USA | 3005 | 8192 | 180ms |

zone 폭 2048, 총 월드 10240. 한국 → 일본 가면 RTT가 ~10ms에서 ~30ms로, 더 동쪽 가서 미국 진입하면 ~180ms로 점프하는 게 가시적으로 확인됨. zone 갈아타는 실증 증거.

## 아직 안 한 것들 (production-grade로 가려면)

1. **진짜 다국가 배포**: 지금은 다 localhost. `zone-config.js`의 `wsUrl`을 각 클라우드 리전 도메인으로 바꾸고 `LATENCY_MS` 제거하면 됨
2. **AOI(Area of Interest) 필터링**: 지금은 zone 전체 상태를 다 받음. 진짜 거대 월드에선 시야 안 엔티티만 받아야 함
3. **건축 시스템**: 클레임 안에 벽/창고/문 짓기
4. **도구·크래프팅**: 도끼, 곡괭이 등
5. **NPC·몬스터**: 빈 땅의 야생성
6. **글로벌 거래소**: zone 간 비동기 거래 (지금은 같은 zone 안에서만)
7. **데이터 영속화**: 현재 메모리 저장만. Redis나 Postgres 필요
8. **GeoIP 라우팅**: 디스패처가 클라 IP로 가장 가까운 zone 추천
9. **서버 권위 검증 강화**: 속도 핵 감지, 채집 빈도 제한, 토지권 검증
10. **인증 시스템**: 지금은 누구나 아무 이름으로 접속 가능

## 실행 방법

```bash
cd ~/Mini/durango-mini
npm install
npm start
```

브라우저: `http://localhost:3000`

5개 zone 동시 기동. 시작 zone 선택 후 입장. WASD/화살표 이동. D 길게 누르면 한국 → 일본 → 미국 동쪽 진행 가능 (RTT 변화 관찰).

## 한 줄 요약

분산 서버 구조의 좌표 연속성을 진지하게 만들려면 단방향 메시지에 의존하지 말고 HTTP 같은 신뢰성 있는 채널로 zone 간 직접 통신하라. 그리고 client-side prediction은 서버보다 살짝 앞서가는 게 정상이니 그걸 받아들이고 큰 desync만 보정해라.
