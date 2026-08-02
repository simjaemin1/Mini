# DB 리셋 절차 — 무엇을 잃고 무엇을 얻는가

> 2026-08-02b. **실행은 재민만.** 이 문서는 절차와 손익을 적어 두는 것이고,
> 클로드는 리셋을 실행하지 않는다(절대 규칙 2).
> 리셋 없이 **부존만** 소급하는 길은 `scripts/migrate-db-endowment.js` 다(§4 비교표).

---

## 1. 왜 이 문서가 필요한가

**시딩은 DB 가 비어 있을 때 딱 한 번 돈다.** 그 뒤 부팅은 전부 복원 경로다.
실측(2026-08-02):

```
새 DB 부팅   → [hanbando] 🏘️ 마을 시딩 시작 — 후보 51 → 선별 19 … 18곳 시딩
같은 DB 재부팅 → 시딩 로그 0줄 (복원만)
```

그래서 아래 개선들이 **라이브에는 하나도 안 먹는다**:

| 변경 | 커밋 | 실측 효과(실지도 800일 3시드) | 리셋 없이 소급? |
|---|---|---|---|
| 부유 시딩(식량 하한 × 도구 접근) | `1744e0e` | 소멸 11.7 → 6.0 · 인구 696 → 1,118 | **불가** — 자리 선택은 되돌릴 수 없다 |
| 땅맞춤 초기 부존 | `187671c` | 소멸 6.0 → 2.7 · 인구 1,118 → 1,630 | **가능** — migrate-db-endowment |
| 부얼타운 예외(광산촌) | 2026-08-02b | (§ 보고서 참조) | **불가** — 새 마을을 심는 일이다 |
| 다광종 광맥 · 유효 제련 조성 | `481e02f` · 08-02b | 원석 적체 해소 | **부분** — oreMix 가 없는 옛 저장분은 보강됨 |

합치면 **소멸 11.7 → 2.7(−77%) · 인구 696 → 1,630(+134%)** 이고,
그중 **자리 선별 몫은 리셋에서만** 발효한다.

---

## 2. 리셋하면 잃는 것 (전부)

`world-hanbando.db` 한 파일에 존의 모든 영속 상태가 들어 있다:

| 테이블 | 내용 | 리셋 시 |
|---|---|---|
| `villages` | 마을 20곳의 econ 전체(인구·NPC·창고·숙련·길드·재정·history) | **전부 소멸** |
| `village_buildings` | 마을 집·논·밭·회관 셀 기록 | 전부 소멸 |
| `buildings` | **플레이어가 지은 것 전부** — 벽·문·상자·움집·곳간·노(爐)·숯가마 | **전부 소멸** |
| `claims` | **플레이어 사유지**(개인·임시·길드 영토) | **전부 소멸** |
| `resources` | 나무·바위·광맥 노두 등 절차 자원의 현재 hp | 소멸(재생성됨 — 무해) |
| `mobs` | 동물 위치·hp | 소멸(재생성됨 — 무해) |
| `mined_cells` | 파낸 광맥 셀의 재고·타수 | 소멸(전부 만땅으로 복귀) |
| `harvested_seeds` | 채집된 절차 자원 표시(운철 포함) | 소멸 → **운철이 전부 되살아난다** |

**플레이어 계정·인벤토리·도구·장비는 central.db 라 살아남는다**(zone DB 에 없다).
즉 플레이어는 **물건은 그대로 들고 있고 지어 놓은 것만 잃는다.**

> ⚠라이브에 사람이 지어 놓은 것이 얼마나 되는지 나는 모른다. 그게 이 결정의 전부다.
> `SELECT type, COUNT(*) FROM buildings GROUP BY type;` 로 먼저 세어 보길 권한다(§5 점검 쿼리).

## 3. 리셋하면 얻는 것

- **부유 시딩** — 땅이 먹여 살릴 수 있는 자리 20곳(소멸 11.7 → 6.0)
- **땅맞춤 초기 부존** — 돌·나무가 바닥인 마을이 도구 아사를 넘긴다(6.0 → 2.7)
- **부얼타운** — 구리 90% 광산6 등 광산촌 시딩(주조 마을 수의 근원 — `회부_구리부존과_원석적체` ①)
- **다광종 광맥** — 옛 단광종 저장분이 아니라 연은·부산 귀금속 조성으로 시작
- 운철 42개 재출현 · 광맥 재고 만땅

## 4. 리셋 vs 마이그레이션 — 어느 쪽인가

| | `migrate-db-endowment.js` | 리셋 |
|---|---|---|
| 플레이어 건축물·사유지 | **보존** | 소멸 |
| 마을 인구·NPC·숙련 | **보존** | 소멸(8명부터 다시) |
| 땅맞춤 부존 | ✅ 소급 | ✅ |
| 부유 시딩(자리) | ❌ | ✅ |
| 부얼타운 | ❌ | ✅ |
| 되돌리기 | 백업 복사 | 백업 복사 |
| 효과 크기 | 소멸 −55% 중 **부존 몫만** | 전부(−77%) |

**권고**: 라이브에 플레이어 건축물이 유의미하게 있으면 **마이그레이션**,
사실상 비어 있으면 **리셋**이 낫다. 둘 다 아니면 §6 의 "새 존" 안.

---

## 5-0. ★★라이브 리셋 — **복사·붙여넣기 한 블록** (2026-08-02e)

> 재민 "DB는 리셋해도 된다고 했어". 다만 **배포·SSH 채널은 여전히 재민 전용**이라
> 클로드는 `fly ssh`/`fly console` 을 **시도하지 않는다**(절대 규칙 1). 대신 여기에 그대로 붙여넣을
> 명령 시퀀스를 둔다 — 위에서 아래로 순서대로, **한 줄씩** 실행하면 된다.
>
> ⚠순서가 곧 안전장치다: **세고 → 끄고 → 백업하고 → 지우고 → 켠다.**
> 백업을 건너뛰면 되돌릴 수 없다(운철·플레이어 건축물·사유지가 전부 사라진다 — §2).

```sh
# ── ① 무엇을 잃는지 먼저 센다 (지우기 전에!) ───────────────────────────────
fly ssh console -a <ZONE_APP> -C "sqlite3 /data/world-hanbando.db   'SELECT type, COUNT(*) FROM buildings GROUP BY type ORDER BY 2 DESC;'"
fly ssh console -a <ZONE_APP> -C "sqlite3 /data/world-hanbando.db   'SELECT kind, COUNT(*) FROM claims GROUP BY kind;'"
fly ssh console -a <ZONE_APP> -C "sqlite3 /data/world-hanbando.db   'SELECT COUNT(*) villages, SUM(population) pop FROM villages;'"

# ── ② 백업 — 반드시 -wal 까지. WAL 모드라 최근 쓰기가 거기 있다 ─────────────
fly ssh console -a <ZONE_APP> -C "sh -c 'cd /data && TS=\$(date +%Y%m%d-%H%M) &&   cp world-hanbando.db world-hanbando.db.bak-\$TS &&   cp world-hanbando.db-wal world-hanbando.db-wal.bak-\$TS 2>/dev/null;   cp world-hanbando.db-shm world-hanbando.db-shm.bak-\$TS 2>/dev/null; ls -la /data | tail -20'"

# (선택) 백업을 로컬로 내려받아 둔다 — 볼륨째 날아가는 사고까지 대비
fly ssh sftp get /data/world-hanbando.db.bak-<TS> ./world-hanbando.backup.db -a <ZONE_APP>

# ── ③ 끈다 — 켠 채로 지우면 메모리 상태가 다시 써 버린다 ────────────────────
fly scale count 0 -a <ZONE_APP> -y

# ── ④ 지운다 (이게 리셋이다 — 부팅 시 스키마 자동 생성 + 시딩) ──────────────
fly ssh console -a <ZONE_APP> -C "sh -c 'rm -f /data/world-hanbando.db /data/world-hanbando.db-wal /data/world-hanbando.db-shm && ls -la /data'"
#   ⚠ scale 0 상태에선 ssh 가 안 붙는다. 그럴 땐 ③④ 순서를 바꿔라:
#      ④'  먼저 파일을 지우고  →  ③'  즉시 `fly apps restart -a <ZONE_APP>`
#      (지운 직후 살아 있는 프로세스가 다시 쓰기 전에 재시작하면 된다)

# ── ⑤ 켜고 재시딩을 눈으로 확인한다 ────────────────────────────────────────
fly scale count 1 -a <ZONE_APP> -y
fly logs -a <ZONE_APP> | grep -E "마을 시딩 시작|시딩:|zone server up"
#   기대: "🏘️ 마을 시딩 시작 — 후보 51 → 선별 19" → 마을별 "시딩:" 18줄 → "zone server up"
#   부팅에 4~5분 걸린다(마을당 5~19초 — 생활층 실체화가 무겁다). 그동안 접속은 대기한다.

# ── ⑥ 되돌리기 (마음이 바뀌면) ─────────────────────────────────────────────
fly scale count 0 -a <ZONE_APP> -y
fly ssh console -a <ZONE_APP> -C "sh -c 'cd /data && rm -f world-hanbando.db world-hanbando.db-wal world-hanbando.db-shm &&   cp world-hanbando.db.bak-<TS> world-hanbando.db && cp world-hanbando.db-wal.bak-<TS> world-hanbando.db-wal 2>/dev/null; ls -la'"
fly scale count 1 -a <ZONE_APP> -y
```

`<ZONE_APP>` 은 `fly.korea.toml` 의 app 이름(존별로 다르다), `<TS>` 는 ②에서 찍힌 타임스탬프다.
**central.db 는 건드리지 않는다** — 계정·인벤·장비가 거기 있고 리셋 대상이 아니다(§2).

### 리셋으로 라이브가 얻는 것 (2026-08-02e 기준 실측)

리셋해야만 발효하는 것이 **자리 선별**이라, 리셋 전후는 사실상 다른 세계다:

| | 리셋 전(옛 시딩) | 리셋 후(현 시딩+엔진) |
|---|---|---|
| 실지도 3시드 800일 인구 | — | **3,424** |
| 소멸 | — | **0/19 (3/3 시드)** |
| 좀비(10명 미만) | — | **0** |
| 품질보정 무기(Σ 수량×품질) | — | **616** |

---

## 5. 절차 (재민 실행용 — 로컬/도커 판)

### ① 먼저 세어 본다 — 무엇을 잃는지 알고 결정한다

```sh
cd /opt/Mini
sqlite3 world-hanbando.db "SELECT type, COUNT(*) FROM buildings GROUP BY type ORDER BY 2 DESC;"
sqlite3 world-hanbando.db "SELECT kind, COUNT(*) FROM claims GROUP BY kind;"
sqlite3 world-hanbando.db "SELECT COUNT(*) AS villages, SUM(population) AS pop FROM villages;"
```

플레이어 건축물은 `wall/floor/door/fence/chest/hut/guild_granary/furnace/charcoal_kiln` 등이다
(마을 것은 `village_buildings` 라 여기 안 나온다).

### ② 서버를 끈다 — **켠 채로 만지면 메모리 상태가 덮어쓴다**

```sh
docker stop mini-hanbando        # 또는 배포 스크립트의 정지 명령
```

### ③ 백업 (롤백 경로 — 이것 없이는 되돌릴 수 없다)

```sh
cp world-hanbando.db     world-hanbando.db.bak-$(date +%Y%m%d-%H%M)
cp world-hanbando.db-wal world-hanbando.db-wal.bak-$(date +%Y%m%d-%H%M) 2>/dev/null
cp world-hanbando.db-shm world-hanbando.db-shm.bak-$(date +%Y%m%d-%H%M) 2>/dev/null
```

⚠**`-wal` 을 같이 백업해야 한다.** WAL 모드라 최근 쓰기가 거기 있다. 본체만 복사하면
되돌렸을 때 최근 상태가 날아간다.

### ④ 리셋

```sh
rm -f world-hanbando.db world-hanbando.db-wal world-hanbando.db-shm
```

(파일을 지우는 게 리셋이다 — 부팅 시 스키마가 자동 생성되고 시딩이 돈다.)

### ⑤ 다시 띄우고 확인

```sh
docker start mini-hanbando
docker logs -f mini-hanbando | grep -E "마을 시딩 시작|시딩:|zone server up"
```

기대 로그: `🏘️ 마을 시딩 시작 — 후보 51 → 선별 20 (VILLAGE_MAX=20)` (부얼타운 채택 시 20곳).
부팅에 **4~5분** 걸린다(마을당 5~19초 — 생활층 실체화가 무겁다). 그 사이 접속은 대기한다.

### ⑥ 롤백 (마음이 바뀌면)

```sh
docker stop mini-hanbando
rm -f world-hanbando.db world-hanbando.db-wal world-hanbando.db-shm
cp world-hanbando.db.bak-<타임스탬프>     world-hanbando.db
cp world-hanbando.db-wal.bak-<타임스탬프> world-hanbando.db-wal 2>/dev/null
docker start mini-hanbando
```

---

## 6. 리셋 말고 다른 길

- **(가) 마이그레이션만** — `node scripts/migrate-db-endowment.js --apply`
  (서버 끈 상태에서. 자동 백업. 멱등 — 두 번 돌려도 같다.)
  얻는 것: 땅맞춤 부존. 못 얻는 것: 자리 선별·부얼타운.
- **(나) 마을만 재시딩** — `villages`·`village_buildings` 만 지우고 플레이어 것은 남기는 길.
  지금 **그런 코드 경로가 없다**(부분 삭제 + 재시딩 훅을 새로 만들어야 한다). 원하면 다음 배치에 만든다.
  ⚠주의: 마을을 지우면 그 영토에 얹힌 플레이어 사유지·건물의 소속이 붕 뜬다 — 그 정합을 설계해야 한다.
- **(다) 새 존을 연다** — 옛 존은 "구세계"로 그대로 두고 새 시딩으로 만든 존을 추가.
  잃는 것 0. `zone-config.js` 에 존을 더하고 배포하면 된다. 다만 두 세계가 병존한다.

---

## 7. 리셋 후 확인 목록

- [ ] `마을 시딩 시작 — 후보 51 → 선별 N` 로그 확인 (N = 19~20)
- [ ] 광산6·광산1 이 시딩됐는지(부얼타운 채택 시) — `grep "\[광산" 로그`
- [ ] 게스트 입장 → 유령 클라 없음 · 스폰 정상
- [ ] 며칠 뒤 인구 추이 — 소멸이 실제로 줄었는지(랩 예측 소멸 2.7/20)
- [ ] 운철이 지표에 다시 있는지(대륙 42개 — 채집 표시가 초기화된다)
