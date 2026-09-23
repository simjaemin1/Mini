// === 청크 시스템 ===
// zone을 N×N 청크 그리드로 분할. 자원/mob/건물을 청크별 분류 보관.
// 12.2.a: 분류만 (활성/비활성 X). 12.2.b에서 활성 청크만 tick 처리.
//
// API:
//   const cm = new ChunkManager(zoneWidth, zoneHeight, chunkSize);
//   cm.insertResource(r);  // r._chunkKey 자동 셋
//   cm.removeResource(r);
//   cm.updateMobChunk(m);  // mob 이동 후 호출 — 청크 바뀌었으면 재배치
//   cm.getChunksInRadius(x, y, radius); // 활성 청크 계산용
//   cm.allChunks();

// Phase 5-3: 청크 size 256 → 1024 (zone 100배 확장 시 청크 수 폭증 방지).
// 1024 px = 32 cells. zone 110K × 50K → 5,243 청크 (이전 256px면 84K, 무리).
const CHUNK_SIZE = 1024;

class Chunk {
  constructor(cx, cy) {
    this.cx = cx; this.cy = cy;
    this.resources = new Map();
    this.mobs = new Map();
    this.buildings = new Map();
  }
  isEmpty() {
    return this.resources.size === 0 && this.mobs.size === 0 && this.buildings.size === 0;
  }
}

class ChunkManager {
  constructor(zoneWidth, zoneHeight, chunkSize = CHUNK_SIZE) {
    this.chunkSize = chunkSize;
    this.colsX = Math.ceil(zoneWidth / chunkSize);
    this.colsY = Math.ceil(zoneHeight / chunkSize);
    this.chunks = new Map(); // key → Chunk
  }

  keyOf(cx, cy) { return `${cx}_${cy}`; }
  chunkXY(x, y) {
    return { cx: Math.floor(x / this.chunkSize), cy: Math.floor(y / this.chunkSize) };
  }
  getOrCreate(cx, cy) {
    const k = this.keyOf(cx, cy);
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cy); this.chunks.set(k, c); }
    return c;
  }
  getChunkAt(x, y) {
    const { cx, cy } = this.chunkXY(x, y);
    return this.getOrCreate(cx, cy);
  }

  // === resources (이동 안 함) ===
  insertResource(r) {
    const c = this.getChunkAt(r.x, r.y);
    c.resources.set(r.id, r);
    r._chunkKey = this.keyOf(c.cx, c.cy);
  }
  removeResource(r) {
    if (!r._chunkKey) return;
    const c = this.chunks.get(r._chunkKey);
    if (c) c.resources.delete(r.id);
    r._chunkKey = null;
  }

  // === mobs (이동함 — 위치 바뀌면 청크 갱신) ===
  insertMob(m) {
    const c = this.getChunkAt(m.x, m.y);
    c.mobs.set(m.mid, m);
    m._chunkKey = this.keyOf(c.cx, c.cy);
  }
  removeMob(m) {
    if (!m._chunkKey) return;
    const c = this.chunks.get(m._chunkKey);
    if (c) c.mobs.delete(m.mid);
    m._chunkKey = null;
  }
  updateMobChunk(m) {
    const { cx, cy } = this.chunkXY(m.x, m.y);
    const newKey = this.keyOf(cx, cy);
    if (m._chunkKey === newKey) return;
    if (m._chunkKey) {
      const old = this.chunks.get(m._chunkKey);
      if (old) old.mobs.delete(m.mid);
    }
    const c = this.getOrCreate(cx, cy);
    c.mobs.set(m.mid, m);
    m._chunkKey = newKey;
  }

  // === buildings (이동 안 함) ===
  insertBuilding(b) {
    const c = this.getChunkAt(b.x, b.y);
    c.buildings.set(b.id, b);
    b._chunkKey = this.keyOf(c.cx, c.cy);
  }
  removeBuilding(b) {
    if (!b._chunkKey) return;
    const c = this.chunks.get(b._chunkKey);
    if (c) c.buildings.delete(b.id);
    b._chunkKey = null;
  }

  // === 활성 청크 계산 (12.2.b에서 사용) ===
  // 위치 (x,y) 주변 radius 안 청크들 반환
  getChunksInRadius(x, y, radius) {
    const rc = Math.ceil(radius / this.chunkSize);
    const center = this.chunkXY(x, y);
    const result = [];
    for (let dx = -rc; dx <= rc; dx++) {
      for (let dy = -rc; dy <= rc; dy++) {
        const cx = center.cx + dx;
        const cy = center.cy + dy;
        if (cx < 0 || cy < 0 || cx >= this.colsX || cy >= this.colsY) continue;
        const c = this.chunks.get(this.keyOf(cx, cy));
        if (c) result.push(c);
      }
    }
    return result;
  }

  // 여러 viewer 위치 → 활성 청크 set
  getActiveChunks(viewers, radius) {
    const set = new Set();
    for (const v of viewers) {
      for (const c of this.getChunksInRadius(v.x, v.y, radius)) {
        set.add(c);
      }
    }
    return set;
  }

  allChunks() { return this.chunks.values(); }
  size() { return this.chunks.size; }
}

// === Procedural generation (12.2.e) ===
// 청크별 시드로 자원 위치/타입 결정. 같은 청크는 매번 같은 자원 spawn.
// 채집된 자원만 harvested_seeds DB에 기록.
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
function seedRand(zoneId, cx, cy, n) {
  let h = hashStr(zoneId);
  h = (h ^ (cx * 73856093)) >>> 0;
  h = (h ^ (cy * 19349663)) >>> 0;
  h = (h ^ (n * 83492791)) >>> 0;
  h = ((h * 9301) + 49297) >>> 0;
  return (h % 2147483647) / 2147483647;
}

const RESOURCE_HP_TABLE = { tree: 3, rock: 4, berry_bush: 2, water_pool: 999, herb: 1, ore: 5, meteorite: 6, sapling: 1 };

// ══ ★★[T122 2026-09-05 재민 확정] **나무는 다시 난다** ═══════════════════════
//
// 재민: *"당연히 나무도 리젠되어야 한다."* 종전엔 캔 시드 자원이 `harvested_seeds` 에 박혀
// **그 세계에서 영원히** 없었다(주석 "Phase 12.2.e 자원 respawn 제거"). 그런데 NPC 벌목꾼이
// 매일 실물을 벤다(`_lifeJobSites` → zone.js) ⇒ 마을 근처 숲은 줄기만 하고 안 돌아온다. 결함이다.
//
// ★문법은 **이미 있는 것**을 그대로 쓴다 — 광맥(`Specialty.oreRegen`)·어장·밭(`qd` 정산)이 하는 것:
//   **수확 시각을 적고, 볼 때 경과일로 정산한다.** 타이머 0 · 틱 0 · 주사위 0 · 멱등.
//   여기선 그보다 더 단순하다: 재생이 **연속량이 아니라 단계**라 닫힌 해도 필요 없다.
//
// ★★출처(앵커 하나) — Lee, C.S. et al., *"Establishment, Regeneration, and Succession of
//   Korean Red Pine (Pinus densiflora S. et Z.) Forest in Korea,"* in *Conifers*,
//   ed. A.C. Gonçalves, IntechOpen, 2018. doi:**10.5772/intechopen.80236**
//     · *"To arrive at 60 cm/year … **22 years are required and height of saplings at that
//        time reaches about 2 m**."*                         ⇒ 그루터기 → 묘목 = **22 게임년**
//     · *"it is calculated that **52 years are required until saplings grow to mature trees,
//        which form overstory canopy** by height growth."*   ⇒ 묘목 → 성목 = **52 게임년**
//   소나무를 고른 이유: 송국리기 한반도의 대표 수종이고(T129 가 `tree01~03` 을 *Pinus densiflora*
//   로 적어 뒀다), 한 논문이 **두 수를 다 준다**(앵커 하나 규약).
//   ⚠종은 **아직 하나(`tree`)** 다 — 종별 표는 T123 카탈로그가 온 뒤다(회부).
//   ⚠참나무는 그루터기에서 **맹아**로 다시 난다(coppice) — 소나무는 안 그런다. 종이 갈리는 날
//     그루터기 기간이 종별로 갈릴 자리가 바로 여기다(회부).
//
// ★★그리고 **실시간 환산을 숨기지 않는다**(§0-ⓑ · 재민 판정 자리):
//   게임일 = 24 실분 ⇒ 게임 1년 = 365 게임일 ≈ **6.08 실일**.
//     그루터기 → 묘목  22 게임년 ≈ **134 실일**(4.4개월)
//     묘목 → 성목      52 게임년 ≈ **316 실일**(10.4개월)
//   ⇒ **플레이어는 사실상 성목이 되는 걸 못 본다.** 그게 임학이 말하는 크기이고, 첫 판은
//     카드 지시대로 **출처값 그대로** 세운다. 짧게 할 근거가 생기면 `T122_STUMP_Y`·`T122_TREE_Y`
//     두 손잡이만 갈면 된다(값을 지어내지 않는다 · 재민 판정 뒤).
//
// ★덤불·약초 — 같은 문법, 훨씬 짧다. 이건 **베는 것이 아니라 따는 것**이라 개체가 안 죽는다:
//   덤불은 이듬해 다시 열매를 달고 여러해살이 풀은 한 철이면 돌아온다 ⇒ **1 게임년 / 반 해**.
//   (연 단위 결실·한 철 재생은 이 세계가 `Crops` 에서 이미 쓰는 시간 눈금과 같은 층이다.)
// ★바위·광맥·운철·둠벙은 **종전 그대로** — 바위는 안 나고(그게 맞다) 광맥은 이미 제 재생이 있다.
const _rgNum = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const REGROW = {
  ON: () => _rgNum('T122_REGROW', 1),            // ★되돌림 — 0 이면 종전(= 영구 소실). 부를 때 읽는다
  TREE_STUMP_Y: () => _rgNum('T122_STUMP_Y', 22),  // 그루터기 기간(게임년) — 출처 위
  TREE_FULL_Y: () => _rgNum('T122_TREE_Y', 52),    // 성목까지(게임년) — 출처 위
  BUSH_Y: () => _rgNum('T122_BUSH_Y', 1),          // 덤불 — 이듬해 다시 열린다
  HERB_Y: () => _rgNum('T122_HERB_Y', 0.5),        // 여러해살이 풀 — 한 철
};
// 한 해의 길이는 **econ 계절 정본에서 유도**한다(365 를 여기 적지 않는다 — `events.yearDaysOf` 규약).
let _EV = undefined;
function _yearDays() {
  if (_EV === undefined) { try { _EV = require('./events'); } catch (e) { _EV = null; } }
  try { return (_EV && _EV.yearDaysOf && _EV.yearDaysOf()) || 365; } catch (e) { return 365; }
}
/**
 * ★★재생 정산 — **함수 하나**. 벤 뒤 경과 게임일을 단계로 바꾼다(사본 0 · 주사위 0 · 멱등).
 * @returns {null|'gone'|'stump'|'sapling'|'mature'}
 *   `null`  = 이 종류는 재생하지 않는다(바위·광맥·운철·둠벙 — 호출부가 종전대로 뺀다)
 *   `gone`  = 아직 아무것도 없다(덤불·약초의 재생 전)
 *   `mature`= 종전 그대로 난다(= 안 벤 것과 같다)
 */
// ★★[T135] 종이 갈렸다 — T122 가 여기 적어 둔 회부가 닫힌다:
//   *"종은 아직 하나(`tree`)다 — 종별 표는 T123 카탈로그가 온 뒤다."* 그 표가 `server/trees.json` 이다.
//   `regrowStageOf` 에 **종을 하나 더 받는다**(안 주면 종전 그대로 — 옛 호출부·구 하네스 무변).
//   그루터기/성목 햇수는 `Trees.stageYearsOf` 가 정한다: 표의 `mature` 와 **T122 의 비율**뿐 — 새 수 0.
let _TR = undefined;
function _trees() { if (_TR === undefined) { try { _TR = require('./trees'); } catch (e) { _TR = null; } } return _TR; }
function regrowStageOf(type, elapsedDays, species) {
  if (!(REGROW.ON() !== 0)) return null;              // ★되돌림 — 종전(영구 소실)
  const d = Number.isFinite(elapsedDays) ? elapsedDays : -1;
  if (d < 0) return null;                             // 벤 날을 모른다 — 종전대로 뺀다
  const Y = _yearDays();
  if (type === 'tree') {
    let sY = REGROW.TREE_STUMP_Y(), fY = REGROW.TREE_FULL_Y();
    const T = _trees();
    if (species && T && T.ON()) { const g = T.stageYearsOf(species, sY, fY); sY = g[0]; fY = g[1]; }
    if (d < sY * Y) return 'stump';
    if (d < fY * Y) return 'sapling';
    return 'mature';
  }
  if (type === 'berry_bush') return d < REGROW.BUSH_Y() * Y ? 'gone' : 'mature';
  if (type === 'herb') return d < REGROW.HERB_Y() * Y ? 'gone' : 'mature';
  return null;                                        // 바위·광맥·운철·둠벙 — 무변
}

// ★★[재민 확정 · 2026-08-02] 운철(隕鐵) — "거의 불가능"의 **'거의'**.
//   era.js §METEORIC: 실제 운철은 Fe-Ni 자연합금이라 **제련이 필요 없다**. 이미 금속이다.
//   투탕카멘 단검이 운철이고 청동기 이전 유물도 있다. 어려운 이유는 니켈이 아니라
//   **하늘에서 떨어진 것이라 광맥이 없다** — 탐사로 찾는 경로 자체가 없다는 것.
//   ⇒ 광맥 층(t.ores)에 넣지 않는다. 지표에 흩어진 **발견물**이라 청크 자원으로 깐다.
//     자잘 광맥과 같은 성격(플레이어 전용 발견 요소 — NPC 는 자원 청크를 안 본다).
//   밀도: 한반도 8,763 청크 × 0.006 ≈ 53회 시도, 물·바위에서 기각되고 남는 게 수십 개.
//   ("대륙에 수십 개" — 지도를 뒤져야 하나 나오는 급. 광맥처럼 캐고 또 캐는 물건이 아니다.)
const METEORITE_PER_CHUNK = 0.006;

// Phase 14.1+14.3+14.46-a: biome별 자원 강한 편재.
// biome 종류: plains, mountain, forest, taiga, tundra, desert, jungle, savanna, archipelago, ocean
function pickResourceType(biome, r) {
  if (biome === 'plains') {
    if (r < 0.50) return 'berry_bush';
    if (r < 0.75) return 'herb';
    if (r < 0.95) return 'tree';
    if (r < 0.99) return 'rock';
    return 'water_pool';
  }
  if (biome === 'mountain' || biome === 'mountains') {
    if (r < 0.55) return 'rock';
    if (r < 0.75) return 'ore';
    if (r < 0.85) return 'tree';
    if (r < 0.93) return 'herb';
    if (r < 0.98) return 'berry_bush';
    return 'water_pool';
  }
  if (biome === 'forest') {
    if (r < 0.70) return 'tree';
    if (r < 0.85) return 'berry_bush';
    if (r < 0.93) return 'herb';
    if (r < 0.98) return 'rock';
    return 'water_pool';
  }
  if (biome === 'taiga') {
    // 침엽수림: tree 압도, 약간 ore + rock
    if (r < 0.78) return 'tree';
    if (r < 0.90) return 'rock';
    if (r < 0.96) return 'ore';
    return 'water_pool';
  }
  if (biome === 'tundra') {
    // 동토: 자원 희박
    if (r < 0.40) return 'rock';
    if (r < 0.55) return 'ore';
    if (r < 0.70) return 'tree';
    if (r < 0.85) return 'herb';
    return 'water_pool';
  }
  if (biome === 'desert') {
    // 사막: rock·ore 중심, 식물 희박
    if (r < 0.55) return 'rock';
    if (r < 0.78) return 'ore';
    if (r < 0.88) return 'herb';
    if (r < 0.94) return 'berry_bush';
    return 'water_pool';
  }
  if (biome === 'jungle') {
    // 정글: tree 매우 많고 herb·berry 풍부
    if (r < 0.55) return 'tree';
    if (r < 0.75) return 'herb';
    if (r < 0.90) return 'berry_bush';
    if (r < 0.96) return 'rock';
    return 'water_pool';
  }
  if (biome === 'savanna') {
    // 초원/사바나: 풀+드문 나무
    if (r < 0.45) return 'berry_bush';
    if (r < 0.70) return 'herb';
    if (r < 0.88) return 'tree';
    if (r < 0.96) return 'rock';
    return 'water_pool';
  }
  if (biome === 'archipelago') {
    // 군도: 식물 중심, 약간 광물, 물 많음
    if (r < 0.40) return 'tree';
    if (r < 0.65) return 'berry_bush';
    if (r < 0.80) return 'herb';
    if (r < 0.92) return 'rock';
    return 'water_pool';
  }
  if (biome === 'ocean') {
    // 해양 — 자원 거의 없음. 14.46-b에서 물고기 추가 예정.
    return 'water_pool';
  }
  // fallback (모를 때): forest 기본
  if (r < 0.70) return 'tree';
  if (r < 0.85) return 'berry_bush';
  if (r < 0.93) return 'herb';
  if (r < 0.98) return 'rock';
  return 'water_pool';
}

// ★★[T135] 숲 그리드의 **밀도 정본** — 아래 그리드가 쓰던 세 수를 함수 하나로 올렸다(행동 무변).
//   ⚠올린 이유: 마을의 **연간 열매 예산**(`server/trees.js` ← `villages.js` 주입)이 "그 숲에 나무가
//     몇 그루인가"를 알아야 하는데, 그걸 저쪽에서 다시 적으면 그게 사본이다. 숫자는 여기 하나뿐이다.
const FOREST_SPACING_BASE = 120;   // 나무 간격(px) 기준 — 작게=빽빽(부하↑) · 크게=듬성. 밀도 손잡이
const FOREST_SP_MIN = 60, FOREST_SP_MAX = 96;
const FOREST_MIN_COV = 1.5;        // 이 아래 커버리지엔 숲 그리드를 안 깐다
const FOREST_GAP = 0.9;            // 10% 빈자리(자연스러움) — 그리드의 `j2 > 0.9` 그대로
function forestSpacing(fCov) { return Math.max(FOREST_SP_MIN, Math.min(FOREST_SP_MAX, Math.round(FOREST_SPACING_BASE / Math.sqrt(fCov)))); }

// ══ ★★★[T359 2026-09-23 · 재민 결정 #58 ⓐ′] **군락도 지형이 낳는다** ═══════════════════
//
// ★왜 — T347: 채집 문법은 섰는데 세계가 비어 있다(군락 마을당 약 5개 · 걷는 몫의 2%만 댄다).
//   T357: 필요 개체 **10,059**(지금 221의 45.5배)이고 도보 15초 링의 기하 상한은 2,037 ⇒ 링으로는 못 놓는다.
//   ⇒ 재민 #58 **ⓐ′**: 링 군락(`plan-village-forage.js` · 플레이어 첫 15초용)은 **그대로 두고**,
//     NPC 경제의 밑변은 **나무처럼 지형에서** 온다. 그래서 이 갈래는 숲 그리드와 **같은 꼴**이다.
//
// ★간격은 **유도값**이다(지어낸 수 0 · 유도는 `scripts/t359-grove-density.js` · 보고 §1):
//     간격 = 셀변 ÷ √(셀당 밀도) · 셀당 밀도 = (T357 필요 K) ÷ (생활권의 쓸 수 있는 셀 수)
//     생활권 = 채집 반경 30셀(960px = 걸음 64px/s × `forage.CFG.WALK_SEC` 15초 — T347 이 쓰는 그 자)
//   방법은 카드 ①의 그것 — 마을마다 `K ÷ 셀` 을 내고 **셀당 밀도의 중앙값 하나**를 간격으로 바꾼다.
//   실측(51마을 중 T357 이 잰 45곳 · `scripts/t359-grove-density.js`):
//     · 숲 마을 10곳, 숲 셀 분모   ⇒ 밀도 중앙 **0.309525** ⇒ 32/√0.309525 = 57.5 ⇒ **덤불 58px**
//       (나무 하한 60px 바로 아래 = 숲 바닥이 나무만큼 촘촘해진다)
//     · 초지·물가 35곳, 그 셀 분모 ⇒ 밀도 중앙 **0.088724** ⇒ 32/√0.088724 = 107.4 ⇒ **풀 107px**
//       (나무 상한 96px 보다 듬성)
//   ⚠이 둘이 이 카드가 세운 **유일한 수**이고, 둘 다 위 식의 출력이다(`FOREST_SPACING_BASE` 와 같은 지위).
//     하네스 ⓐ 가 T357 앵커로 그 유도를 다시 계산해 이 상수와 맞대 본다(사본 0).
//
// ★어느 지형이 어느 군락을 내나 — **이미 있는 술어 하나로 가른다**(새 문턱 0):
//     `getForestMultiplier > FOREST_MIN_COV` (= 숲 그리드가 깔리는 그 문턱) → **덤불**(`berry_bush`)
//     그 아래(초지·물가)                                                  → **풀**(`herb`)
//   ⚠"숲 **가장자리**" 를 따로 가르려면 둘째 문턱이 필요하고 그건 새 수라 **안 지었다**(회부).
//
// ★새 종 0 · 새 스프라이트 0 · 새 전리품 표 0 — `berry_bush`·`herb` 는 링 군락이 이미 쓰는 종이고
//   `RESOURCE_HP_TABLE`·`lootOfResource`·`REGROW`(덤불 1년 · 풀 반년)가 다 갖고 있다.
//
// ★되돌림 — 기본 끔. 끄면 이 블록이 **한 번도 안 돌아** 청크 산출이 비트 동일이다(청크 해시 자).
const GROVE = {
  ON: () => (process.env.T359_GROVE_TERRAIN === '1'),   // ★기본 끔 · 부를 때 읽는다(`REGROW.ON` 규약)
  SP_BUSH: 58,    // ★유도값 — 위 머리말 · 숲 셀 분모 중앙
  SP_HERB: 107,   // ★유도값 — 위 머리말 · 초지·물가 셀 분모 중앙
  GAP: FOREST_GAP,          // 빈자리 비율 — 숲 그리드의 그 수 그대로(사본 0)
  SEED_POS: 95000,          // 씨 오프셋 — 숲(90000)·크기(91000000)와 겹치지 않는 자리
};
/**
 * 32px 셀 하나에 서는 나무 수. 인자가 없으면 **가장 성긴 숲**(SP 상한)으로 — 아래로 잡는다.
 * 새 수 0: 간격·빈자리 둘 다 위 그리드가 이미 쓰던 값이다.
 */
function forestTreesPerCell(fCov, cellPx) {
  const SP = forestSpacing(Number.isFinite(fCov) ? fCov : FOREST_MIN_COV + 1e-9);
  const c = Number.isFinite(cellPx) ? cellPx : 32;
  return FOREST_GAP * (c * c) / (SP * SP);
}

/**
 * ★★[T135 3판] 숲 셀 하나의 **평균** 나무 수 — 간격 상한만 쓰지 않는다.
 *   `forestSpacing` 은 커버리지에 따라 SP 를 [60, 96] 사이에서 고른다. 1·2판은 그중 **상한**(가장 성긴 숲)
 *   하나만 썼고, 그래서 숲 마을 유도가 실물의 64% 였다(보고 3판 §0ⓐ).
 *   ⇒ SP 가 그 구간 안에서 고르다고 보면 밀도의 평균은 **정확히 1/(하한×상한)** 이다:
 *        ⟨GAP·c²/SP²⟩ = GAP·c² · (1/(SP_MAX−SP_MIN))∫ SP⁻² dSP = GAP·c² / (SP_MIN·SP_MAX)
 *   새 수 0 — 하한·상한·빈자리 셋 다 위 그리드가 이미 쓰던 값이다. 실측 대조는 보고 §0ⓐ(102.9%).
 *   ⚠**커버리지를 마을에서 유도하지는 못한다** — `forShare`(면적 몫)와 실제 `fCov`(배율)의 상관은 0.44 다
 *     (forShare 1.000 인 마을의 meanFcov 가 2.6~3.2 로 갈리고, forShare 0.331 인 마을이 3.20 이다).
 *     지형을 다시 훑지 않고 마을별로 맞히는 길은 없다 — 그건 `trees.js` 가 안 하는 일이다(econ 무접촉).
 */
function forestTreesPerCellMean(cellPx) {
  const c = Number.isFinite(cellPx) ? cellPx : 32;
  return FOREST_GAP * (c * c) / (FOREST_SP_MIN * FOREST_SP_MAX);
}

// ★★[T135 2판] **나무는 두 곳에서 난다.** 위 숲 그리드 말고, 아래 **일반 자원 루프**도 나무를 세운다 —
//   그리고 그건 **숲 밖에도** 선다(`pickResourceType` 이 biome 마다 `tree` 몫을 갖는다).
//   `FLOOR.wood`("숲이 없어도 땔감은 좀 난다")의 실체가 바로 이 흩어진 나무들이다.
//   ⚠1판의 예산 유도가 이걸 0 으로 적었다 — 실측: 마을 스캔 원 안 나무의 **58.8%** 가 이쪽이다.
/**
 * 이 biome 에서 일반 루프가 `tree` 를 고를 확률. **표를 옮겨 적지 않는다** —
 * `pickResourceType` 을 촘촘히 불러 그 표 자신에게 물어본다(정본이 하나여야 한다).
 */
function treeShareOf(biome, samples) {
  const N = Number.isFinite(samples) ? samples : 10000;
  let n = 0;
  for (let i = 0; i < N; i++) if (pickResourceType(biome, (i + 0.5) / N) === 'tree') n++;
  return n / N;
}
/** 일반 루프가 32px 셀 하나에 세우는 나무 수 — 청크당 자원 수 × `tree` 몫 ÷ 청크 셀 수. 새 수 0. */
function scatterTreesPerCell(biome, cellPx, chunkPx) {
  const c = Number.isFinite(cellPx) ? cellPx : 32;
  const cp = Number.isFinite(chunkPx) ? chunkPx : CHUNK_SIZE;
  const cellsPerChunk = (cp / c) * (cp / c);
  return RESOURCES_PER_CHUNK * treeShareOf(biome) / cellsPerChunk;
}

// ★★[T163 2026-09-10] **바위도 같은 자리에서 난다** — 나무와 완전히 같은 문법(사본 0 · 새 수 0).
//   ⚠그런데 부호가 반대다. 나무는 숲 그리드가 따로 있어 바닥 마을에도 흩어진 나무가 **183그루** 섰는데,
//     바위는 그리드가 없고 **산 그 자체가 그리드**다. 그리고 산(바위 셀)은 아래 생성 루프가
//     `isRockCellLocal` 로 **spawn 을 막는 자리**라, 산이 많을수록 흩어진 바위는 되레 준다.
//   ⇒ T163 §0-ⓑ 실측: 스캔 원(61,575셀) 안 실물 바위가 바닥 36곳 중앙 **16** · 그 밖 15곳 중앙 **14**.
//     `land.stone` 은 0.25~2.50 로 10배 갈리는데 실물 바위 수는 안 갈린다.
//   이 둘은 **랩(`lab/전쟁실험실.html` `L_STONEREAL`)이 관 굵기를 유도할 때** 읽는다 — 서버는 안 부른다.
/** 이 biome 에서 일반 루프가 `rock` 을 고를 확률. 표를 옮겨 적지 않는다 — `pickResourceType` 이 답한다. */
function rockShareOf(biome, samples) {
  const N = Number.isFinite(samples) ? samples : 10000;
  let n = 0;
  for (let i = 0; i < N; i++) if (pickResourceType(biome, (i + 0.5) / N) === 'rock') n++;
  return n / N;
}
/** 일반 루프가 32px 셀 하나에 놓는 바위 수 — 청크당 자원 수 × `rock` 몫 ÷ 청크 셀 수. 새 수 0. */
function scatterRocksPerCell(biome, cellPx, chunkPx) {
  const c = Number.isFinite(cellPx) ? cellPx : 32;
  const cp = Number.isFinite(chunkPx) ? chunkPx : CHUNK_SIZE;
  const cellsPerChunk = (cp / c) * (cp / c);
  return RESOURCES_PER_CHUNK * rockShareOf(biome) / cellsPerChunk;
}

// 청크 안 자원 시드 생성. harvestedSet에 있는 건 제외.
// 청크당 자원 N개 (기본 5개) — 청크 면적 256² = 65536. zone 4096이면 16×16=256 청크. 총 자원 1280.
// Phase 5-1: terrain (forest·mountain·ore·water) 반영.
const RESOURCES_PER_CHUNK = 5;
const terrain = require('./terrain');
/**
 * @param harvestedSet  `Set<key>`(옛 계약) 또는 `Map<key, 벤 게임일>`(T122). Map 이면 재생이 산다.
 * @param gameDay       지금 게임일. 없으면 재생 판정을 안 한다(= 종전 그대로 빠진다).
 */
// ★★[T301 2026-09-19] **관측자 무관 자원 색인의 뿌리.**
//   이 함수가 자원을 놓는 **유일한 자리**다. 그래서 "청크 없이 셀을 물으면 무엇이 있나"도
//   여기서 답해야 한다 — 다른 데 한 벌을 더 적으면 그게 사본이고, 두 세계가 갈린다(T251 의 교훈).
//   ⇒ 인자 하나(`onlyCell`)만 받는다. `null`(기본)이면 **종전과 한 바이트도 다르지 않다**:
//     거르개는 `result.push` 앞에서만 걸리고, 값을 만드는 줄은 하나도 안 바뀐다.
//     `{ cx, cy }`(셀 좌표 · 32px)면 **그 셀에 떨어지는 개체만** 낸다 — 같은 시드·같은 셀 = 같은 답.
//   ⚠`onlyCell` 은 **빠른 길**도 연다(숲 그리드의 `gi` 를 산술로 건너뛴다 — 아래 T301 주석).
//     그 산술이 틀리면 색인이 청크와 갈리므로, `scripts/test-resource-index.js` ⓐ 가
//     **활성 청크 100개를 전수로** 맞대 본다(바이트 대조).
function generateChunkResources(zoneId, biome, cx, cy, chunkSize, harvestedSet, gameDay, onlyCell) {
  // ★[T301] 거르개 — 개체 하나가 그 **구간** 안에 떨어지나.
  // ★[T317] 구간은 두 꼴을 받는다: `{cx,cy}`(셀 · 32px · T301 문법 그대로) · `{x0,y0,x1,y1}`(픽셀 상자).
  //   상자 꼴은 `overflowInto` 가 **청크 하나**를 통째로 묻는 데 쓴다 — 셀로 1,024번 묻는 것보다 싸고,
  //   같은 코드라 답이 갈릴 수 없다(사본 0).
  //   ⚠**반열린 구간 `[x0, x1)` 이다.** 좌표는 소수라(격자 지터) 닫힌 구간으로 두면 `x = 1023.5` 처럼
  //     `floor(x/cs)` 로는 이 청크인데 상자에서 빠지는 개체가 생긴다 — 하네스 ⓕ 가 21 중 1 을 그렇게 놓쳤다.
  const _OC = onlyCell
    ? (onlyCell.x0 !== undefined
        ? onlyCell
        : { x0: onlyCell.cx * 32, y0: onlyCell.cy * 32, x1: onlyCell.cx * 32 + 32, y1: onlyCell.cy * 32 + 32 })
    : null;
  const _inCell = _OC ? ((x, y) => x >= _OC.x0 && x < _OC.x1 && y >= _OC.y0 && y < _OC.y1) : null;
  // ★[T122] 벤 날 조회 — `Set` 이 오면 `get` 이 없다(옛 호출부·구 하네스 계약을 그대로 살린다).
  const _cutDay = (k) => (harvestedSet && typeof harvestedSet.get === 'function') ? harvestedSet.get(k) : undefined;
  const _stage = (k, type, sp) => {
    if (!Number.isFinite(gameDay)) return null;
    const cd = _cutDay(k);
    if (!Number.isFinite(cd)) return null;
    return regrowStageOf(type, gameDay - cd, sp);
  };
  // ★[T135] 그 자리의 **종** — 자리 × 존의 함수(주사위 0 · 멱등).
  //   ⚠`seedKey` 가 아니라 **좌표**로 묻는다: 키는 그리드 인덱스라 간격이 바뀌면 같은 나무의 종이
  //     바뀐다. 자리로 물으면 지도가 그대로인 한 종도 그대로다(작물 야생채종과 같은 계약).
  const _spAt = (x, y) => { const T = _trees(); return (T && T.ON()) ? T.speciesAt(zoneId, Math.floor(x / 32), Math.floor(y / 32)) : null; };
  const result = [];
  // 청크당 자원 수 — forest/mountain 영역이면 ↑ (대표 점 sample)
  const sampleX = cx * chunkSize + chunkSize / 2;
  const sampleY = cy * chunkSize + chunkSize / 2;
  const forestMult = terrain.getForestMultiplier(zoneId, sampleX, sampleY);
  const stoneMult = terrain.getStoneMultiplier(zoneId, sampleX, sampleY);
  const oreCluster = terrain.isOreClusterAt(zoneId, sampleX, sampleY);
  // 일반 자원 수 = base × max(mountain, 1). 숲 밀도는 아래 전용 나무 그리드가 담당.
  const baseCount = Math.round(RESOURCES_PER_CHUNK * Math.max(stoneMult, 1.0));
  const count = oreCluster ? baseCount + 3 : baseCount;  // ore cluster: 광물 노드 추가
  for (let n = 0; n < count; n++) {
    const seedKey = `${cx}_${cy}_${n}`;
    const _cut = !!(harvestedSet && harvestedSet.has(seedKey));
    const r1 = seedRand(zoneId, cx, cy, n * 3);
    const r2 = seedRand(zoneId, cx, cy, n * 3 + 1);
    const r3 = seedRand(zoneId, cx, cy, n * 3 + 2);
    const x = cx * chunkSize + 16 + r1 * (chunkSize - 32);
    const y = cy * chunkSize + 16 + r2 * (chunkSize - 32);
    if (_inCell && !_inCell(x, y)) continue;   // ★[T301 빠른 길] 셀 밖이면 지형 질의도 안 한다(결과 동일)
    // water/rock cell에는 spawn 차단 (Phase 5-H: 산맥 바위)
    if (terrain.isWaterCellLocal(zoneId, x, y)) continue;
    if (typeof terrain.isRockCellLocal === 'function' && terrain.isRockCellLocal(zoneId, x, y)) continue;
    // 자원 type — terrain 영향:
    //   ore cluster 안 → stone/iron 우세
    //   mountain 영역 → stone 우세
    //   (숲 나무는 아래 전용 그리드에서 빽빽하게 깔림 — 여기선 일반 biome 배경만)
    let type;
    if (oreCluster && r3 < 0.7) {
      type = 'ore';   // ore cluster: 70% 광물 (이전 'stone'은 loot 핸들러가 없어 산출 0이던 버그)
    } else if (stoneMult > 1.5 && r3 < 0.5) {
      type = 'rock';  // mountain: 50% 바위(돌 산출) (이전 'stone' 깡통 버그 수정)
    } else {
      type = pickResourceType(biome, r3);
    }
    // ★★[T122] 벤 자리는 **빠지는** 대신 **단계**로 난다. 종류는 이미 정해졌으므로(위 결정론)
    //   "무엇이 다시 나는가"가 흔들리지 않는다 — 벤 나무 자리엔 나무가 난다.
    let stage = null;
    if (_cut) {
      stage = _stage(seedKey, type, type === 'tree' ? _spAt(x, y) : null);
      if (stage === null || stage === 'gone') continue;     // 종전 그대로 빠진다
    }
    let outType = type, maxHp = RESOURCE_HP_TABLE[type] || 3;
    if (stage === 'stump') { outType = 'stump'; maxHp = 0; }        // 그림만 — 캘 수 없다
    else if (stage === 'sapling') { outType = 'sapling'; maxHp = RESOURCE_HP_TABLE.sapling; }
    const entity = {
      id: `s_${cx}_${cy}_${n}`,
      seedKey, isSeed: true,
      x, y, type: outType, hp: maxHp, maxHp,
    };
    if (stage) entity.regrown = stage;                             // 화면·하네스가 단계를 물을 수 있게
    // Phase 5-8: tree는 입체 — radius + height (콜라이더 + 시야 차단 + 시각)
    if (type === 'tree') {
      // sub-pixel 지름 8~30px (반경 4~15px, 단 1 cell=32px 미만)
      entity.r = 4 + (r3 * 16);  // 반경 4~20 (forest 그리드와 동일 범위)
      // 높이 — 크기에 비례
      entity.h = 46 + (r3 * 120);  // 46~166
      // ★[T122] 어린 것은 **작다** — 같은 자리·같은 씨앗의 나무가 그대로 줄어든 것이다(새 수 0).
      if (outType === 'stump') { entity.r *= 0.9; entity.h = 10; }
      else if (outType === 'sapling') { entity.r *= 0.45; entity.h *= 0.30; }
      // ★[T135] 종을 **개체에 찍는다** — 그림(T129 sap_<종>)·동사(열매 따기)·부등식이 같은 값을 본다.
      //   그루터기는 종을 안 묻는다(T129: "벤 자리는 종을 안 묻는다" — 그림이 하나뿐이다).
      const _s1 = _spAt(x, y);
      if (_s1 && outType !== 'stump') entity.sp = _s1;
      if (_s1 && outType === 'tree') entity.szf = +r3.toFixed(3);   // 크기 0..1 — 숲 그리드와 같은 이름
    }
    if (_inCell && !_inCell(entity.x, entity.y)) continue;   // ★[T301] 셀 질의 — 그 셀 밖은 안 낸다
    result.push(entity);
  }

  // === ★운철 낙하지 — 청크당 결정론 해시 1회(자잘 광맥 생성과 같은 규약) ===
  //   좌표가 시드로 정해지므로 재부팅해도 같은 자리다. 채집하면 harvestedSeeds 에 박혀 사라진다.
  {
    const rm = seedRand(zoneId, cx, cy, 90001);
    if (rm < METEORITE_PER_CHUNK) {
      const mx = cx * chunkSize + 16 + seedRand(zoneId, cx, cy, 90002) * (chunkSize - 32);
      const my = cy * chunkSize + 16 + seedRand(zoneId, cx, cy, 90003) * (chunkSize - 32);
      const seedKey = `${cx}_${cy}_met`;
      const wet = terrain.isWaterCellLocal(zoneId, mx, my);
      const rock = typeof terrain.isRockCellLocal === 'function' && terrain.isRockCellLocal(zoneId, mx, my);
      // ★[T122] 운철은 **재생하지 않는다**(`regrowStageOf` 가 null 을 낸다) — 종전 그대로 빠진다.
      if (!wet && !rock && !(harvestedSet && harvestedSet.has(seedKey))
          && !(_inCell && !_inCell(mx, my))) {                 // ★[T301] 셀 질의
        result.push({ id: `s_${cx}_${cy}_met`, seedKey, isSeed: true, x: mx, y: my,
                      type: 'meteorite', hp: RESOURCE_HP_TABLE.meteorite, maxHp: RESOURCE_HP_TABLE.meteorite });
      }
    }
  }

  // === ★★채집 군락(groves) — 마을 어귀에 심은 덤불·바위·둠벙 [재민 확정 2026-08-29] ===
  //   ★왜: 51마을 전수 감사(`scripts/audit-village-forage.js`)가 **도보 15초 안에 시작 재료가 없는
  //     마을 25곳**을 잡았다. 재민 판정 — 이건 의도된 마찰이 아니라 **배산임수 캐논 위반**이다
  //     (마을은 원래 물가와 숲 옆에 선다 · `설계_마을_배산임수_레이아웃.md`).
  //   ★처방은 **낙하물 스캐터가 아니다**(그건 기각됐다). 이미 있는 개체 종류 셋 — 덤불·바위·웅덩이 —
  //     을 **마을 어귀 바깥 링**에 군락으로 심는다. 새 개체도, 새 스프라이트도, 새 지형장도 없다.
  //   ★자리는 손으로 안 찍는다 — `scripts/plan-village-forage.js` 가 계산해 `groves` 에 적는다
  //     (plan-* 계보 · 데이터 손편집 금지). 여기는 **그 데이터를 개체로 실체화**할 뿐이다.
  //   ★결정론: 좌표는 군락 번호와 점 번호로만 정해진다(재부팅해도 같은 자리) ·
  //     `seedKey` 를 주므로 캐면 사라지고 다시 안 난다(자잘 광맥·운철과 같은 규약).
  //   ★군락 모양: 극좌표 `r·√u` — 중심이 촘촘하고 가장자리가 성기다(**균일 간격 금지** 캐논).
  {
    const t = terrain.ZONE_TERRAIN ? terrain.ZONE_TERRAIN[zoneId] : null;
    const groves = (t && t.groves) || [];
    const cs = chunkSize;
    const x0 = cx * cs, y0 = cy * cs;
    for (let gi = 0; gi < groves.length; gi++) {
      const g = groves[gi];
      if (!g || !g.center) continue;
      const gr = g.r || 140;
      if (g.center[0] + gr < x0 || g.center[0] - gr > x0 + cs) continue;
      if (g.center[1] + gr < y0 || g.center[1] - gr > y0 + cs) continue;
      const gn = Math.max(1, Math.round(g.n || 3));
      for (let i = 0; i < gn; i++) {
        const u = seedRand(zoneId, 700000 + gi, i, 1);
        const a = seedRand(zoneId, 700000 + gi, i, 2) * Math.PI * 2;
        const rr = gr * Math.sqrt(u);
        const x = g.center[0] + Math.cos(a) * rr;
        const y = g.center[1] + Math.sin(a) * rr;
        if (Math.floor(x / cs) !== cx || Math.floor(y / cs) !== cy) continue;   // 제 청크에서만 낳는다(중복 금지)
        if (_inCell && !_inCell(x, y)) continue;   // ★[T301 빠른 길]
        if (terrain.isWaterCellLocal(zoneId, x, y)) continue;
        if (typeof terrain.isRockCellLocal === 'function' && terrain.isRockCellLocal(zoneId, x, y)) continue;
        const seedKey = `gv${gi}_${i}`;
        const type = g.kind || 'berry_bush';
        // ★[T122] 군락도 같은 문법 — 덤불은 이듬해 다시 열리고, 바위는 종전대로 안 난다.
        if (harvestedSet && harvestedSet.has(seedKey)) {
          const st = _stage(seedKey, type, null);
          if (st !== 'mature') continue;
        }
        if (_inCell && !_inCell(x, y)) continue;              // ★[T301] 셀 질의
        const maxHp = RESOURCE_HP_TABLE[type] || 3;
        result.push({ id: `s_${seedKey}`, seedKey, isSeed: true, x, y, type, hp: maxHp, maxHp });
      }
    }
  }

  // === 숲 나무 — 빽빽한 지터드 그리드 (그린 타원 안에만 쫙 깔림) ===
  // 청크가 숲에 걸치는지 + 밀도 — 중심/4모서리 중 max (경계 청크도 빽빽하게)
  const qd = chunkSize * 0.3;
  const fCov = Math.max(
    forestMult,
    terrain.getForestMultiplier(zoneId, sampleX - qd, sampleY - qd),
    terrain.getForestMultiplier(zoneId, sampleX + qd, sampleY - qd),
    terrain.getForestMultiplier(zoneId, sampleX - qd, sampleY + qd),
    terrain.getForestMultiplier(zoneId, sampleX + qd, sampleY + qd)
  );
  if (fCov > FOREST_MIN_COV) {
    // 나무 간격(px)은 `forestSpacing` 이 정한다(정본 하나 — 아래 참조).
    //   작게=더 빽빽(부하↑), 크게=듬성. 92 → 큰숲 ~51px·청크당 ~340그루.
    const SP = forestSpacing(fCov);
    const cs = chunkSize;
    // ★★[T301 빠른 길] 셀 질의면 **닿을 수 있는 격자점만** 본다.
    //   격자점 `gx` 가 내는 x 는 `cx*cs + gx + j1*SP`(j1 ∈ [0,1)) 이므로 구간 `[gx, gx+SP)` 다.
    //   목표 셀의 지역 구간 `[_oxLo, _oxHi]` 과 안 겹치면 그 격자점은 **절대** 그 셀에 못 떨어진다.
    //   `gi` 는 전 격자의 순번이므로 건너뛸 때 **행 폭(_cols)만큼 더해** 순번을 정확히 맞춘다
    //   (틀리면 씨가 어긋나 색인이 청크와 갈린다 — `test-resource-index ⓐ` 가 전수로 잡는다).
    const _cols = Math.ceil(cs / SP);
    const _oxLo = _OC ? (_OC.x0 - cx * cs) : 0, _oxHi = _OC ? (_OC.x1 - 1 - cx * cs) : 0;
    const _oyLo = _OC ? (_OC.y0 - cy * cs) : 0, _oyHi = _OC ? (_OC.y1 - 1 - cy * cs) : 0;
    let gi = 0;
    for (let gy = 0; gy < cs; gy += SP) {
      if (_OC && (gy > _oyHi || gy + SP <= _oyLo)) { gi += _cols; continue; }
      for (let gx = 0; gx < cs; gx += SP, gi++) {
        if (_OC && (gx > _oxHi || gx + SP <= _oxLo)) continue;
        const j1 = seedRand(zoneId, cx, cy, 90000 + gi * 2);
        const j2 = seedRand(zoneId, cx, cy, 90000 + gi * 2 + 1);
        if (j2 > 0.9) continue;                 // 10% 빈자리 — 자연스러움
        const x = cx * cs + gx + j1 * SP;
        const y = cy * cs + gy + j2 * SP;
        // 그린 타원 안에서만 (존 경계·청크 무관, 모양 그대로)
        if (terrain.getForestMultiplier(zoneId, x, y) <= 1.5) continue;
        if (terrain.isWaterCellLocal(zoneId, x, y)) continue;
        if (typeof terrain.isRockCellLocal === 'function' && terrain.isRockCellLocal(zoneId, x, y)) continue;
        const seedKey = `${cx}_${cy}_ft${gx}_${gy}`;
        const fsp = _spAt(x, y);                        // ★[T135] 이 자리의 종(주사위 0)
        // ★★[T122] **여기가 숲의 본체다**(청크당 ~340그루 · NPC 벌목꾼이 실제로 베는 자리).
        //   위 일반 자원 갈래와 **같은 판정 함수**를 쓴다(사본 0).
        let fstage = null;
        if (harvestedSet && harvestedSet.has(seedKey)) {
          fstage = _stage(seedKey, 'tree', fsp);
          if (fstage === null || fstage === 'gone') continue;
        }
        const sz = seedRand(zoneId, cx, cy, 91000000 + gi);  // 크기(0~1) — 위치와 독립
        let ftype = 'tree', fhp = 3, fr = 4 + sz * 16, fh = 46 + sz * 120;
        if (fstage === 'stump') { ftype = 'stump'; fhp = 0; fr *= 0.9; fh = 10; }
        else if (fstage === 'sapling') { ftype = 'sapling'; fhp = RESOURCE_HP_TABLE.sapling; fr *= 0.45; fh *= 0.30; }
        const fe = {
          id: `s_${seedKey}`, seedKey, isSeed: true,
          x, y, type: ftype, hp: fhp, maxHp: fhp,
          r: fr,            // 반경 4~20 (제각각)
          h: fh,            // 키도 크기에 비례 (46~166)
        };
        if (fstage) fe.regrown = fstage;
        if (fsp && ftype !== 'stump') fe.sp = fsp;      // ★[T135] 종 — 위 갈래와 같은 자리에 같은 이름
        if (fsp && ftype === 'tree') fe.szf = +sz.toFixed(3);   // 크기 0..1 — 열매 재고가 이걸 읽는다(사본 0)
        if (_inCell && !_inCell(fe.x, fe.y)) continue;          // ★[T301] 셀 질의
        result.push(fe);
      }
    }
  }

  // ══ ★★★[T359] 군락 그리드 — 숲 그리드와 **같은 꼴**(위 `GROVE` 머리말이 왜와 유도) ═══════
  //   ⚠끄면 이 블록이 한 번도 안 돈다 ⇒ 청크 산출 **비트 동일**(청크 해시 자가 전수로 잰다).
  //   ⚠링 군락(`groves`)은 **무접촉**이다 — 겹치면 여기서 **피한다**(링이 먼저 심은 자리가 정본).
  if (GROVE.ON()) {
    const cs = chunkSize;
    //   링 군락 중심들 — 이 청크에 걸치는 것만 미리 모은다(정본 데이터를 읽기만 한다).
    const _ringC = [];
    {
      const t0 = terrain.ZONE_TERRAIN ? terrain.ZONE_TERRAIN[zoneId] : null;
      for (const g of ((t0 && t0.groves) || [])) {
        if (!g || !g.center) continue;
        const gr = (g.r || 140) + 32;
        if (g.center[0] + gr < cx * cs || g.center[0] - gr > cx * cs + cs) continue;
        if (g.center[1] + gr < cy * cs || g.center[1] - gr > cy * cs + cs) continue;
        _ringC.push([g.center[0], g.center[1], gr]);
      }
    }
    const _inRing = (x, y) => { for (const r of _ringC) if ((x - r[0]) * (x - r[0]) + (y - r[1]) * (y - r[1]) < r[2] * r[2]) return true; return false; };
    //   두 그리드 — 종마다 간격이 다르므로(유도값) 격자를 따로 깐다. 씨는 종마다 다른 오프셋.
    const _grids = [
      { type: 'berry_bush', SP: GROVE.SP_BUSH, tag: 'gb', off: GROVE.SEED_POS, forest: true },
      { type: 'herb', SP: GROVE.SP_HERB, tag: 'gh', off: GROVE.SEED_POS + 500000, forest: false },
    ];
    for (const G of _grids) {
      const SP = G.SP;
      const _cols = Math.ceil(cs / SP);
      const _oxLo = _OC ? (_OC.x0 - cx * cs) : 0, _oxHi = _OC ? (_OC.x1 - 1 - cx * cs) : 0;
      const _oyLo = _OC ? (_OC.y0 - cy * cs) : 0, _oyHi = _OC ? (_OC.y1 - 1 - cy * cs) : 0;
      let gi = 0;
      for (let gy = 0; gy < cs; gy += SP) {
        if (_OC && (gy > _oyHi || gy + SP <= _oyLo)) { gi += _cols; continue; }
        for (let gx = 0; gx < cs; gx += SP, gi++) {
          if (_OC && (gx > _oxHi || gx + SP <= _oxLo)) continue;
          const j1 = seedRand(zoneId, cx, cy, G.off + gi * 2);
          const j2 = seedRand(zoneId, cx, cy, G.off + gi * 2 + 1);
          if (j2 > GROVE.GAP) continue;                          // 빈자리 — 숲 그리드의 그 비율
          const x = cx * cs + gx + j1 * SP;
          const y = cy * cs + gy + j2 * SP;
          //   ★지형이 종을 가른다 — 문턱은 숲 그리드의 그 문턱 하나다(새 수 0)
          const fm = terrain.getForestMultiplier(zoneId, x, y);
          if (G.forest ? !(fm > FOREST_MIN_COV) : (fm > FOREST_MIN_COV)) continue;
          if (terrain.isWaterCellLocal(zoneId, x, y)) continue;
          if (typeof terrain.isRockCellLocal === 'function' && terrain.isRockCellLocal(zoneId, x, y)) continue;
          if (_inRing(x, y)) continue;                            // ★링 군락 자리는 비켜 준다
          const seedKey = `${cx}_${cy}_${G.tag}${gx}_${gy}`;
          //   ★[T122] 같은 재생 회계 — 딴 자리는 주기가 지나야 다시 난다(사본 0 · `_stage` 그 함수)
          if (harvestedSet && harvestedSet.has(seedKey)) {
            const st2 = _stage(seedKey, G.type, null);
            if (st2 !== 'mature') continue;
          }
          const mh = RESOURCE_HP_TABLE[G.type] || 1;
          const ge = { id: `s_${seedKey}`, seedKey, isSeed: true, x, y, type: G.type, hp: mh, maxHp: mh };
          if (_inCell && !_inCell(ge.x, ge.y)) continue;           // ★[T301] 셀 질의
          result.push(ge);
        }
      }
    }
  }
  return result;
}

// ══ ★★[T301 2026-09-19] 관측자 무관 자원 색인 — `resourceAt` ═════════════════
//
// ★왜 [지시 T301 · `설계/설계_생산_실체.md` §2-ⓗ · T284 회부 ①]
//   존의 나무·바위·광맥은 **청크가 켜질 때** 생긴다. 그래서 관측자에 따라 있다 없다 하고,
//   전투가 그걸 읽으면 결정성이 깨진다(T284 ①). 관측자 없는 마을의 나무꾼·광부도
//   **실제 나무·광맥**에 가야 한다(새 캐논 "생산은 행위다"). 둘 다 같은 것을 요구한다 —
//   **청크 없이 셀을 물으면 그 자리에 무엇이 있는지 답하는 함수.**
//
// ★사본 0. 이 함수는 자원을 **하나도 안 놓는다** — 위 `generateChunkResources` 를
//   `onlyCell` 로 부를 뿐이다. 그래서 색인과 청크는 **같은 코드**이고, 갈릴 수가 없다.
//   (T251 이 가르쳐 준 것: 같은 것을 두 벌 적으면 언젠가 두 세계가 된다.)
//
// ★변경분은 **안 본다.** 베인 나무·캔 광맥 같은 변경분의 정본은 따로 있다:
//     · 살아 있는 개체 : `zone.js` 의 `qtResources`(활성 청크)
//     · 벤 자리·그루터기 : `harvestedSeeds`(그 존의 수확 장부) — 넘겨 주면 재생 단계까지 반영한다
//     · 플레이어가 심은 것 : DB 행
//   이 함수는 **"원래 무엇이었나"** 를 답한다. 부르는 쪽이 변경분을 덮어쓴다(보고 §0ⓐ 규칙 표).
//
// @param zoneId  존 id
// @param cellX   셀 x (32px 격자 — `isTerrainBlockedLocal` 등과 같은 좌표계)
// @param cellY   셀 y
// @param opts    { biome, chunkSize, harvestedSet, gameDay } — 전부 선택.
//                `harvestedSet` 을 주면 벤 자리·재생 단계가 청크와 **같은 답**으로 난다.
// @returns       그 셀의 개체 배열(생성 순서 그대로 · 없으면 빈 배열)
function resourcesAtCell(zoneId, cellX, cellY, opts) {
  const o = opts || {};
  const cs = o.chunkSize || CHUNK_SIZE;
  const biome = o.biome || _zoneBiome(zoneId);
  const px = (cellX | 0) * 32, py = (cellY | 0) * 32;
  const ccx = Math.floor(px / cs), ccy = Math.floor(py / cs);
  // ★★[T301 · 하네스가 잡은 것] 청크는 **자기 밖에도 낳는다.** 숲 그리드의 마지막 격자점이
  //   지터(`j1 * SP`)로 청크 경계를 넘는다 — 실측: 청크 (0,0) 이 `ft1020_0` 을 x=1032.5 에 낳는다
  //   (그 자리는 청크 (1,0) 의 셀 32 다). 그래서 목표 셀의 청크만 물으면 **그 나무를 놓친다**
  //   (`test-resource-index ⓐ` 가 숲 청크 100개에서 1,328셀을 잡았다 — 논증이 아니라 전수가 잡았다).
  //   ⇒ 넘어올 수 있는 이웃 청크까지 묻는다. 넘침의 상한은 격자 간격의 최댓값 `FOREST_SP_MAX` 다
  //     (값은 이 파일의 정본 상수 — 자가 새로 적는 수 0).
  const OV = FOREST_SP_MAX;
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const qx = ccx + dx, qy = ccy + dy;
      if (qx < 0 || qy < 0) continue;
      // 그 청크가 이 셀에 닿을 수 있나 — 청크 상자를 넘침만큼 부풀려 셀과 겹치는지 본다
      const bx0 = qx * cs, by0 = qy * cs;
      if (px + 31 < bx0 - OV || px > bx0 + cs - 1 + OV) continue;
      if (py + 31 < by0 - OV || py > by0 + cs - 1 + OV) continue;
      const got = generateChunkResources(zoneId, biome, qx, qy, cs, o.harvestedSet, o.gameDay,
        { cx: cellX | 0, cy: cellY | 0 });
      for (const e of got) out.push(e);
    }
  }
  return out;
}

// 한 칸에 여럿이 설 수 있다(숲 그리드는 간격이 셀보다 작을 수 있다). 하나만 묻는 쪽을 위한 얇은 껍데기 —
// **생성 순서의 첫 개체**를 돌려준다(결정적). 여럿이 필요하면 `resourcesAtCell` 을 써라.
function resourceAt(zoneId, cellX, cellY, opts) {
  const a = resourcesAtCell(zoneId, cellX, cellY, opts);
  return a.length ? a[0] : null;
}

// ══ ★★[T317 2026-09-19] 넘친 개체를 **세계의 것**으로 ═════════════════════════
//
// ★왜 [지시 T317 · T309 §0ⓐ]
//   청크는 자기 밖에도 낳는다 — 숲 그리드의 마지막 격자점이 지터(`j1 × SP`)로 경계를 넘는다.
//   실측(T309): 청크 400개 · 개체 12,461 중 **933개(7.49%)가 제 청크 밖**이고 **전부 나무**다.
//   그런데 이웃 청크는 그 나무를 **스스로 안 낳는다(162/162)** — 그래서 낳은 청크가 꺼지면 사라지고,
//   이웃만 켜져 있으면 처음부터 없다. **세계가 관측자에 따라 달라진다**(캐논 위반 · T284 ①).
//
// ★넘침은 **동·남·동남쪽으로만** 간다. 격자점 x 는 `cx*cs + gx + j1*SP`(gx ≥ 0 · j1 ≥ 0)라
//   **절대 `cx*cs` 보다 작아질 수 없다** — 서·북으로는 못 넘는다(T309 실측도 서 0 · 북 0).
//   ⇒ 청크 C 로 넘쳐 들어올 수 있는 이웃은 **서·북·서북 셋뿐**이다.
//
// ★사본 0 — 자원은 여전히 `generateChunkResources` 만 낳는다. 이 함수는 **거르기만** 한다.
function overflowInto(zoneId, biome, cx, cy, chunkSize, harvestedSet, gameDay) {
  const out = [];
  for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1]]) {
    const qx = cx + dx, qy = cy + dy;
    if (qx < 0 || qy < 0) continue;
    // ★[T317] 이웃을 통째로 낳지 않는다 — **이 청크 상자**만 묻는다(`onlyCell` 의 상자 꼴).
    //   숲 그리드의 격자점 창이 그만큼 좁아져 숲 청크에서 특히 싸다(보고 §부하).
    const box = { x0: cx * chunkSize, y0: cy * chunkSize, x1: (cx + 1) * chunkSize, y1: (cy + 1) * chunkSize };
    const list = generateChunkResources(zoneId, biome, qx, qy, chunkSize, harvestedSet, gameDay, box);
    for (let i = 0; i < list.length; i++) out.push(list[i]);
  }
  return out;
}

// ★[T317 ②] 그 개체를 **낳은 청크** — 제거 기준이다(`zone.js deactivateChunk`).
//   씨앗 키의 꼴은 이 파일이 정한다(`${cx}_${cy}_${n}` · `_met` · `_ft<gx>_<gy>` · 군락 `gv<gi>_<i>`).
//   그래서 **푸는 것도 이 파일이 한다** — 부르는 쪽이 문자열을 쪼개면 그게 사본이고, 꼴이 바뀌면 조용히 어긋난다.
//   ⚠군락(`gv…`)은 `chunk.js:554` 가드가 **제 청크에서만** 낳게 하므로 낳은 청크 = 든 청크다.
function seedGenChunkOf(seedKey, x, y, chunkSize) {
  const cs = chunkSize || CHUNK_SIZE;
  const fallback = { cx: Math.floor(x / cs), cy: Math.floor(y / cs) };
  if (typeof seedKey !== 'string' || seedKey.charCodeAt(0) === 103 /* 'g' — 군락 */) return fallback;
  const i = seedKey.indexOf('_'); if (i <= 0) return fallback;
  const j = seedKey.indexOf('_', i + 1); if (j <= i) return fallback;
  const a = +seedKey.slice(0, i), b = +seedKey.slice(i + 1, j);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback;
  return { cx: a, cy: b };
}

// ★★[T301 ②] 전쟁이 쓸 **나무 차단 술어** — `_warWorld.blocked/losBlocked/coverAt` 의 나무 몫.
//   전쟁은 셀로 묻는다(`villages.js` 어댑터 좌표 = 존 셀). 그래서 셀 하나에 "서 있는 나무"가 있나만 답한다.
//   ⚠**그루터기·묘목은 안 막는다** — 벤 자리는 지나갈 수 있다(`RESOURCE_HP_TABLE` 이 그렇게 갈라 둔다).
//   ⚠변경분 규칙(§0ⓐ)은 부르는 쪽 몫이다: 활성 청크가 있으면 `qtResources` 가 정본이고,
//     `harvestedSet` 을 넘기면 벤 자리·재생 단계까지 이 함수가 청크와 같은 답을 낸다.
//   ★값은 하나도 안 짓는다 — `resourcesAtCell` 이 낸 개체의 `type` 을 볼 뿐이다.
function treeBlockerAt(zoneId, cellX, cellY, opts) {
  const a = resourcesAtCell(zoneId, cellX, cellY, opts);
  for (let i = 0; i < a.length; i++) if (a[i].type === 'tree') return a[i];
  return null;
}

// 존의 biome — `zone-config` 정본에서 읽는다(값을 이 파일에 안 적는다).
let _ZC = null;
function _zoneBiome(zoneId) {
  if (!_ZC) { try { _ZC = require('./zone-config'); } catch (e) { _ZC = { ZONES: {} }; } }
  const z = (_ZC.ZONES || {})[zoneId];
  return (z && z.biome) || 'forest';
}

// === Phase 14.46-a: 마을 자동 생성 ===
// biome별 음절 표를 조합해서 마을 이름 + 위치를 zone당 N개 결정.
// 시드 기반이라 zone마다 같은 입력 → 같은 출력 (재시작해도 동일).

const VILLAGE_NAME_TABLES = {
  // 각 biome마다 "어울리는" 음절을 골라 마을 이름 생성 (2~3 음절)
  forest:      { syl1: ['그린','우드','릴','파인','오크','애쉬','글렌','벨','로지','케른'],     syl2: ['데일','우드','글로','홀로','부르크','보로','베일','셰어','크로프트',''] },
  taiga:       { syl1: ['스나','코트','이르','콜드','노보','한스','우슈','피요르','오스','코페'], syl2: ['스크','후스','뷔크','달','네스','보르그','쇠르','베르겐','블린','홀름'] },
  tundra:      { syl1: ['이글','얀','베르호','노렐','이르쿠','마가단','워르쿠','노릴','수르구','얌부'], syl2: ['스크','곤','버그','드','단','이','네츠','얀',''] },
  plains:      { syl1: ['그래스','월드','선','크라이','롤링','오크','휘트','메도우','매든','애머'],   syl2: ['랜드','필드','데일','뷰','크릭','로지','튼','보로','버그',''] },
  desert:      { syl1: ['오아','사르','두니','카이','타브','메르사','파르','오르','시르','자그'],   syl2: ['시스','로','만','라','즈','쿠','와','루','벤','시'] },
  jungle:      { syl1: ['마노','이파','우루','카주','시바','일라','쿠르','벤투','파라','만나'],     syl2: ['스','쿠','마','로','이','우스','우','네','라','시'] },
  savanna:     { syl1: ['크루','나로','음바','잘란','오트','다카','케리','루카','드라','사부'],     syl2: ['거','베','네','로','자','시','와','우','크',''] },
  archipelago: { syl1: ['발리','자카','부키','마닐','수마','셀레','보르네','루손','쿠팡','데보'],   syl2: ['타라','스타','노','반','뜨라','베스','우','이','파',''] },
  mountain:    { syl1: ['카토','노라','히마','마트','타카','지옹','이즈','후지','쿠라','네코'],     syl2: ['야마','사키','다','노','자','이','쿠','네','마','로'] },
  ocean:       { syl1: [], syl2: [] }, // 해양은 마을 없음
};

function makeVillageName(biome, rand) {
  const t = VILLAGE_NAME_TABLES[biome] || VILLAGE_NAME_TABLES.forest;
  if (!t.syl1.length) return null;
  const s1 = t.syl1[Math.floor(rand * t.syl1.length) % t.syl1.length];
  const r2 = (rand * 7919) % 1;
  const s2 = t.syl2[Math.floor(r2 * t.syl2.length) % t.syl2.length];
  return (s1 + s2).trim();
}

// 마을 좌표 — zone 안 골고루. 빙하 띠는 피함 (y < 800 또는 y > zoneHeight-800).
// margin 안 쪽으로 마을 spawn.
function generateVillagesForZone(zone) {
  const villages = [];
  if (zone.isOcean) return villages;
  if (!zone.villageCount || zone.villageCount <= 0) return villages;
  // Phase 5-C: terrain 활용 — 마을 type 결정 (riverside/mountain/plain)
  let terrain = null;
  try { terrain = require('./terrain'); } catch {}
  const seed = zone.villageSeed || 1;
  const margin = 600;
  const safeTop = 900;
  const safeBot = zone.zoneHeight - 900;
  const usedNames = new Set();
  // 마을 type 결정 helper — 좌표 주변 검사
  function decideVillageType(x, y) {
    if (!terrain) return 'plain';
    // 강·호수 200px 내 — riverside (어업·교역 핵심)
    const D = 220;
    if (terrain.isWaterCellLocal(zone.id, x - D, y) ||
        terrain.isWaterCellLocal(zone.id, x + D, y) ||
        terrain.isWaterCellLocal(zone.id, x, y - D) ||
        terrain.isWaterCellLocal(zone.id, x, y + D)) return 'riverside';
    // 산 — stoneMultiplier > 2.0 (광맥·채석)
    if (terrain.getStoneMultiplier(zone.id, x, y) > 2.0) return 'mountain';
    // 광맥 cluster 위 — mining 마을
    if (terrain.isMajorOreAt ? terrain.isMajorOreAt(zone.id, x, y) : terrain.isOreClusterAt(zone.id, x, y)) return 'mining';   // ★자잘 광맥으로는 광산 마을이 생기지 않는다(플레이어 전용)
    // 깊은 숲 — forest 마을 (사냥·임업)
    if (terrain.getForestMultiplier(zone.id, x, y) > 2.0) return 'forest';
    return 'plain';
  }
  // 마을 위치 시도 — 강 옆 선호 (50% 이상이 riverside 되도록 시도)
  for (let i = 0; i < zone.villageCount; i++) {
    let name = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const rn = seedRand(zone.displayName || 'z', seed + i, attempt, 0);
      const candidate = makeVillageName(zone.biome, rn);
      if (candidate && !usedNames.has(candidate)) { name = candidate; break; }
    }
    if (!name) name = `${zone.biome[0]}-${i}`;
    usedNames.add(name);
    // 후보 좌표 5번 시도 — 강 옆이거나 산 옆이면 즉시 채택. 아니면 마지막 후보.
    let bestX = 0, bestY = 0, bestType = 'plain';
    for (let attempt = 0; attempt < 5; attempt++) {
      const rx = seedRand(zone.displayName || 'z', seed + i, 1, attempt);
      const ry = seedRand(zone.displayName || 'z', seed + i, 2, attempt);
      const x = margin + rx * (zone.zoneWidth - margin * 2);
      let y = safeTop + ry * (safeBot - safeTop);
      if (y < safeTop) y = safeTop;
      if (y > safeBot) y = safeBot;
      const type = decideVillageType(x, y);
      // riverside·mining 발견 시 즉시 채택 (가장 가치 있음)
      if (type === 'riverside' || type === 'mining') {
        bestX = x; bestY = y; bestType = type; break;
      }
      // mountain·forest는 후보로 저장, plain은 마지막 옵션
      if (attempt === 0 || (bestType === 'plain' && type !== 'plain')) {
        bestX = x; bestY = y; bestType = type;
      }
    }
    villages.push({ name, x: bestX, y: bestY, type: bestType });
  }
  return villages;
}

// === Phase 14.46-b-mini: 해안선 (Coastline water tiles) ===
// 육지 zone의 가장자리 중 ocean 인접 부분에 물 타일 strip을 organic noise로 생성.
// ocean zone은 전체가 물 (별도 처리, 이 함수에선 빈 set 반환).
// Korea↔Japan 같은 직접 land 인접은 자동으로 land (그 변엔 ocean이 없으니 water tile 0).
// Phase 5-3: zone 100배 확장에 비례. ×10.
const COASTLINE_BASE = 6000;   // 기본 해안선 폭 (px) — 평균 깊이
const COASTLINE_NOISE = 5000;  // 굴곡 변동량 (px, ±) — 중심정렬: 깊이 1000~11000

// === 2D 월드좌표 value noise ===
//   변별(W/E/N/S) 1D 노이즈는 해안이 방향을 바꾸거나 바다배치가 달라지는 지점에서 시드가 달라져
//   존 경계/꼭짓점에 솔기가 생김. 대신 "가장 가까운 바다점"의 월드좌표로 2D 연속노이즈를 샘플하면
//   어느 방향의 해안이든, 존을 넘어가든 깊이가 매끈하게 이어진다.
function _coastHash2(ix, iy, oct) {
  let h = 5381;
  h = ((h * 33) ^ ix) >>> 0;
  h = ((h * 33) ^ iy) >>> 0;
  h = ((h * 33) ^ oct) >>> 0;
  return (((h * 9301 + 49297) >>> 0) % 1000) / 1000;
}
function _vnoise2(x, y, step, oct) {
  const gx = x / step, gy = y / step;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); // smoothstep
  const n00 = _coastHash2(ix, iy, oct),     n10 = _coastHash2(ix + 1, iy, oct);
  const n01 = _coastHash2(ix, iy + 1, oct), n11 = _coastHash2(ix + 1, iy + 1, oct);
  const a = n00 * (1 - ux) + n10 * ux, b = n01 * (1 - ux) + n11 * ux;
  return a * (1 - uy) + b * uy;
}
// fBm: 큰 만(灣) + 중간 굴곡 + 잔 들쭉날쭉. step는 월드 px. 반환 0~1.
function _coastFbm2D(x, y) {
  return _vnoise2(x, y, 3200, 1) * 0.50
       + _vnoise2(x, y, 960,  2) * 0.32
       + _vnoise2(x, y, 320,  3) * 0.18;
}
// 중심정렬 -1~1 (육지 곶 ↔ 바다 만)
function _coastSmoothNoise2D(x, y) { return (_coastFbm2D(x, y) - 0.5) * 2; }

// zone: { id, isOcean, worldOffsetX, worldOffsetY, zoneWidth, zoneHeight }
// tileSize: pixels per tile (보통 32)
// findZoneAtFn: (absX, absY) => zone-like object with .isOcean
// returns Set of "tx_ty" keys (local tile coords)
function generateCoastlineWaterTiles(zone, tileSize, findZoneAtFn, oceanRects) {
  const waterTiles = new Set();
  if (zone.isOcean) return waterTiles; // ocean zone은 전체 물 — 별도 처리
  if (!oceanRects || !oceanRects.length) return waterTiles;
  // Phase 5-1 fix: inland water (강·호수)는 zone start 시 pre-compute 안 함.
  //   PZ급 zone에서 수백만 cell × 검사 = 수십 초 → healthcheck timeout.
  //   대신 isWaterTileLocal 동적 호출 시 terrain.isWaterCellLocal로 검사 (콜라이더용).
  //   클라 시각도 isWaterAtAbs에서 동적으로.

  const cols = Math.ceil(zone.zoneWidth / tileSize);
  const rows = Math.ceil(zone.zoneHeight / tileSize);
  const maxDist = COASTLINE_BASE + COASTLINE_NOISE;
  const maxDist2 = maxDist * maxDist;

  for (let ty = 0; ty < rows; ty++) {
    const absY = zone.worldOffsetY + ty * tileSize;
    const wty = Math.floor(absY / tileSize);   // 월드 타일좌표(세로)
    const distN = ty * tileSize;
    const distS = (rows - 1 - ty) * tileSize;
    for (let tx = 0; tx < cols; tx++) {
      const absX = zone.worldOffsetX + tx * tileSize;
      const wtx = Math.floor(absX / tileSize);   // 월드 타일좌표(가로)
      const distW = tx * tileSize;
      const distE = (cols - 1 - tx) * tileSize;

      // 변 근처가 아니면 skip (해안선은 가장자리 근처에만)
      if (Math.min(distW, distE, distN, distS) > maxDist) continue;

      // === 가장 가까운 바다점 (변 + 꼭짓점 모두) ===
      const ax = absX + tileSize / 2, ay = absY + tileSize / 2;
      let bd2 = maxDist2, bnx = 0, bny = 0, hit = false;
      for (let oi = 0; oi < oceanRects.length; oi++) {
        const O = oceanRects[oi];
        const nx = ax < O.x0 ? O.x0 : (ax > O.x1 ? O.x1 : ax);
        const ny = ay < O.y0 ? O.y0 : (ay > O.y1 ? O.y1 : ay);
        const dx = ax - nx, dy = ay - ny, d2 = dx * dx + dy * dy;
        if (d2 < bd2) { bd2 = d2; bnx = nx; bny = ny; hit = true; }
      }
      if (!hit) continue;
      const dist = Math.sqrt(bd2);
      // 깊이 노이즈를 "가장 가까운 바다 경계점(bnx,bny)" 월드좌표에서 샘플 → 변·꼭짓점·존경계 솔기 없음.
      const depth = COASTLINE_BASE + _coastSmoothNoise2D(bnx, bny) * COASTLINE_NOISE;
      if (dist < depth) waterTiles.add(`${tx}_${ty}`);
    }
  }
  return waterTiles;
}

// ★[T108 2026-09-05] `RESOURCE_HP_TABLE` 을 **내준다** — `zone.js` 가 같은 표를 한 벌 더
//   들고 있었고(운석이 빠져 3대에 깨졌다 · T90 회부), 그걸 지우려면 정본이 나가야 한다.
module.exports = { Chunk, ChunkManager, CHUNK_SIZE, generateChunkResources, resourceAt, resourcesAtCell, treeBlockerAt, overflowInto, seedGenChunkOf, regrowStageOf, REGROW, GROVE, seedRand, forestSpacing, forestTreesPerCell, forestTreesPerCellMean, scatterTreesPerCell, treeShareOf, scatterRocksPerCell, rockShareOf, FOREST_MIN_COV, RESOURCES_PER_CHUNK, generateVillagesForZone, makeVillageName, generateCoastlineWaterTiles, RESOURCE_HP_TABLE };
