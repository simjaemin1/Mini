# 지형 파이프라인 (Phase 5-H)

## 구조

```
scripts/terrain-data-<zone>.js   ← 데이터 정의 (사람이 편집하는 곳)
scripts/build-terrain.js         ← 빌드: 병합 + 자동 계곡 + 경계 미러링 + SVG 렌더
server/hanbando-terrain.json     ← 게임 적용본 (커밋 대상)
../hanbando_terrain.json         ← 디자인 사본 (repo 밖, 로컬 전용)
../hanbando_full.svg             ← 시각 확인용 렌더 (repo 밖, 로컬 전용)
```

**워크플로**: `terrain-data-*.js` 수정 → `node scripts/build-terrain.js` → SVG 확인 → 커밋·배포.
재실행 안전 (생성물은 매번 지우고 다시 만듦).

## 데이터 형식 (zone-local px, y는 북→남)

- **river**: `{ name, path: [{pos:[x,y], width}] }` — width는 구간별 보간
- **ridge** (산맥): river와 동일 형식 + `noValley` (강 교차 자동 계곡 생성 끔)
- **pass** (고개): `{ name, pos:[x,y], radius }` — radius 안은 통행 가능
- **lake**: `{ name, center:[x,y], radius }`
- **forest**: `{ name, center, rx, ry, densityMult }` — 게임 로직은 미구현 (데이터만)

## 규칙

1. **판정 우선순위: 고개 > 물 > 바위.** 강이 능선과 겹치면 그 셀은 물 (협곡 관통).
2. **자동 계곡**: 강이 능선을 가로지르면 빌드가 교차점에 고개를 자동 생성 (`noValley`로 끔).
3. **경계 미러링 자동**: zone 경계 3000px 안의 강·산·호수는 이웃 zone 좌표계로 자동 복제
   (`_mirroredFrom` 마커). 경계에 걸치게 그려도 됨 — 빌드가 알아서 양쪽에 넣음.
4. **사합점(4-zone 모서리)은 매듭으로 덮기**: 산괴(noValley ridge) 또는 호수.
   십자 경계 은폐 + 대각 이중 핸드오프 차단.
5. **경계 장벽 원칙**: zone 경계 = 저상호작용 지대. 장벽 타입은 zone마다 다양화
   (강/산맥/사막/빙원). 횡단은 소수의 의도된 지점(고개·나루·다리)으로만.
6. zone offset/size는 32px 배수 (zone-config 스냅). build-terrain.js의 ZONES 표와 일치 유지.

## 게임 로직 연결 (Phase 5-H에서 구현)

- `terrain.js` (server/public 두 벌 모두): `isRockCellLocal(zoneId, lx, ly)` — ridge 안 && 고개 밖 && 물 아님
- `zone.js`: `isTerrainBlockedLocal` = 물 + 바위. 이동·스폰·경로·텔레포트 전부 이걸 씀
- `client.js`: `isTerrainBlockedAtAbs` (예측 이동), 타일 렌더 바위색(#6e6356), bigMap rock 표시
- 셀 캐시: `_waterCellCache`/`_rockCellCache` — terrain 갱신 시 clear 필수

## 새 zone 추가 절차

1. `scripts/terrain-data-<zone>.js` 작성 (이 파일 형식 복사)
2. `build-terrain.js`의 `DATA_MODULES`에 등록, 필요하면 `ZONES` 표에 offset 추가
3. `node scripts/build-terrain.js` → SVG 확인 → 커밋

## 다음 단계 (예정)

- 숲 게임 로직: getForestMultiplier ellipse+falloff 지원, cleanZone 해제 후 나무 스폰
- 바위 셀 채굴 (터널) — 채굴된 셀 Set을 DB 저장, isRockCellLocal에서 제외
- 나루터/다리 — 강 경계 횡단 지점
