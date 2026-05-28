# 알려진 문제와 해결 진행도

분산 zone 서버 구조에서 발생하는/발생할 수 있는 문제들의 목록. 우리가 직접 겪은 것 + 아직 안 만난 것 + 게임 디자인상 회피된 것을 구분.

## 상태 표기

- **해결됨**: 명시적으로 고쳤음
- **부분 해결**: 일반 케이스는 OK, 엣지 케이스 남음
- **미해결**: 인지는 했지만 손 안 댐
- **회피됨**: 우리 게임 디자인 때문에 발생 안 함 (디자인 바꾸면 다시 등장)
- **미래**: 특정 기능 추가하면 그때 문제됨

---

## 1. 경계에서 발생하는 플레이어 체감 문제

### 1.1 상태 경쟁 (race condition at handoff)
**상태**: 부분 해결

**무엇**: 서버 A→B로 넘기는 100~500ms 동안 누가 권위를 가지는지 모호. 둘 다 자기가 가졌다고 믿거나 (중복), 둘 다 자기가 안 가졌다고 믿거나 (유령) 가능.

**현재 해결**: HTTP `/handoff_prepare` + 토큰으로 source→target 직접 통신. source는 토큰 발급 → 5초 안에 클라가 target에 접속 → 토큰 매치해서 상태 인계. 1.5초 후 source에서 player 객체 삭제.

**남은 엣지 케이스**:
- HTTP 요청 자체가 실패하면? (현재: `handingOff = false`로 풀고 다음 tick 재시도. 무한 재시도 가능성)
- 클라가 5초 안에 target에 접속 못 하면? (토큰 만료. 플레이어는 source에 죽은 채로 남아있음)
- ACK 패턴 없음. 클라가 target에 도착했다는 확인이 source에 안 옴.

**다음**: ACK 메커니즘 추가. target이 토큰 사용한 순간 source에 알려서 즉시 정리.

### 1.2 아이템·재화 복제 (duplication exploit)
**상태**: 부분 해결

**무엇**: 핸드오프 도중 클라가 두 서버에 동시 접속하거나, 같은 토큰을 두 번 사용하면 인벤토리 복제 가능. 90년대 디아블로 dupe 버그의 분산 버전.

**현재 해결**: `pendingHandoffs.delete(token)` 으로 토큰 1회용 처리. 5초 만료.

**남은 엣지 케이스**:
- 클라가 토큰 받기 전에 source 측에 다른 클라이언트로 접속해서 같은 plaerId 사칭 가능? (검증 안 함)
- 인벤토리 자체에 서명/체크섬 없음. 클라가 transfer 시 inv를 임의 조작 가능 (`x`, `y`, `inv` 쿼리 파라미터).

**다음**: 토큰에 player identity binding. 인벤토리는 서버 측에서만 권위적으로 보관 (클라 transfer 못 함).

### 1.3 경계 부근 전투
**상태**: 회피됨

**무엇**: A가 B에게 화살 쏘는 중에 B가 경계 넘으면 화살이 어느 서버에서 맞는지 모호.

**왜 회피**: 우리 게임에 전투가 아직 없음.

**다음**: PvP/PvE 추가하면 다시 문제. 해결법은 (1) 경계 근처 전투 비활성화, (2) 발사체에 source 서버 권위 부여 후 결과만 target에 통보, (3) EVE처럼 경계가 "안전 영역"이라는 게임 디자인.

### 1.4 행동 중단 (action interruption)
**상태**: 회피됨

**무엇**: "10초 동안 나무 베기" 같은 장시간 액션 중 경계 넘으면 액션이 어느 zone의 자원에 적용되는지 모호.

**왜 회피**: 우리 채집은 즉시 끝나는 단발 액션. claim도 즉시. trade도 즉시.

**다음**: 크래프팅 시스템 추가하면 문제. 해결법은 장시간 액션 중엔 이동 잠그기 또는 액션 진행도를 핸드오프 페이로드에 포함.

### 1.5 시각적 깜빡임·desync
**상태**: 부분 해결

**무엇**: 핸드오프 순간 플레이어가 한 프레임 어색하게 보일 수 있음. 옆 zone의 다른 플레이어가 갑자기 나타나거나 사라짐.

**현재 해결**: observer 구독으로 인접 zone 미리 보기. PEEK_THRESHOLD = 800px로 시야 반경(650)보다 여유 있게. 핸드오프 시 predicted를 안 건드려서 카메라 점프 없음.

**남은 엣지 케이스**:
- 핸드오프 직후 target zone welcome 도착 전까지 ~30~150ms 동안 자기 캐릭터 정보가 빈 상태. 다른 사람들 눈엔 잠시 사라져 보임.
- 인접 zone의 플레이어가 자기네 핸드오프 중일 때 양쪽 zone 모두에서 잠시 보일 수 있음 (handingOff broadcast 제외했지만 target zone 도착 전엔 양쪽에서 사라짐).

**다음**: target zone에 도착하면 source에 ACK → source가 즉시 정리. 다른 플레이어의 시야에서 "사라졌다가 다시 나타나는" 깜빡임 최소화.

### 1.6 밀집된 채로 경계 넘기
**상태**: 미해결 (아직 안 겪음)

**무엇**: 10명이 동시에 같은 경계를 넘으면 한 tick에 핸드오프 10개. HTTP POST 10개 + 토큰 10개 + 1.5초 동안 source 부하.

**다음**: 부하 테스트 필요. 핸드오프 큐 도입 — 한 tick에 N명까지만 처리, 나머지는 다음 tick 대기. EVE의 점프 큐와 유사.

### 1.7 경계 클러스터링 어뷰징 (observer 정보 누출)
**상태**: 미해결

**무엇**: 일반 플레이어가 보면 안 되는 정보(예: 인접 zone의 자원 정확한 위치, 다른 플레이어 좌표)를 observer 구독으로 누출. 경쟁 게임이면 큰 문제.

**현재**: observer는 모든 자원·플레이어 좌표를 그대로 받음. AOI 필터링 없음.

**다음**: observer에게도 시야 반경 안 엔티티만 전송. 서버 측 AOI 구현.

### 1.8 인증·세션 일관성
**상태**: 미해결

**무엇**: 현재는 누구나 아무 이름으로 접속 가능. 같은 이름으로 두 명이 들어와도 막지 않음. 핸드오프 토큰은 random string. 토큰 위조나 가로채기 가능.

**다음**: 
1. 로그인 시스템 도입 (간단한 닉네임+패스워드, 또는 OAuth)
2. 세션 토큰은 JWT로 발급 후 서명 검증
3. 핸드오프 토큰에 player identity 포함, source 서명 검증

### 1.9 거래·경제 일관성
**상태**: 미래

**무엇**: 현재 거래(T/Y)는 같은 zone 안에서만 가능. 글로벌 거래소를 만들면 zone 간 가격·재고 동기화 필요.

**다음**: 거래소 구현 시 *중앙 marketplace 서버* 도입. 각 zone이 주문서/체결을 marketplace에 보내고 받음. zone 자체는 거래소 상태에 권위 없음.

### 1.10 건축물이 경계에 걸침
**상태**: 회피됨

**무엇**: 토지(claim)가 경계를 가로질러 두 zone에 걸치면 어느 서버가 권위?

**왜 회피**: claim은 한 zone 내부에서만 가능. 경계 부근에서 시도해도 좌표가 한 zone에만 속함.

**다음**: 자유 건축 추가 시 경계 부근 건축 제한 또는 경계 자체에 건축 불가 영역.

---

## 2. 분산 인프라 자체의 문제

### 2.1 운영 복잡도
**상태**: 미해결 (프로토타입 수준)

**무엇**: 서버 프로세스가 6개 (dispatcher + 5 zone). 각각 모니터링·로그·재시작·배포 따로.

**현재**: `concurrently`로 한 번에 띄우고 끔. 운영 도구는 없음.

**다음**: 
- 각 zone에 헬스체크 엔드포인트 (이미 있음: `/health`)
- 프로세스 매니저(PM2) 도입해서 자동 재시작
- 중앙 로그 집계 (현재는 stdout만)

### 2.2 글로벌 기능의 지연
**상태**: 미래

**무엇**: "전체 공지" "글로벌 채팅"이 들어오면 zone마다 보내야 함. zone 간 latency만큼 지연 누적.

**다음**: 글로벌 메시지 버스(Redis pub/sub) 도입. dispatcher가 발행, 모든 zone이 구독.

### 2.3 친구 찾기 / 플레이어 검색
**상태**: 미래

**무엇**: "내 친구 어느 zone에 있어?"가 어려움. 모든 zone에 쿼리 보내야 함.

**다음**: 중앙 player presence 인덱스. dispatcher가 또는 별도 redis가 "player_id → current_zone_id" 매핑 유지.

### 2.4 백업 일관성
**상태**: 미해결

**무엇**: 모든 zone 데이터를 *같은 시점*으로 백업하려면 분산 트랜잭션 필요. 단순 zone별 백업은 핸드오프 중 플레이어 손실 위험.

**현재**: 백업 자체가 없음 (메모리 저장만).

**다음**: SQLite/DB 도입 후, 백업 시점에 모든 zone이 잠시 read-only로 전환 → 스냅샷 → 다시 쓰기 허용. 또는 핸드오프 로그 기반 point-in-time recovery.

### 2.5 DDoS·보안 표면적
**상태**: 미해결

**무엇**: 공격 가능한 endpoint가 6배. 각 zone의 `/handoff_prepare`도 외부 노출이면 위조 핸드오프 가능.

**다음**: 
- `/handoff_prepare`는 내부 망에서만 호출되도록 방화벽
- 또는 zone 간 통신을 별도 인증 (HMAC 서명)
- WebSocket rate limiting

### 2.6 배포·업데이트 / 프로토콜 호환성
**상태**: 미해결

**무엇**: zone 5개를 동시에 업데이트하려면 코디네이션. 일부만 신버전이면 핸드오프 프로토콜 충돌 가능.

**다음**: 
- 핸드오프 페이로드에 `protocol_version` 필드
- 한 메이저 버전 내에선 forward/backward compat 유지
- 배포 시 전체 짧은 다운타임 또는 blue-green 배포

### 2.7 비용
**상태**: 미래

**무엇**: 실제 클라우드 배포 시 zone마다 별도 인스턴스. 부하 분산 효과는 있지만 최소 가동률은 zone 수만큼 곱해짐.

**다음**: zone density 조절 — 인기 없는 zone은 한 인스턴스에 여러 zone 묶기 (예: usa+france를 같은 인스턴스에). 인기 많은 zone은 단독 인스턴스.

### 2.8 데이터 영속화 부재
**상태**: 미해결

**무엇**: 현재 모든 상태가 메모리. 서버 재시작 = 인벤토리·토지·플레이어 진행도 다 사라짐.

**다음**: SQLite 도입 (각 zone이 자기 zone의 데이터 보관). 인벤토리는 player_id로 식별해서 cross-zone 영속화는 dispatcher 측에서 또는 공유 DB로.

### 2.9 AOI (Area of Interest) 필터링 부재
**상태**: 미해결

**무엇**: 현재 서버 tick은 zone 안의 모든 player·resource를 broadcast. zone에 100명 있으면 매 tick에 100명 위치를 모두에게 전송. 대역폭 N². observer 연결도 zone 전체 받음.

**다음**: 서버가 각 플레이어의 시야 반경 안 엔티티만 보내도록. spatial hash나 quad-tree로 인덱싱. observer도 *대략적 위치*만 전달받게.

### 2.10 모니터링·관측
**상태**: 미해결

**무엇**: zone별 동시접속 수, RTT 통계, 핸드오프 횟수/실패율 같은 메트릭이 없음.

**다음**: 각 zone이 Prometheus 형식 메트릭 노출. dispatcher가 집계해서 대시보드.

---

## 실전 함정 (운영 시 주의)

### Native 의존성과 cross-platform
**상황**: `better-sqlite3`는 C++ native binding을 포함. OS·CPU 아키텍처별로 따로 빌드됨.

**문제**: 한 환경(예: CI Linux)에서 `npm install`한 `node_modules`를 다른 환경(예: 개발자 Mac)에 그대로 옮기면 `dlopen failed: slice is not valid mach-o file` 같은 에러로 즉시 크래시.

**해결**:
- 환경 옮길 때마다 `npm install` 다시 실행
- 또는 native 모듈만: `npm rebuild better-sqlite3`
- CI/CD에서 빌드한 산출물은 같은 OS·아키텍처 머신에서만 사용
- Docker 이미지로 환경 통일하면 안전

**교훈**: native 의존성 도입은 운영 단순성 트레이드오프. 가능하면 pure-JS 대안 우선 검토 (예: SQLite는 `sql.js`라는 WebAssembly 버전도 있음, 더 느리지만 cross-platform).

### macOS Sequoia의 `com.apple.provenance` 속성

**상황**: macOS 15 (Sequoia) 이후 npm install 시 native module(better-sqlite3 등)에 `com.apple.provenance` 속성이 붙음. macOS가 code signature를 의심해서 실행 시 SIGKILL.

**증상**: zone 서버가 에러 메시지 한 줄도 없이 `zsh: killed`로 즉시 종료. 6개 동시 실행 시 모두 SIGKILL.

**해결**:
```bash
xattr -dr com.apple.provenance node_modules
# 또는 self-sign
codesign --force --sign - node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

**근본**: 이건 Sequoia의 보안 강화 의도지만 native node module 생태계랑 마찰. npm/Apple 양측에서 장기 해결이 진행 중. 당분간은 install 후 매번 위 명령 실행이 필요.

**더 깊은 차단** (회사 노트북·MDM·EDR 환경):
xattr 제거·codesign·build-from-source 다 막힐 수 있음. 이 경우 외부 native module 자체를 포기하는 게 답.

대안:
1. **`node:sqlite` (Node 22 내장)** — Apple이 직접 서명한 Node 바이너리 안에 SQLite가 정적 링크. 외부 .node 파일이 없어 macOS 보안 정책 통과. 실행 시 `--experimental-sqlite` 플래그 필요. 우리 코드가 채택한 방식.
2. **`sql.js` (WebAssembly)** — 순수 JS + WASM. 완전 sandbox. 약 2~5배 느리지만 어떤 환경에서도 작동.
3. **JSON 파일** — 가장 단순. 트랜잭션·동시 쓰기 처리 직접 해야 함. 소규모면 충분.

### 동시 SQLite writer 의 lock race

**상황**: 같은 DB 파일에 여러 프로세스가 동시에 쓰려고 하면 한 프로세스가 lock 잡힌 동안 다른 프로세스는 `SQLITE_BUSY` 에러 받음. 우리 케이스에서 6개 zone이 동시 부팅하다가 한두 개가 `database is locked` 에러로 즉시 종료.

**해결**: `PRAGMA busy_timeout = 5000` — lock 잡혔으면 최대 5초 대기 후 재시도. 모든 후속 SQL이 자동으로 retry 함.

**더 깊은 해결**: WAL 모드. WAL은 read와 write를 동시 가능하게 하고, write 끼리도 큐잉이 더 자연스러움. 단 filesystem이 지원해야 함 (네트워크 마운트는 종종 실패).

## 우선순위 제안

**먼저 풀기 좋은 것들 (프로토타입에서 의미 있음)**:

1. **데이터 영속화 (SQLite)** — 2.8. 게임이 진지해지려면 필수. 재시작에도 진행도 유지. (선행 조건이 많은 다른 문제들을 풀게 함)
2. **인증 시스템** — 1.8 일부. 같은 이름 충돌 방지, 다음 접속 시 같은 사람 인식.
3. **핸드오프 ACK** — 1.1 + 1.5. target 도착 시 source에 알려서 정리 타이밍 정확히. 시각 깜빡임 더 줄임.
4. **AOI 필터링** — 2.9 + 1.7. 대역폭 줄이고 observer 정보 누출도 자동 해결.

**나중에 (콘텐츠 들어오면)**:

5. 거래소 / 글로벌 경제 — 1.9 + 2.2 (중앙 marketplace 필요)
6. 전투 시스템 — 1.3 (경계 부근 처리 디자인 필요)
7. 크래프팅 / 장시간 액션 — 1.4

**운영 단계로 가면**:

8. 모니터링·메트릭 — 2.10
9. 백업·복구 — 2.4
10. 보안·인증 강화 — 2.5
11. 배포 자동화 — 2.6
12. 비용 최적화 — 2.7
