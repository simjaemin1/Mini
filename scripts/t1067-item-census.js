#!/usr/bin/env node
// === scripts/t1067-item-census.js — 품목 그림 전수 표 기계 (T1067 ①) ==================================
//
// ★왜 [T1067 · 재민 11-01 "아직 모델링이 안 된 아이템들이 너무 많다 — 물고기들도 그렇고"]
//   UI 캐논(재민 09-03): 아이템·가구는 그림이 하나(어디서나 같은 렌더 PNG · 없으면 점선 칸).
//   T472 가 품목 이름 전수(324)를 셌지만 그 자는 스크래치(레포 밖)였고 "언제 손에 드나 · 누가 보나"가 없었다.
//   이 표 기계는 **굽는 차례**를 정하는 자다 — 품목마다
//     ① 그림(제 것 · 갈래 빌림 · 점선 칸) ② 처음 손에 드는 때(단) ③ 보이는 곳 ④ 보는 사람
//   을 정본 모듈·소스에서 읽어 낸다. 표 기계다 — 판정 0 · 단언 0(셈과 근거 자리만 낸다).
//
// ★읽기만 — 서버를 안 띄운다 · 레포 파일을 안 고친다(`--json` 이 가리키는 파일 하나만 쓴다).
//   ★표를 옮겨 적지 않는다: 정본 모듈을 부르거나(weights · itemlabel · fishing · seafish · …)
//     소스의 **그 리터럴을 그대로 평가**한다 — `scripts/code-only.js`(주석 덮기 정본)로 주석을 덮고
//     `acorn.parseExpressionAt` 로 식 하나를 떠서 `vm` 에서 돈다(정규식으로 긁은 사본이 아니다).
//     zone.js 의 `lootOfResource` · `_t593Water` · 클라 `equipPicKey` 도 **그 함수 글자 그대로** 떠서 부른다.
//
// ★우주(품목 키) = 합집합 — T472 `보고/T472_2026-09-27.md` §ⓐ-0 의 자 + 그 뒤 생긴 것:
//   무게 `weights.catalog()` ∪ 이름표(zone 이 짓는 차례 그대로: `ITEM_LABEL_SERVER` 글자 → 갯벌 `tidal.install` →
//   사냥고기 `game-meat.install` → 보존식 `Spoil.PRESERVED_ITEMS` → 작물 `Crops.labelMap()` → ★민물고기
//   (`if (Fishing.T593_SEA) for (const s of Fresh.SPECIES)`) → `ItemLabel.itemLabels(lab, BUILDING_RECIPES)`) ∪
//   `PV_DEPOSIT_MAP` 양쪽(조건 줄 포함 · 조건은 그 글자를 평가) ∪ `fishing.FISH_ITEMS` ∪ 갯벌 `CATCH` ∪
//   군락 `GROVE_KINDS.item` ∪ 곳간·돌·제련·공정 표 키 ∪ `clothes_<재질>` ∪ 클라 `EQUIP_ICONS` ∪
//   **동사가 짐에 넣는 것 전부**(아래 길 표) ∪ **화면이 그림 칸을 그리는 키**(요리 이름 · 장비 재질 칸 · 시세표 Q).
//
// ★그림 — `own` = `<아이콘 폴더>/<키>.png` 가 있다(`--icons <폴더>` 로 다른 폴더를 볼 수 있다) ·
//   `borrow:<갈래>` = 잠금 `icons.lock.json` `_갈래.<갈래>.items` 에 있고 그 갈래 `icon` 이 있다(T481 임시 그림 —
//   클라 `43-i-icon.js` 의 그 한 줄과 같은 술어: 대표가 `ICON_RENDERED` 에 있고 제 키는 없을 때) · `none` = 점선 칸.
//   곁 칸: `ICON_RENDERED` 에 있나 · 잠금 `icons` 행에 있나(셋이 어긋나면 따로 센다).
//
// ★★단(손에 드는 때) — **기계 규칙**(길마다 아래를 그대로 적용 · 품목의 단 = 그 품목에 닿는 길 중 가장 이른 단):
//   길의 단 = 아래 넷의 최댓값(사다리는 가장 늦은 칸이 정한다):
//     ⓐ 넣는 재료 각각의 단
//     ⓑ 도구·시설 요구 하나마다 (그 도구·시설의 단 + 1) — 첫 1시간 재료로 바로 서는 도구·시설(모닥불 · 작업대 · 건조대 ·
//        급조 석기 · 톱 · 망치 · 곡괭이 …)이면 첫날이다
//     ⓒ 게임일 단위 시간 문(성장일 · 말리기 · 졸이기 · 훈제 날수 — 정본 표의 `days`): ≤ 실시간 1시간(아래 하루 길이로 환산한
//        게임일 · 지금 2.5일)이면 첫날 · 넘으면 이후. 초 단위 시설 대기열(요리 20초 · 작업대 180초)은 시설 요구에 들어 있다
//     ⓓ 거래 · 거래소 · 곳간 꺼내기 · 게시판 보상 · 마을 장인 구매 · 위세품 대금 = 이후(카드 규칙 "거래·곳간만이면 이후")
//   `첫 1시간` = 시작 짐 ∪ 도구·시설·긴 시간 문이 없는 맨손 동사 ∪ 시설 없는 손 제작 중 재료가 모두 첫 1시간인 것
//   `첫날`     = 첫 1시간 재료로 서는 도구·시설 하나를 거치거나 ≤ 2.5 게임일 시간 문
//   `이후`     = 더 긴 사슬(제련 · 금속 · 긴 성장 · 여러 단) · 거래·곳간·게시판으로만
//   `손에 안 듦` = 사람의 길이 0(세계 물체 이름 · econ 안쪽 재화 · 주민 전용 · 손잡이 꺼진 길만)
//   ⚠**철(계절)은 단을 바꾸지 않는다** — 그 철 안에서의 단이고, 가장 이른 길들이 철에 묶이면 `철` 칸에 적는다
//     (첫 1시간 · 첫날 품목만 — 이후 단은 긴 시간 문이 단을 정하고 파종철이 수확철도 아니다).
//   ⚠**자리(물·지역)도 단을 바꾸지 않는다** — `보는 사람` 칸(그 물·지역)이 말한다.
//   ⚠코드로 못 가르는 것은 `?` 와 까닭(지어내지 않는다).
//   ★시작 짐 = 사람 몸이 접속 때 받는 리터럴(`zone.js` `inventory = { wood: 0, stone: 0, ..._testInv }` · central 행 기본 `'{}'`) —
//     빈손이다. `seed_berry: 2` 가 든 리터럴은 **주민(NPC) 몸**(`spawnNpcPlayer`)이라 사람 길로 안 센다.
// ★보이는 곳 — 클라가 `itemPic`/`itemIconHtml` 로 그림 칸을 그리는 목록만(키는 서버가 실어 보내는 표에서):
//   제작창(도구 · 장비 재질 칸 · 건축물 · 가공 · 음식) · 시설창(모닥불 · 작업대 · 노 · 건조대 · 소금가마) · 게시판 · 시세표(Q).
//   짐 창은 손에 드는 품목 전부에 공통이라 따로 안 센다 · 곳간 창 · 거래소 · 내 요리는 글자뿐이라 그림 칸이 없다.
// ★보는 사람 — 넓은 차례 `모두` > `그 일 하는 사람` > `그 물·지역` > `거래·곳간만`.
//   길의 보는 사람 = 그 동사의 칸과 넣는 재료들의 칸 중 **가장 좁은 것** · 품목 = 길들 중 **가장 넓은 것** ·
//   그리고 화면 칸(제작창 목록 = 모두 · 시설창 = 그 시설 · 게시판·시세표 = 거래·곳간만) 중 넓은 쪽.
//
// 실행: node scripts/t1067-item-census.js [--json <파일>] [--icons <폴더>] [--zone hanbando]
//   (존 안 띄움 · 레포 파일 읽기만 · 약 1초 · 2코어 상자에서 렌더와 같이 돌려도 된다)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const codeOnly = require('./code-only.js');   // ★[T171] 주석 덮기 정본(오프셋·줄 번호 불변)
const ROOT = path.join(__dirname, '..');

// ── 인자 ──────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const JSON_OUT = argOf('--json');
const ICON_DIR = argOf('--icons') ? path.resolve(argOf('--icons')) : path.join(ROOT, 'public', 'assets', 'icons');
const ZONE = argOf('--zone') || 'hanbando';

// ── 정본 모듈 — 부를 때 찍는 말은 막는다(표 기계의 출력은 이 파일만 낸다) ─────────────────────────
const _log = console.log, _warn = console.warn;
function quiet(fn) { console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = _log; console.warn = _warn; } }
const SV = (f) => quiet(() => require(path.join(ROOT, 'server', f.replace(/^\.\//, ''))));
const M = {
  Weights: SV('weights'), ItemLabel: SV('itemlabel'), Specialty: SV('specialty'), Spoil: SV('spoil'), Crops: SV('crops'),
  Fishing: SV('fishing'), Fresh: SV('freshfish'), Sea: SV('seafish'), Tidal: SV('tidal'), GameMeat: SV('game-meat'),
  Chunk: SV('chunk'), Terrain: SV('terrain'), Granary: SV('granary-stages'), StoneUses: SV('stone-uses'), Smelt: SV('smelt-uses'),
  Hut: SV('hut-stages'), Well: SV('well-stages'), Bridge: SV('bridge-stages'), Clothes: SV('clothes'), Forage: SV('forage'),
  Trees: SV('trees'), Animals: SV('animals'), Salt: SV('salt'), Facility: SV('facility'), ZoneCfg: SV('zone-config'),
  Calendar: SV('calendar'), PlayerItems: SV('player-items'), Era: SV('era'),
};
const EconV1 = quiet(() => require(path.join(ROOT, 'sim', 'economy-sim')));   // 시세표(Q) 가 부르는 v1 세계(`central.js /economy/prices`)

// ── 소스 · 근거 자리 ──────────────────────────────────────────────────────────────────────────────
const _src = new Map();
function srcOf(rel) {
  let s = _src.get(rel);
  if (!s) { const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8'); s = { rel, raw, code: codeOnly(raw), nl: null }; _src.set(rel, s); }
  return s;
}
function lineOfIdx(s, idx) {   // 1부터
  if (!s.nl) { s.nl = []; for (let i = 0; i < s.raw.length; i++) if (s.raw.charCodeAt(i) === 10) s.nl.push(i); }
  let lo = 0, hi = s.nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s.nl[m] < idx) lo = m + 1; else hi = m; }
  return lo + 1;
}
const MISSING = [];   // 못 찾은 근거 정규식 — 소스가 바뀌었다는 신호(표에 `:?` 로 남는다 · 조용히 넘기지 않는다)
// 근거 자리 = 그 정규식이 **주석 덮은 글자**에서 처음 맞는 줄(`raw` 면 주석 안까지)
function at(rel, re, raw) {
  const s = srcOf(rel); const m = re.exec(raw ? s.raw : s.code);
  if (!m) { MISSING.push(`${rel} ${re}`); return `${rel}:?`; }
  return `${rel}:${lineOfIdx(s, m.index)}`;
}
const BASE_CTX = { Math, Number, String, Object, Array, Set, Map, JSON, parseFloat, parseInt, isFinite, process };
const SHIM_REQ = (p) => SV(p);
// 리터럴 하나를 **그 글자 그대로** 평가한다 — `re` 는 식 바로 앞에서 끝나야 한다(또는 식 앞의 0폭 자리)
function litAt(rel, re, ctx) {
  const s = srcOf(rel); const m = re.exec(s.code);
  if (!m) throw new Error(`${rel}: ${re} 를 못 찾았다 — 소스 구조가 바뀌었다(표를 지어내지 않는다)`);
  let node = acorn.parseExpressionAt(s.code, m.index + m[0].length, { ecmaVersion: 2022 });
  // ⚠`parseExpressionAt` 은 쉼표 식까지 먹는다(객체 칸 `inventory: {…}, tools: …` 에서 `{…}, tools` 를 한 식으로 뜬다) — 첫 식만
  if (node.type === 'SequenceExpression') node = node.expressions[0];
  const text = s.code.slice(node.start, node.end);
  const value = vm.runInNewContext('(' + text + ')', Object.assign({}, BASE_CTX, { require: SHIM_REQ }, ctx || {}));
  return { value, at: `${rel}:${lineOfIdx(s, m.index)}` };
}
const Z = 'server/zone.js', VIL = 'server/villages.js', ICON_JS = 'public/client/43-i-icon.js';

// ── 하루 길이 · 첫날 문턱 ─────────────────────────────────────────────────────────────────────────
//   정본 = `zone-config.js WORLD.dayLengthMs`(zone.js `_SEASON_DAY_MS` 가 env `VILLAGE_DAY_MS` 다음으로 읽는 값).
const DAY_MS = parseInt(process.env.VILLAGE_DAY_MS || '', 10) || (M.ZoneCfg.WORLD && M.ZoneCfg.WORLD.dayLengthMs) || 24 * 60 * 1000;
const GATE_DAYS = 3600 * 1000 / DAY_MS;   // 실시간 1시간 = 게임일(지금 2.5)
const YEAR_DAYS = M.Calendar.yearLen ? M.Calendar.yearLen(1) : 365;
const TIERS = ['첫 1시간', '첫날', '이후', '손에 안 듦'];
const REACH = ['모두', '그 일 하는 사람', '그 물·지역', '거래·곳간만'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

// ══ ① 소스 리터럴 — zone.js · villages.js · 클라 ═══════════════════════════════════════════════════
const ctxZ = { Salt: M.Salt, StoneUses: M.StoneUses, GranaryStages: M.Granary, HutStages: M.Hut };
const L_LABEL = litAt(Z, /const ITEM_LABEL_SERVER = /, ctxZ);
const L_RECIPES = litAt(Z, /const RECIPES = /, ctxZ);
const L_ITEM_RECIPES = litAt(Z, /const ITEM_RECIPES = /, ctxZ);
const L_BUILDING = litAt(Z, /const BUILDING_RECIPES = /, ctxZ);
const L_COOK = litAt(Z, /const COOK_RECIPES = /, ctxZ);
const L_EQUIP = litAt(Z, /const EQUIPMENT_RECIPES = /, ctxZ);
const L_START = litAt(Z, /inventory = (?=\{ wood: 0, stone: 0, \.\.\._testInv \})/, { _testInv: {} });   // 사람 몸(접속 때)
const L_NPC_INV = litAt(Z, /inventory: (?=\{ wood: 0, stone: 0, berry: 0)/, {});                         // 주민 몸(NPC)
const ATTACK_DMG = litAt(Z, /const PLAYER_ATTACK_DAMAGE = /).value;
const BUSH_BERRY_N = litAt(Z, /const BUSH_BERRY_N = /).value;
const ACORN_BYPRODUCT = litAt(Z, /const ACORN_BYPRODUCT = /).value;
const RECIPES = L_RECIPES.value, ITEM_RECIPES = L_ITEM_RECIPES.value, BUILDING_RECIPES = L_BUILDING.value, EQUIP = L_EQUIP.value;
// 요리 표 = 글자 + 갯벌 주입 + 사냥고기 주입(zone.js 차례 그대로 · 이미 있는 줄은 안 덮는다)
const COOK = Object.assign({}, L_COOK.value);
M.Tidal.install({ COOK_RECIPES: COOK });
M.GameMeat.install({ COOK_RECIPES: COOK });
const BUILD_TYPE_TO_ITEM = {}; for (const [k, r] of Object.entries(BUILDING_RECIPES)) BUILD_TYPE_TO_ITEM[r._buildType] = k;
// `lootOfResource` — 그 함수 글자를 떠서 부른다(손으로 옮긴 표 0). 해시는 0(도토리·씨앗 갈래가 다 열린다) · 운철 굴림 0.5.
const lootOfResource = litAt(Z, /(?=function lootOfResource\()/, {
  ACORN_BYPRODUCT, BUSH_BERRY_N, _gidHash: () => 0, GROVE_KINDS: M.Chunk.GROVE_KINDS, _dt: () => 0.5,
  Crops: { wildSeedAt: () => '__wild__', seedOf: (id) => 'seed_' + id },
}).value;
const t593Water = litAt(Z, /(?=function _t593Water\()/).value;   // 사람 낚시의 민물 갈래(그 함수 그대로)
// villages.js — 곳간 대응표(글자 + 조건 줄 · 조건은 그 글자를 평가한다)
const L_PV = litAt(VIL, /const PV_DEPOSIT_MAP = /);
const PV = [];   // { item, res, cond, on, at }
for (const [k, r] of Object.entries(L_PV.value)) PV.push({ item: k, res: r, cond: null, on: true, at: L_PV.at });
{
  const s = srcOf(VIL), re = /if \(([^\n]+?)\) Object\.assign\(PV_DEPOSIT_MAP,\s*/g;
  let mm;
  while ((mm = re.exec(s.code))) {
    const node = acorn.parseExpressionAt(s.code, mm.index + mm[0].length, { ecmaVersion: 2022 });
    const obj = vm.runInNewContext('(' + s.code.slice(node.start, node.end) + ')', {});
    let on = null; try { on = !!vm.runInNewContext(mm[1], Object.assign({}, BASE_CTX, { require: SHIM_REQ, _spec: () => M.Specialty })); } catch (e) { on = null; }
    for (const [k, r] of Object.entries(obj)) PV.push({ item: k, res: r, cond: mm[1].trim(), on, at: `${VIL}:${lineOfIdx(s, mm.index)}` });
  }
}
const PV_ON = PV.filter((r) => r.on);
// 대표 품목(꺼내기·보상·거래소가 내주는 것) = 재화마다 **첫 줄**(`events.buildDeliverable` 의 규칙 — 정본을 부른다)
const DELIV = SV('events').buildDeliverable(Object.fromEntries(PV_ON.map((r) => [r.item, r.res])));
const REP_ITEMS = [...DELIV.toEcon.values()];
const RELIC_PAY = litAt(VIL, /const RELIC_PAY_PREF = /);
// 클라 — 그림 목록 · 장비 갈래 그림 · 장비 그림 키 함수(그 글자 그대로)
const L_RENDERED = litAt(ICON_JS, /const ICON_RENDERED = /);
const ICON_RENDERED = new Set(Array.from(L_RENDERED.value));
const L_EQUIP_ICONS = litAt('public/client/45-t-market.js', /const EQUIP_ICONS = /);
const EQUIP_ICONS = L_EQUIP_ICONS.value;
const equipPicKey = litAt(ICON_JS, /(?=function equipPicKey\()/, { EQUIP_ICONS }).value;
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'icons.lock.json'), 'utf8'));
const LOCK_ICONS = new Set(Object.keys(LOCK.icons || {}));
const GROUPS = LOCK['_갈래'] || {};

// ══ ② 이름표 — zone.js 가 짓는 차례 그대로 ═════════════════════════════════════════════════════════
const LAB = {}, LAB_FROM = {};
const _lab = (k, v, from, overwrite) => { if (overwrite || !(k in LAB)) { LAB[k] = v; LAB_FROM[k] = from; } };
for (const [k, v] of Object.entries(L_LABEL.value)) _lab(k, v, '글자', true);
{ const t = {}; for (const k of Object.keys(LAB)) t[k] = LAB[k]; M.Tidal.install({ ITEM_LABEL_SERVER: t }); for (const k of Object.keys(t)) _lab(k, t[k], '갯벌'); }
{ const t = Object.assign({}, LAB); M.GameMeat.install({ ITEM_LABEL_SERVER: t }); for (const k of Object.keys(t)) _lab(k, t[k], '사냥고기'); }
for (const [k, v] of Object.entries(M.Spoil.PRESERVED_ITEMS)) _lab(k, v.ko, '보존식', true);
for (const [k, ko] of Object.entries(M.Crops.labelMap())) _lab(k, ko, '작물', true);
if (M.Fishing.T593_SEA) for (const s of M.Fresh.SPECIES) _lab(s.id, s.ko, '민물고기');
{
  const full = M.ItemLabel.itemLabels(Object.assign({}, LAB), BUILDING_RECIPES);
  for (const [k, ko] of Object.entries(full)) {
    if (k in LAB) continue;
    const from = (M.Specialty.RESOURCES[k] && M.Specialty.RESOURCES[k].ko === ko) ? '특산' : (BUILDING_RECIPES[k] ? '건축' : (M.ItemLabel.NO_CANON[k] ? '정본없음' : '?'));
    _lab(k, ko, from);
  }
}
const CATALOG = M.Weights.catalog();

// ══ ③ 길 표 — 품목이 사람 손에 드는 길 전부 ═══════════════════════════════════════════════════════
const PATHS = [];
function addPath(p) {
  PATHS.push(Object.assign({ inputs: {}, tools: [], facility: null, days: 0, seasons: null, region: null, reach: '모두', kind: 'hand', on: true, knob: null }, p));
}
const seasonsOrNull = (arr) => { const s = SEASONS.filter((x) => arr && arr.indexOf(x) >= 0); return (!arr || s.length === 4) ? null : s; };
// ── 근거 자리 ──
const AT = {
  start: at(Z, /inventory = \{ wood: 0, stone: 0, \.\.\._testInv \}/),
  npcStart: at(Z, /inventory: \{ wood: 0, stone: 0, berry: 0, fiber: 0, meat_raw: 0, hide: 0, seed_berry: 2 \}/),
  centralDefault: at('server/central.js', /inventory_json TEXT DEFAULT '\{\}'/),
  gather: at(Z, /function gatherResource\(/), gatherNoGate: at(Z, /let dmg = 1;/), loot: at(Z, /function lootOfResource\(/),
  lootBushSeed: at(Z, /const wild = Crops\.wildSeedAt\(cx, cy, ctx\.day\);/), lootNpcSeed: at(Z, /l\.seed_berry = 1;/),
  hpTable: at('server/chunk.js', /const RESOURCE_HP_TABLE = /), oreSpawn: at('server/chunk.js', /type = 'ore';/), meteorSpawn: at('server/chunk.js', /type: 'meteorite', hp:/),
  wildOn: at('server/chunk.js', /T450_WILD_GROVES === '1'/), groveKinds: at('server/chunk.js', /const GROVE_KINDS = /),
  forage: at(Z, /function tryForage\(/), forageSrc: at('server/forage.js', /function sourceAt\(/), forageKO: at('server/forage.js', /const KO = /),
  vessel: at(Z, /if \(require\('\.\/tidal'\)\.usesVessel\(src\.kind\)\)/), seaGate: at(Z, /Forage\.seaSourceAt\(player\.x, player\.y/),
  tidal: at('server/tidal.js', /const CATCH = /), tidalPick: at('server/tidal.js', /function pickAt\(/),
  fruit: at(Z, /function tryPickFruit\(/), treesFruit: at('server/trees.js', /function fruitIds\(/), wildSeed: at('server/crops.js', /function wildSeedAt\(/),
  plant: at(Z, /function doPlant\(/), harvest: at(Z, /function tryHarvest\(/),
  fishCast: at(Z, /function tryFishCast\(/), fishLand: at(Z, /function _fishLand\(/), t593Water: at(Z, /function _t593Water\(/),
  fresh: at('server/freshfish.js', /const SPECIES = \[/), seaTable: at('server/seafish.js', /const TABLE = /), fishItems: at('server/fishing.js', /const FISH_ITEMS = /),
  attack: at(Z, /async function tryAttack\(/), corpse: at(Z, /function spawnCorpse\(/), butcher: at(Z, /function butcherCorpse\(/), dropsOf: at('server/animals.js', /function dropsOf\(/),
  hostiles: at(Z, /const HOSTILES_ON = /), huntable: at(Z, /const huntable = huntableInBiome\(ZONE\.biome, ZONE_ID\);/),
  tame: at(Z, /if \(!def \|\| !def\.produces/),
  mine: at(Z, /function mineOreCell\(/), mineGate: at(Z, /if \(!eq \|\| eq\.type !== 'pickaxe'\) return false;/), sort: at(Z, /function trySortOre\(/),
  smelt: at(Z, /function tryFurnaceSmelt\(/), furnaceSpec: at(Z, /function _furnaceSpec\(/), furnaceKinds: at('server/smelt-uses.js', /const FURNACE_KINDS = /),
  kilnStages: at('server/smelt-uses.js', /const CHARCOAL_KILN_STAGES = /),
  craft: at(Z, /function doCraft\(/), craftItem: at(Z, /function doCraftItem\(/), craftItemTool: at(Z, /if \(recipe\.requiresTool && !hasTool\(/),
  craftBuild: at(Z, /function doCraftBuilding\(/), hammer: at(Z, /if \(recipe\._useHammer && !hasTool\(player, 'hammer'\)\)/),
  equip: at(Z, /function doCraftEquipment\(/), equipFac: at(Z, /const _fac = facilityFor\(player, _kind\);/),
  shop: at(Z, /function doShopBuy\(/), cook: at(Z, /function doCook\(/), cookFac: at(Z, /const _fc = facilityFor\(player, 'cook'\);/),
  cookItem: at(Z, /if \(recipe\.item\) \{/), cookDish: at(Z, /const dish = PlayerItems\.craftItem\('food', cookLvl, recipe\.cost\);/),
  preserve: at(Z, /function doPreserve\(/), spoilPreserve: at('server/spoil.js', /const PRESERVE = /), boil: at(Z, /function doBoilSalt\(/),
  dismantle: at(Z, /function doDismantleBuilding\(/), plantBuild: at(Z, /_tryBuildAt\(player, 'farmland', 0, null, null, \{ skipCost: true \}\)/),
  trade: at('server/trade.js', /const takeItem = D\.toEcon\.get\(takeRes\);/), board: at('server/events.js', /inventory\[rewPlayerItem\] = /),
  deliverable: at('server/events.js', /function buildDeliverable\(/),
  withdraw: at(VIL, /function playerVillageWithdraw\(/), chief: at('server/membership.js', /function withdrawChief\(/),
  relic: at(Z, /function doSellIronRelic\(/), relicPay: RELIC_PAY.at, relicMats: at(Z, /const RELIC_MATS = /),
  eatReturn: at(Z, /if \(eff\.returns\)/), dayMs: at('server/zone-config.js', /dayLengthMs:/), seasonDayMs: at(Z, /const _SEASON_DAY_MS = /),
};
// ── 시작 짐 — 사람 몸은 빈손이다(주민 몸 리터럴의 `seed_berry: 2` 는 NPC 것 · 사람은 central 행 `'{}'`) ──
for (const [k, n] of Object.entries(L_START.value)) if (n > 0) addPath({ item: k, verb: '시작 짐', at: AT.start, kind: 'start', req: `시작 짐 ${n}` });
const START_POSITIVE = Object.entries(L_START.value).filter(([, n]) => n > 0).map(([k]) => k);
const NPC_START = Object.entries(L_NPC_INV.value).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
// ── 자연물 캐기(gatherResource → lootOfResource · 맨손 1타 = 1 · 도구는 배수만) ──
const ZT = M.Terrain.ZONE_TERRAIN[ZONE] || {};
const ZCFG = (M.ZoneCfg.ZONES || {})[ZONE] || {};
const pickResourceType = litAt('server/chunk.js', /(?=function pickResourceType\()/).value;
const BASE_KINDS = new Set(); for (let i = 0; i < 1000; i++) BASE_KINDS.add(pickResourceType(ZCFG.biome || 'forest', (i + 0.5) / 1000));
const KIND_PRESENT = {};   // 종류 → [있나, 까닭]
for (const k of BASE_KINDS) KIND_PRESENT[k] = [true, `청크 산포(${ZCFG.biome || 'forest'})`];
KIND_PRESENT.sapling = [M.Chunk.REGROW.ON() !== 0, 'T122 재생(벤 자리)'];
KIND_PRESENT.ore = [!!(ZT.ores && ZT.ores.length), `광맥 ${ZT.ores ? ZT.ores.length : 0}곳(${AT.oreSpawn})`];
KIND_PRESENT.meteorite = [true, `운석 낙하지(청크당 해시 · ${AT.meteorSpawn})`];
for (const g of (ZT.groves || [])) KIND_PRESENT[g.kind] = KIND_PRESENT[g.kind] && KIND_PRESENT[g.kind][0] ? KIND_PRESENT[g.kind] : [true, '마을 어귀 군락(지형 자료)'];
const WILD_ON = M.Chunk.WILD.ON();
for (const [cls, kinds] of Object.entries(M.Chunk.WILD_HAB)) for (const k of kinds) if (!KIND_PRESENT[k]) KIND_PRESENT[k] = [WILD_ON, `야생 군락(${cls}) — 손잡이 T450_WILD_GROVES=1 ${WILD_ON ? '켬' : '꺼짐'}`];
const REGION_OF_KIND = { ore: '광맥', meteorite: '운석 낙하지', mushroom_patch: '군락 자리', greens_patch: '군락 자리', beehive: '군락 자리', wild_vine: '군락 자리' };
for (const kind of Object.keys(M.Chunk.RESOURCE_HP_TABLE)) {
  const loot = lootOfResource({ type: kind, x: 0, y: 0, r: 8 }, { day: 0 });
  const pres = KIND_PRESENT[kind] || [false, '이 존에 안 난다'];
  const hp = M.Chunk.RESOURCE_HP_TABLE[kind];
  for (const item of Object.keys(loot)) {
    if (item.startsWith('seed___wild')) continue;   // 야생 채종은 아래 따로(철마다 종이 다르다)
    addPath({ item, verb: `자연물 캐기(${kind})`, at: AT.gather, kind: 'hand', on: pres[0], knob: pres[0] ? null : pres[1],
      region: REGION_OF_KIND[kind] || null, reach: REGION_OF_KIND[kind] ? '그 물·지역' : '모두',
      req: `맨손 E×${hp}(도구 검사 0 · ${AT.gatherNoGate}) · ${pres[1]}${item === 'acorn' ? ` · 나무의 ${ACORN_BYPRODUCT * 100}%` : ''}` });
  }
}
// ── 야생 채종(덤불 E · 사람만 `ctx.day` 가 있어 철 씨앗 · 주민은 `seed_berry`) ──
{
  const seedSeasons = {};
  for (const se of SEASONS) for (const c of M.Crops.sowableIn(se)) (seedSeasons[M.Crops.seedOf(c)] = seedSeasons[M.Crops.seedOf(c)] || []).push(se);
  for (const [seed, ss] of Object.entries(seedSeasons)) addPath({ item: seed, verb: '야생 채종(덤불 E)', at: AT.lootBushSeed, kind: 'hand', seasons: seasonsOrNull(ss), reach: '모두', on: !!(KIND_PRESENT.berry_bush || [])[0],
    req: `덤불 ${M.Crops.WILD_SEED_CHANCE * 100}% · 그 철 파종 작물만(${AT.wildSeed})` });
  addPath({ item: '@wildseed', verb: '야생 채종(아무 씨앗)', at: AT.lootBushSeed, kind: 'hand', seasons: seasonsOrNull([...new Set(Object.values(seedSeasons).flat())]), req: '덤불' });
}
// ── 맨손 줍기(tryForage → forage.sourceAt) · 그릇 채우기 · 갯벌 손 채집 ──
for (const k of Object.keys(M.Forage.KO)) {
  if (M.Tidal.usesVessel(k)) continue;
  addPath({ item: k, verb: '맨손 줍기', at: AT.forage, kind: 'hand', reach: '모두', req: `맨손 E(${AT.forageSrc} · 덤불·숲 바닥·물가 갈대·자갈 지형)` });
}
for (const k of [M.Salt.BRINE, M.Tidal.FRESH]) {
  const sea = k === M.Salt.BRINE;
  addPath({ item: k, verb: sea ? '짠물 뜨기(갯벌)' : '민물 담기', at: AT.vessel, kind: 'hand', inputs: { [M.Salt.VESSEL]: 1 },
    region: sea ? '갯벌' : null, reach: sea ? '그 물·지역' : '모두', req: `빈 ${LAB[M.Salt.VESSEL] || M.Salt.VESSEL} 1(그릇이 바뀐다)` });
}
for (const k of Object.keys(M.Tidal.CATCH)) addPath({ item: k, verb: '갯벌 손 채집', at: AT.tidalPick, kind: 'hand', region: '갯벌(썰물)', reach: '그 물·지역',
  req: `병 없이 갯벌 E · 썰물 창 ${Math.round(M.Tidal.CFG.OPEN_FRAC * 100)}%/${(M.Tidal.CFG.PERIOD_MS / 60000).toFixed(1)}분${k === 'abalone' ? ` · 조개밭의 ${M.Tidal.CFG.RARE_FRAC * 100}%` : ''} (${AT.seaGate})` });
// ── 열매 따기(tryPickFruit · 나무 종 8 이 이 존에 고르게 서는지 셀 표본으로 확인) ──
{
  const seen = {}; for (let i = 0; i < 4000; i++) { const s = M.Trees.speciesAt(ZONE, (i * 7919) % 2000, (i * 104729) % 4000); seen[s] = (seen[s] || 0) + 1; }
  for (const id of M.Trees.fruitIds()) {
    const item = M.Trees.fruitOf(id);
    addPath({ item, verb: `열매 따기(${M.Trees.koOf(id)})`, at: AT.fruit, kind: 'hand', seasons: [M.Trees.fruitSeasonOf(id)], reach: '모두', on: M.Trees.ON() && (seen[id] || 0) > 0,
      req: `맨손 · ${SEASON_KO[M.Trees.fruitSeasonOf(id)]} · 표본 4000셀 중 ${seen[id] || 0}그루(${AT.treesFruit})` });
  }
}
// ── 농사(doPlant → 돌보기 → tryHarvest) ──
for (const c of M.Crops.list()) addPath({ item: c.id, verb: '농사', at: AT.harvest, kind: 'hand', inputs: { [M.Crops.seedOf(c.id)]: 1 }, days: M.Crops.growDaysOf(c.id),
  seasons: seasonsOrNull(M.Crops.sowSeasons(c.id)), reach: '그 일 하는 사람', req: `씨앗 심기(${AT.plant}) · ${M.Crops.growDaysOf(c.id)}일` });
// ── 낚시(tryFishCast — 도구 검사 없음 · T593 켬이면 물이 표를 고른다) ──
const FISH_CAST_SRC = (() => { const s = srcOf(Z); const i = s.code.indexOf('function tryFishCast('); const n = acorn.parseExpressionAt(s.code, i, { ecmaVersion: 2022 }); return s.code.slice(n.start, n.end); })();
const FISH_TOOL_GATE = /getEquippedTool|hasTool|toolItems/.test(FISH_CAST_SRC);
const PLAYER_FRESH_WATERS = [...new Set([{ kind: 'river' }, { kind: 'river', estuary: 1 }, { kind: 'lake' }, { kind: 'mouth' }].map(t593Water))];
const MONTH_SEASON = (ms) => (ms ? [...new Set(ms.map((m) => M.Calendar.SEASON_OF_MONTH[m]))] : null);
const FISH_ROWS = [];   // 물고기 표(아래 ⑦)
if (M.Fishing.T593_SEA) {
  for (const s of M.Fresh.SPECIES) {
    const ws = s.waters.filter((w) => PLAYER_FRESH_WATERS.indexOf(w) >= 0);
    addPath({ item: s.id, verb: '낚시(민물)', at: AT.fishLand, kind: 'hand', on: ws.length > 0, knob: ws.length ? null : `사람 낚시 물 갈래(${PLAYER_FRESH_WATERS.join('·')})에 ${s.waters.join('·')} 없음(${AT.t593Water})`,
      seasons: seasonsOrNull(s.seasons), region: ws.indexOf('mid') >= 0 ? null : ws.join('·'), reach: ws.indexOf('mid') >= 0 ? '그 일 하는 사람' : '그 물·지역',
      req: `맨손 Shift+F(도구 검사 ${FISH_TOOL_GATE ? '있음' : '0'}) · 물 ${ws.join('·') || '없음'}` });
  }
  for (const s of M.Sea.SPECIES) addPath({ item: s.id, verb: '낚시(바다 해안)', at: AT.fishLand, kind: 'hand', seasons: seasonsOrNull(MONTH_SEASON(s.months)),
    region: s.spots ? `바다 ${s.spots.join('·')}` : '바다 해안', reach: '그 물·지역', req: `맨손 Shift+F · 바다 칸${s.spots ? ` (${s.spots.join('·')})` : ''}${s.months ? ` · ${s.months.join('·')}월` : ''}` });
} else {
  for (const id of M.Fishing.speciesFor(ZCFG.biome)) addPath({ item: id, verb: '낚시(옛 바이옴 표)', at: AT.fishLand, kind: 'hand', reach: '그 일 하는 사람', req: '맨손 Shift+F(T593_SEA=0)' });
}
// ── 사냥(맨손 공격 → 사체 → 도살) ──
const HOSTILES_ON = litAt(Z, /const HOSTILES_ON = /).value;   // zone.js 그 글자 그대로(env ENABLE_WILDLIFE)
const SHEEP_AT = at(Z, /for \(let i = 0; i < 50; i\+\+\) spawnMob\('sheep'\);/);
const HUNT_BY_ITEM = {};
{
  const noMob = !!(ZCFG.isOcean || ZCFG.cleanZone);
  const huntable = noMob ? [] : M.Animals.huntableInBiome(ZCFG.biome, ZONE).filter((id) => HOSTILES_ON || !M.Animals.ANIMALS[id].aggressive);
  for (const id of huntable) for (const [item, n] of Object.entries(M.Animals.dropsOf(id, ZONE) || {})) (HUNT_BY_ITEM[item] = HUNT_BY_ITEM[item] || []).push(`${M.Animals.ANIMALS[id].ko}${n}`);
  for (const [item, who] of Object.entries(HUNT_BY_ITEM)) addPath({ item, verb: '사냥·도살', at: AT.butcher, kind: 'hand', reach: '그 일 하는 사람',
    req: `맨손 공격 ${ATTACK_DMG}(${AT.attack}) · 도살 도구 0 · ${who.join(' ')}` });
  // 길들이기 산출(우유·양털·꿀 …) — 가축(breeding) 이 이 존에 나는가: 사냥감 목록이 가축을 빼고, 평화 종이 0 일 때만 양 50 이 난다
  const peaceful = huntable.filter((id) => !M.Animals.ANIMALS[id].aggressive);
  const domestic = noMob ? [] : (peaceful.length ? [] : ['sheep']);
  for (const [id, a] of Object.entries(M.Animals.ANIMALS)) for (const item of Object.keys(a.produces || {})) {
    const on = domestic.indexOf(id) >= 0;
    addPath({ item, verb: `길들인 ${a.ko} 산출`, at: AT.tame, kind: 'hand', on, knob: on ? null : `가축 ${a.ko} 이 이 존(${ZONE})에 안 난다(사냥감 목록은 가축을 빼고 · 양 50 은 평화 종 0 일 때만 ${SHEEP_AT})`, reach: '그 일 하는 사람', req: `길들인 ${a.ko} 곁 E(5분)` });
  }
}
// ── 광맥 채굴(곡괭이 정품만 · 원석 덩이) → 선광(맨손) ──
const ORE_MINERALS = (() => { const s = new Set(); for (const o of (ZT.ores || [])) { if (o.mineral) s.add(o.mineral); for (const [k, v] of Object.entries(o.minerals || {})) if (v > 0) s.add(k); } return [...s].sort(); })();
addPath({ item: 'ore_chunk', verb: '광맥 채굴', at: AT.mine, kind: 'hand', tools: ['pickaxe'], region: '광맥', reach: '그 물·지역', req: `곡괭이 장착(정품 · ${AT.mineGate})` });
for (const mnl of ORE_MINERALS) addPath({ item: mnl === 'iron' ? 'iron_ore' : mnl, verb: '선광', at: AT.sort, kind: 'hand', inputs: { ore_chunk: 1 }, region: '광맥', reach: '그 물·지역',
  req: `원석 덩이 → ${mnl}${mnl === 'iron' ? '(철은 정광)' : ''} · 이 존 광맥 광물 ${ORE_MINERALS.length}종` });
// ── 노·숯가마(단계 짓기) · 제련 ──
for (const [k, f] of Object.entries(M.Smelt.FURNACE_KINDS)) {
  const inputs = {}, tools = [];
  for (const st of f.stages) { for (const [it, n] of Object.entries(st.need || {})) inputs[it] = (inputs[it] || 0) + n; if (st.tool) tools.push(st.tool); }
  const tech = M.Era.hasTech(k);
  addPath({ item: '@furnace', verb: `노 짓기(${f.ko})`, at: AT.furnaceKinds, kind: 'hand', inputs, tools, on: tech, knob: tech ? null : `시대 기술 없음(era.hasTech('${k}'))`, reach: '그 일 하는 사람', req: f.stages.map((s) => s.label).join(' → ') });
}
{
  const inputs = {}, tools = [];
  for (const st of M.Smelt.CHARCOAL_KILN_STAGES) { for (const [it, n] of Object.entries(st.need || {})) inputs[it] = (inputs[it] || 0) + n; if (st.tool) tools.push(st.tool); }
  addPath({ item: '@charcoal_kiln', verb: '숯가마 짓기', at: AT.kilnStages, kind: 'hand', inputs, tools, reach: '그 일 하는 사람', req: M.Smelt.CHARCOAL_KILN_STAGES.map((s) => s.label).join(' → ') });
  addPath({ item: 'charcoal', verb: '숯가마 굽기', at: AT.kilnStages, kind: 'hand', inputs: { wood: M.Smelt.CHARCOAL_KILN_WOOD }, facility: ['@charcoal_kiln'], reach: '그 일 하는 사람', req: `통나무 ${M.Smelt.CHARCOAL_KILN_WOOD} → 숯 ${M.Smelt.CHARCOAL_KILN_YIELD}` });
}
addPath({ item: 'iron', verb: '제련(노)', at: AT.smelt, kind: 'hand', inputs: { iron_ore: 1, charcoal: M.Smelt.FURNACE_FUEL_PER_ORE }, facility: ['@furnace'], reach: '그 일 하는 사람',
  req: `철 정광 1 + 숯 ${M.Smelt.FURNACE_FUEL_PER_ORE} · 수율 ${(M.Era.smeltYield('iron', { furnace: 'crucible', fuel: 'charcoal', bellows: true }) * 100).toFixed(1)}%(도가니로)` });
// ── 손 제작 — 도구(doCraft) · 가공(doCraftItem) · 건축품(doCraftBuilding) ──
for (const [k, r] of Object.entries(RECIPES)) addPath({ item: k, verb: '손 제작(도구)', at: AT.craft, kind: 'hand', inputs: r.cost || { wood: r.wood || 0, stone: r.stone || 0 }, reach: '모두',
  req: `시설 0 · ${Object.entries(r.cost || {}).map(([a, n]) => `${a} ${n}`).join(' · ')}` });
for (const [k, r] of Object.entries(ITEM_RECIPES)) for (const out of Object.keys(r.to || {})) addPath({ item: out, verb: `손 가공(${k})`, at: AT.craftItem, kind: 'hand', inputs: r.from || {},
  tools: r.requiresTool ? [r.requiresTool] : [], reach: '모두', req: `${r.requiresTool ? `${r.requiresTool} 필요(${AT.craftItemTool})` : '맨손'} · ${r.label}` });
for (const [k, r] of Object.entries(BUILDING_RECIPES)) {
  const cost = {}; for (const [a, n] of Object.entries(r)) { if (a.startsWith('_') || a === 'label') continue; cost[a] = n; }
  addPath({ item: k, verb: '손 제작(건축품)', at: AT.craftBuild, kind: 'hand', inputs: cost, tools: r._useHammer ? ['hammer'] : [], reach: '모두', req: `${r._useHammer ? `망치(${AT.hammer})` : '망치 0'} · ${Object.entries(cost).map(([a, n]) => `${a} ${n}`).join(' · ')}` });
}
// 밭(doPlant 가 비용 없이 세운다) → 분해하면 `item_farmland`(사람은 `seed_berry` 를 못 얻는다 — 손 제작 길이 막혀 있다)
addPath({ item: BUILD_TYPE_TO_ITEM.farmland, verb: '씨앗 심어 선 밭 분해', at: AT.dismantle, kind: 'hand', inputs: { '@wildseed': 1 }, reach: '그 일 하는 사람', req: `심기가 밭을 세운다(${AT.plantBuild})` });
// ── 시설 — 종류 → 그 시설을 세우는 품목(없으면 단계 짓기 가짜 키) ──
const FAC_ITEMS = {};
for (const [type, f] of Object.entries(M.Facility.FACILITIES)) (FAC_ITEMS[f.kind] = FAC_ITEMS[f.kind] || []).push(BUILD_TYPE_TO_ITEM[type] || '@' + type);
// ── 장비(작업대 · 깎기·두드리기) · 마을 장인 구매 ──
for (const [type, r] of Object.entries(EQUIP)) for (const m of r.accepts) {
  const inputs = Object.assign({}, r.extra || {}); inputs[m] = (inputs[m] || 0) + r.qty;
  const key = equipPicKey(type, m);
  addPath({ item: key, verb: `작업대 장비(${r.label} · ${m})`, at: AT.equip, kind: 'hand', inputs, facility: FAC_ITEMS.tool, reach: '그 일 하는 사람', req: `작업대(${AT.equipFac}) · ${m} ${r.qty}${r.extra ? ' + ' + Object.entries(r.extra).map(([a, n]) => `${a} ${n}`).join(' ') : ''}` });
  addPath({ item: key, verb: `마을 장인 구매(${r.label} · ${m})`, at: AT.shop, kind: 'trade', inputs: { [m]: r.qty }, region: '마을광장', reach: '거래·곳간만', req: `마을 260px · ${m} ${r.qty}` });
}
// 철기(운철·철 재질 장비) — 위세품 대금의 입력
for (const [type, r] of Object.entries(EQUIP)) for (const m of r.accepts) if (/^(iron|meteoric_iron)$/.test(m)) addPath({ item: '@ironware', verb: `철기 ${r.label}`, at: AT.relicMats, kind: 'hand', inputs: { [m]: r.qty }, facility: FAC_ITEMS.tool, reach: '그 일 하는 사람', req: `${m} ${r.qty}` });
// ── 요리(doCook) — `item: true` 줄만 짐에 든다 · 나머지는 **요리 인스턴스**(짐 칸 아님) ──
const DISHES = [];
for (const [k, r] of Object.entries(COOK)) {
  if (r.item) for (const out of Object.keys(r.produces || {})) addPath({ item: out, verb: '요리(품목)', at: AT.cookItem, kind: 'hand', inputs: r.cost, facility: FAC_ITEMS.cook, reach: '그 일 하는 사람', req: `모닥불(${AT.cookFac}) · ${r.label}` });
  else DISHES.push(k);
}
// ── 보존 가공(doPreserve) · 자염(doBoilSalt) ──
for (const [id, r] of Object.entries(M.Spoil.PRESERVE)) for (const from of (Array.isArray(r.from) ? r.from : [r.from])) addPath({ item: r.out, verb: `보존(${r.label})`, at: AT.preserve, kind: 'hand',
  inputs: Object.assign({ [from]: 1 }, r.needs || {}), facility: FAC_ITEMS[r.kind], days: r.days, reach: '그 일 하는 사람', req: `${r.facilityKo} · ${r.days}일 · ${from}` });
for (const [id, r] of Object.entries(M.Salt.RECIPES)) addPath({ item: r.out, verb: `자염(${r.label})`, at: AT.boil, kind: 'hand', inputs: M.Salt.potCost(id), facility: FAC_ITEMS[r.kind], days: r.days,
  reach: '그 일 하는 사람', req: `${r.facilityKo} · ${r.days}일 · ${Object.entries(M.Salt.potCost(id)).map(([a, n]) => `${a} ${n}`).join(' · ')}` });
// ── 그릇 돌려받기(먹기 · 밭에 물 주기) ──
addPath({ item: M.Salt.VESSEL, verb: '민물 마시고 남은 병', at: AT.eatReturn, kind: 'hand', inputs: { [M.Tidal.FRESH]: 1 }, reach: '모두', req: '먹기 표 `returns`' });
// ── 거래 · 게시판 · 곳간 꺼내기(대표 품목) · 위세품 대금 ──
for (const item of REP_ITEMS) {
  addPath({ item, verb: '거래소', at: AT.trade, kind: 'trade', reach: '거래·곳간만', region: '마을', req: `대표 품목(${AT.deliverable})` });
  addPath({ item, verb: '게시판 보상', at: AT.board, kind: 'trade', reach: '거래·곳간만', region: '마을', req: '의뢰 납품의 보상' });
  addPath({ item, verb: '곳간 꺼내기(촌장만)', at: AT.withdraw, kind: 'trade', reach: '거래·곳간만', region: '마을', req: `촌장(${AT.chief})` });
}
for (const item of RELIC_PAY.value) addPath({ item, verb: '위세품 대금', at: AT.relic, kind: 'trade', inputs: { '@ironware': 1 }, reach: '거래·곳간만', region: '마을', req: `철기 하나를 마을에 넘김(${AT.relicPay})` });

// ══ ④ 단 · 철 · 보는 사람 — 고정점 ═══════════════════════════════════════════════════════════════
const ALL_PATH_KEYS = new Set(); for (const p of PATHS) { ALL_PATH_KEYS.add(p.item); for (const k of Object.keys(p.inputs)) ALL_PATH_KEYS.add(k); for (const t of p.tools) ALL_PATH_KEYS.add(t); for (const f of (p.facility || [])) ALL_PATH_KEYS.add(f); }
const TIER = {}; for (const k of ALL_PATH_KEYS) TIER[k] = 3;
const tierOf = (k) => (k in TIER ? TIER[k] : 3);
function pathTier(p) {
  let t = p.kind === 'trade' ? 2 : 0;
  for (const k of Object.keys(p.inputs)) t = Math.max(t, tierOf(k));
  for (const tool of p.tools) t = Math.max(t, tierOf(tool) >= 3 ? 3 : Math.min(2, tierOf(tool) + 1));
  if (p.facility && p.facility.length) { const ft = Math.min(...p.facility.map(tierOf)); t = Math.max(t, ft >= 3 ? 3 : Math.min(2, ft + 1)); }
  if (p.days > 0) t = Math.max(t, p.days <= GATE_DAYS + 1e-9 ? 1 : 2);
  return t;
}
for (let it = 0, ch = true; ch && it < 50; it++) {
  ch = false;
  for (const p of PATHS) { if (!p.on) continue; const t = pathTier(p); if (t < tierOf(p.item)) { TIER[p.item] = t; ch = true; } }
}
for (const p of PATHS) p.tier = p.on ? pathTier(p) : 3;
// 철 — 가장 이른 길들의 철(길의 철 ∩ 재료들의 철) 합집합 · null = 사철
//   ⚠첫 1시간 · 첫날 품목에만 적는다 — 이후 단은 긴 시간 문(성장일 · 거래)이 단을 정하고, 파종철이 수확철도 아니다(적으면 잡음이다).
const SEAS = {};
const seasOf = (k) => (k in SEAS ? SEAS[k] : null);
const inter = (a, b) => (a == null ? b : (b == null ? a : a.filter((x) => b.indexOf(x) >= 0)));
for (let it = 0; it < 10; it++) {
  for (const k of ALL_PATH_KEYS) {
    if (tierOf(k) >= 2) { SEAS[k] = null; continue; }
    let u = []; let any = false, all = false;
    for (const p of PATHS) {
      if (p.item !== k || !p.on || p.tier !== tierOf(k)) continue;
      let s = p.seasons; for (const i of Object.keys(p.inputs)) s = inter(s, seasOf(i));
      if (s == null) { all = true; break; }
      any = true; u = [...new Set(u.concat(s))];
    }
    SEAS[k] = all || !any ? null : (u.length >= 4 ? null : SEASONS.filter((x) => u.indexOf(x) >= 0));
  }
}
// 보는 사람(손에 드는 길) — 길 = 동사 칸과 재료 칸 중 가장 좁은 것 · 품목 = 닿는 길 중 가장 넓은 것
const AREACH = {};
const aReachOf = (k) => (k in AREACH ? AREACH[k] : 9);
for (let it = 0, ch = true; ch && it < 50; it++) {
  ch = false;
  for (const p of PATHS) {
    if (!p.on || p.tier >= 3) continue;
    let r = REACH.indexOf(p.reach);
    for (const i of Object.keys(p.inputs)) r = Math.max(r, aReachOf(i) === 9 ? 3 : aReachOf(i));
    p.reachIdx = r;
    if (r < aReachOf(p.item)) { AREACH[p.item] = r; ch = true; }
  }
}

// ══ ⑤ 보이는 곳 — 클라가 그림 칸(`itemPic`)을 그리는 목록 · 키는 서버 표에서 ═══════════════════════════
const SURF = [];   // { name, keys:Set, reach, at }
const surf = (name, keys, reach, atStr) => SURF.push({ name, keys: new Set(keys), reach, at: atStr });
const SIDE = 'public/client/51-s-side.js', PANEL = 'public/client/50-i-panel.js';
{
  const k1 = []; for (const [k, r] of Object.entries(RECIPES)) { k1.push(k, ...Object.keys(r.cost || {})); }
  surf('제작창·도구', k1, 0, `${at(SIDE, /id, msgType: 'craft', icon: itemIconHtml\(id, 34, ''\)/)} · ${at(PANEL, /<div class="craft-icon">\$\{itemPic\(name, 26\)\}<\/div>/)}`);
  const k2 = []; for (const [type, r] of Object.entries(EQUIP)) { k2.push(equipPicKey(type, r.accepts[0]), ...r.accepts, ...Object.keys(r.extra || {})); }
  surf('제작창·장비(재질 칸)', k2, 0, `${at(PANEL, /<div class="cr-icon">\$\{itemPic\(equipPicKey\(type, sel\), 22\)\}<\/div>/)} · 재질 단추 ${at(PANEL, /title="\$\{m\} 보유 \$\{has\}">\$\{itemIconHtml\(m, 18, itemKo\(m\)\)\}/)}`);
  const k3 = []; for (const [k, r] of Object.entries(BUILDING_RECIPES)) { k3.push(k); for (const a of Object.keys(r)) if (!a.startsWith('_') && a !== 'label') k3.push(a); }
  surf('제작창·건축물', k3, 0, at(SIDE, /id, msgType: 'craft_building', icon: itemIconHtml\(id, 34, ''\)/));
  const k4 = []; for (const [k, r] of Object.entries(ITEM_RECIPES)) k4.push(k, ...Object.keys(r.from || {}), ...Object.keys(r.to || {}));
  surf('제작창·가공', k4, 0, at(SIDE, /id, msgType: 'craft_item', icon: itemIconHtml\(id, 34, ''\)/));
  const k5 = []; for (const [k, r] of Object.entries(COOK)) k5.push(k, ...Object.keys(r.cost || {}), ...Object.keys(r.produces || {}));
  surf('제작창·음식', k5, 0, `${at(SIDE, /id, msgType: 'cook', icon: itemIconHtml\(id, 34, ''\)/)} · ${at(PANEL, /const prodStr = Object\.entries\(r\.produces\)/)}`);
  // 시설창 — 서버 `_facilityRecipes` 가 실어 보내는 줄(장비 줄은 빈손 기준 첫 재질 하나만 그림 · 보존 줄은 빈손이면 표의 첫 재료)
  const facRow = (kind) => {
    const ks = [];
    if (kind === 'cook') for (const r of Object.values(COOK)) ks.push(...Object.keys(r.cost || {}));
    if (kind === 'tool' || kind === 'smelt') for (const [t, r] of Object.entries(EQUIP)) {
      if (kind === 'smelt' && !r.cast) continue;
      const opts = r.accepts.map((m) => { let q = null; try { q = M.PlayerItems.craftItem(t, 0, { [m]: r.qty }).q; } catch (e) {} return { m, q }; }).sort((a, b) => (b.q || 0) - (a.q || 0));
      if (opts[0]) ks.push(opts[0].m); ks.push(...Object.keys(r.extra || {}));
    }
    for (const r0 of Object.values(M.Spoil.PRESERVE)) if (r0.kind === kind) { const r = M.Spoil.resolveFrom(r0, {}); ks.push(r.from, ...Object.keys(r.needs || {})); }
    if (kind === 'boil') for (const id of Object.keys(M.Salt.RECIPES)) ks.push(...Object.keys(M.Salt.potCost(id)));
    return ks;
  };
  const facAt = at(PANEL, /costStr = Object\.entries\(r\.cost\)\.map\(\(\[k, n\]\) => `\$\{itemIconHtml\(k, 18\)\}/);
  for (const [type, f] of Object.entries(M.Facility.FACILITIES)) {
    if (type === 'charcoal_kiln') continue;   // 숯가마는 시설창이 아니라 클릭 장입(노와 같은 창 종류 'smelt' 는 노 줄이 맡는다)
    surf(`시설창·${f.ko}`, facRow(f.kind), (type === 'campfire' || type === 'workbench') ? 0 : 1, facAt);
  }
  surf('게시판(의뢰·보상)', PV_ON.map((r) => r.res), 3, `${at('public/client/47-s-board.js', /<span class="bp-pic">\$\{itemPic\(r\.item, 20\)\}<\/span>/)} · 줄 = econ 재화(${at(VIL, /item: r\.item, remain: r\.remain/)})`);
  surf('시세표(Q · v1)', Object.keys(EconV1.RESERVE_PC || {}), 3, `${at(SIDE, /<td style="padding:3px">\$\{itemPic\(r, 16\)\} \$\{itemKo\(r\)\}<\/td>/)} · 키 = sim/economy-sim.js RESERVE_PC`);
}
const TEXT_ONLY = [   // 그림 칸 없이 글자만 — 굽어도 이 자리는 안 바뀐다
  ['곳간 창(마을 재고)', at(SIDE, /\$\{esc\(_pviKo\(it\.r\)\)\}/)],
  ['거래소', at(PANEL, /function renderTradePanel\(/)],
  ['내 요리(요리 인스턴스)', at(PANEL, /<div class="cr-icon"><\/div>\n\s*<div class="cr-info">\n\s*<div class="cr-name">\$\{d\.label\}/, true)],
];

// ══ ⑥ 우주 — 출처 합집합 ═════════════════════════════════════════════════════════════════════════
const U = new Map();   // key → Set(출처)
const addU = (k, tag) => { if (!k || typeof k !== 'string' || k.startsWith('@')) return; if (!U.has(k)) U.set(k, new Set()); U.get(k).add(tag); };
for (const k of Object.keys(CATALOG)) addU(k, '무게');
for (const k of Object.keys(LAB)) addU(k, '이름표');
for (const r of PV) { addU(r.item, r.on ? '곳간표:손' : '곳간표:손(꺼짐)'); addU(r.res, r.on ? '곳간표:econ' : '곳간표:econ(꺼짐)'); }
for (const k of M.Fishing.FISH_ITEMS) addU(k, '낚시표');
for (const k of Object.keys(M.Tidal.CATCH)) addU(k, '갯벌');
for (const g of Object.values(M.Chunk.GROVE_KINDS)) addU(g.item, '군락');
for (const r of Object.values(M.Granary.GRANARY_RECIPES)) { for (const k of Object.keys(r.from || {})) addU(k, '곳간재료'); for (const k of Object.keys(r.to || {})) addU(k, '곳간재료'); }
for (const st of M.Granary.GRANARY_STAGES) for (const k of Object.keys(st.need || {})) addU(k, '곳간재료');
for (const [k, r] of Object.entries(M.StoneUses.CRUDE_TOOLS)) { addU(k, '돌'); for (const c of Object.keys(r.cost || {})) addU(c, '돌'); }
for (const r of Object.values(M.Smelt.SMELT_RECIPES)) { for (const k of Object.keys(r.from || {})) addU(k, '제련'); for (const k of Object.keys(r.to || {})) addU(k, '제련'); }
for (const f of Object.values(M.Smelt.FURNACE_KINDS)) for (const st of f.stages) for (const k of Object.keys(st.need || {})) addU(k, '제련');
for (const st of M.Smelt.CHARCOAL_KILN_STAGES) for (const k of Object.keys(st.need || {})) addU(k, '제련');
for (const tbl of [M.Hut.HUT_STAGES, M.Well.WELL_STAGES]) for (const st of tbl) for (const k of Object.keys(st.need || {})) addU(k, '공정');
for (const r of Object.values(M.Hut.HUT_RECIPES)) { for (const k of Object.keys(r.from || {})) addU(k, '공정'); for (const k of Object.keys(r.to || {})) addU(k, '공정'); }
for (const k of Object.keys(M.Bridge.DECK_PER_CELL || {})) addU(k, '공정');
for (const m of M.Clothes.accepts()) addU('clothes_' + m, '옷');
for (const k of Object.keys(EQUIP_ICONS)) addU(k, '장비갈래');
for (const k of Object.keys(RECIPES)) addU(k, '도구');
for (const k of Object.keys(BUILDING_RECIPES)) addU(k, '건축품');
for (const p of PATHS) addU(p.item, p.on ? '동사' : '동사(꺼짐)');
for (const s of SURF) for (const k of s.keys) addU(k, '화면');
const KEYS = [...U.keys()].sort();

// ══ ⑦ 품목 줄 ════════════════════════════════════════════════════════════════════════════════════
// 길이 닿지 않는 까닭 — 손잡이 · 이 존에 없음 · 재료/도구/시설이 손에 안 듦(그 키를 댄다)
function whyOff(p) {
  if (!p.on) return p.knob || '꺼짐';
  const bad = [];
  for (const k of Object.keys(p.inputs)) if (tierOf(k) >= 3) bad.push(`재료 ${k}`);
  for (const t of p.tools) if (tierOf(t) >= 3) bad.push(`도구 ${t}`);
  if (p.facility && p.facility.length && Math.min(...p.facility.map(tierOf)) >= 3) bad.push(`시설 ${p.facility.join('/')}`);
  return bad.length ? `${bad.join(' · ')} 손에 안 듦` : '?';
}
// 장비 인스턴스의 그림 키(`equipPicKey` 가 내는 것) — 무게는 갈래 kg(`weights.kgOf(inst.type)`)이고 이름은 조합법 이름이라 키 표에 없어도 결함이 아니다
const EQUIP_PIC_KEYS = new Set(); for (const [type, r] of Object.entries(EQUIP)) for (const m of r.accepts) EQUIP_PIC_KEYS.add(equipPicKey(type, m));
// 보이는 이름 — 이름표 정본이 먼저 · 없으면 그 키를 부르는 조합법 이름(별표 — 이름표엔 없다)
function nameOf(k) {
  if (LAB[k]) return LAB[k];
  const l = (RECIPES[k] && RECIPES[k].label) || (COOK[k] && COOK[k].label) || (EQUIP[k] && EQUIP[k].label);
  return l ? l + '*' : null;
}
const GROUP_OF = {}; for (const [g, d] of Object.entries(GROUPS)) for (const k of ((d && d.items) || [])) GROUP_OF[k] = g;
const GROUP_AT = at(ICON_JS, /fetch\('\/assets\/icons\.lock\.json'\)/);
const lc = (k) => fs.existsSync(path.join(ICON_DIR, k + '.png'));
const ROWS = KEYS.map((k) => {
  const png = lc(k), rendered = ICON_RENDERED.has(k), lock = LOCK_ICONS.has(k);
  const g = GROUP_OF[k] || null, gd = g ? GROUPS[g] : null;
  const canBorrow = !!(gd && gd.icon && ICON_RENDERED.has(gd.icon));   // 클라 술어 그대로(대표가 구운 목록에 있어야 빌린다)
  const status = png ? 'own' : (gd && gd.icon ? `borrow:${g}` : 'none');
  const client = rendered ? '그림' : (canBorrow ? '빌림' : '점선');
  const tier = tierOf(k);
  const paths = PATHS.filter((p) => p.item === k).map((p) => ({ verb: p.verb, at: p.at, kind: p.kind, on: p.on, knob: p.knob, tier: TIERS[p.tier], reach: p.on && p.tier < 3 ? REACH[p.reachIdx] : null,
    req: p.req, inputs: p.inputs, tools: p.tools, facility: p.facility, days: p.days || 0, seasons: p.seasons, region: p.region }));
  const best = PATHS.filter((p) => p.item === k && p.on && p.tier === tier && tier < 3).sort((a, b) => (a.reachIdx - b.reachIdx) || (a.kind === 'trade') - (b.kind === 'trade'))[0] || null;
  const surfaces = SURF.filter((s) => s.keys.has(k));
  let reachIdx = aReachOf(k) === 9 ? 9 : aReachOf(k);
  for (const s of surfaces) reachIdx = Math.min(reachIdx, s.reach);
  const notes = [];
  if (png && !rendered) notes.push('PNG 있는데 ICON_RENDERED 에 없음(클라는 안 그린다)');
  if (rendered && !png) notes.push('ICON_RENDERED 에 있는데 PNG 없음');
  if (png !== lock && !argOf('--icons')) notes.push(png ? 'PNG 있는데 잠금 행 없음' : '잠금 행 있는데 PNG 없음');
  const eqKey = EQUIP_PIC_KEYS.has(k) && !(k in CATALOG);
  if (eqKey) notes.push('장비 인스턴스 그림 키(무게 = 갈래 kg · 이름 = 조합법 이름)');
  else {
    if (!(k in LAB)) notes.push('이름표 없음(화면에 영문 키)');
    if (!(k in CATALOG)) notes.push(`무게 없음(kgOfOrDefault → ${M.Weights.DEFAULT_KG}kg)`);
  }
  if (DISHES.indexOf(k) >= 0) notes.push('요리하면 요리 인스턴스(짐 칸 아님 · 내 요리 줄은 그림 칸 0)');
  const offWhy = tier >= 3 ? [...new Set(PATHS.filter((p) => p.item === k).map(whyOff))] : [];
  return {
    key: k, ko: LAB[k] || null, name: nameOf(k), labelFrom: LAB_FROM[k] || null, sources: [...U.get(k)], kg: k in CATALOG ? CATALOG[k] : null, equipKey: eqKey, offWhy,
    category: (M.Specialty.RESOURCES[k] && M.Specialty.RESOURCES[k].category) || null,
    pic: status, png, rendered, lock, group: g, groupIcon: gd ? gd.icon || null : null, client,
    tier: TIERS[tier], tierIdx: tier, seasons: seasOf(k), reach: reachIdx === 9 ? null : REACH[reachIdx], reachIdx,
    acqReach: aReachOf(k) === 9 ? null : REACH[aReachOf(k)], held: tier < 3,
    surfaces: surfaces.map((s) => s.name), best: best ? { verb: best.verb, at: best.at, req: best.req } : null, paths, notes,
  };
});
const ROW = new Map(ROWS.map((r) => [r.key, r]));

// ══ ⑧ 물고기 표 ══════════════════════════════════════════════════════════════════════════════════
{
  const pic = (k) => (ROW.get(k) ? ROW.get(k).pic : (lc(k) ? 'own' : 'none'));
  const rowOf = (k) => ROW.get(k);
  for (const s of (M.Fresh.T609_FRESH_TABLE ? M.Fresh.SPECIES_T609 : M.Fresh.SPECIES)) {
    const ws = s.waters.filter((w) => PLAYER_FRESH_WATERS.indexOf(w) >= 0);
    FISH_ROWS.push({ key: s.id, ko: s.ko, gear: '민물', where: s.waters.join('·'), when: s.seasons.length === 4 ? '사철' : s.seasons.map((x) => SEASON_KO[x]).join('·'),
      knob: `T593_SEA ${M.Fishing.T593_SEA ? '켬(기본)' : '꺼짐'}`, player: ws.length ? `잡힘(${ws.join('·')})` : `안 잡힘 — 사람 물 갈래 ${PLAYER_FRESH_WATERS.join('·')}`,
      kg: s.kg, pic: pic(s.id), tier: rowOf(s.id) ? rowOf(s.id).tier : '-' });
  }
  for (const r of M.Sea.TABLE) {
    if (r.gear === 'fresh' && FISH_ROWS.some((x) => x.key === r.id)) continue;   // 민물 표와 겹치는 줄(잉어) — 위 민물 줄이 그 종이다
    const inPool = M.Sea.SPECIES.some((s) => s.id === r.id);
    const gearKo = { rod: '해안 낚시', boat: '배 필요', hand: '손 채집(갯벌)', fresh: '민물 겹침' }[r.gear] || '미확인';
    const areas = r.areas ? Object.entries(r.areas).filter(([, v]) => v).map(([a, v]) => `${(M.Sea.AREAS.find((x) => x.id === a) || {}).ko || a} ${v}`).join(' · ') : '—';
    let knob = '기본';
    if (r.isNew) knob = `T602_NEW_FISH=1 (${M.Sea.T602_NEW_FISH ? '켬' : '꺼짐 — 품목 없음'})`;
    let player = inPool ? `잡힘(${r.spots ? r.spots.join('·') : '해안'})` : (r.gear === 'hand' ? (M.Tidal.CATCH[r.id] ? '갯벌 손 채집' : '사람 길 0') : (r.gear === 'fresh' ? (M.Fresh.isFish(r.id) ? '민물 표' : '사람 길 0(민물 표에 없음)') : '사람 길 0'));
    if (r.gear === 'boat') player = '사람 길 0(배 없음 캐논)';
    FISH_ROWS.push({ key: r.id, ko: (M.Specialty.RESOURCES[r.id] && M.Specialty.RESOURCES[r.id].ko) || r.ko || LAB[r.id] || r.id, gear: gearKo, where: areas,
      when: r.months ? r.months.join('·') + '월' : '—', knob, player, kg: r.kg ? r.kg.join('~') : null, pic: pic(r.id), tier: rowOf(r.id) ? rowOf(r.id).tier : '(품목 아님 — 무게·이름표 0)' });
  }
  for (const k of M.Fishing.FISH_ITEMS) if (!FISH_ROWS.some((x) => x.key === k)) FISH_ROWS.push({ key: k, ko: LAB[k] || k, gear: k === 'fish' ? 'econ 재화(생선)' : '옛 바이옴 표', where: '—', when: '—', knob: '—',
    player: (ROW.get(k) && ROW.get(k).held) ? '거래·곳간' : '사람 길 0', kg: null, pic: pic(k), tier: rowOf(k) ? rowOf(k).tier : '-' });
}

// ══ ⑨ 셈 · 출력 ═════════════════════════════════════════════════════════════════════════════════
const cnt = (arr, f) => arr.filter(f).length;
const own = cnt(ROWS, (r) => r.pic === 'own'), borrow = cnt(ROWS, (r) => r.pic.startsWith('borrow')), none = cnt(ROWS, (r) => r.pic === 'none');
const out = [];
const P = (s) => out.push(s);
P(`# T1067 품목 그림 전수 — 존 \`${ZONE}\` · 품목 ${ROWS.length} · own ${own} · borrow ${borrow} · none ${none}`);
P('');
P(`**자** \`scripts/t1067-item-census.js\` · 아이콘 폴더 \`${path.relative(ROOT, ICON_DIR).startsWith('..') ? ICON_DIR : (path.relative(ROOT, ICON_DIR) || '.')}\` · 하루 = ${DAY_MS / 60000}실분(${AT.dayMs} · 읽는 자리 ${AT.seasonDayMs}) ⇒ 실시간 1시간 = **${GATE_DAYS}게임일** · 한 해 ${YEAR_DAYS}일`);
P('');
P('**단(손에 드는 때) 규칙** — 길의 단 = max(재료의 단 · 도구/시설마다 그 단+1 · 게임일 시간 문 ≤' + GATE_DAYS + '일이면 첫날·넘으면 이후 · 거래/곳간/게시판/장인 구매/위세품 대금이면 이후) · 품목의 단 = 가장 이른 길. 철·자리는 단을 안 바꾼다(`철`·`보는 사람` 칸). 손잡이 꺼진 길은 단에 안 든다.');
P(`**보는 사람** — ${REACH.join(' > ')} · 길 = 동사 칸과 재료 칸 중 좁은 쪽 · 품목 = 길·화면 칸 중 넓은 쪽.`);
P(`**시작 짐** — 사람: {${Object.entries(L_START.value).map(([k, n]) => `${k}: ${n}`).join(', ')}} (${AT.start} · central 행 기본 \`'{}'\` ${AT.centralDefault}) ⇒ 양수 칸 ${START_POSITIVE.length ? START_POSITIVE.join(' · ') : '0 — 빈손'}. 주민(NPC) 몸 리터럴 ${NPC_START.join(' · ')}(${AT.npcStart})은 사람 것 아님.`);
P(`**손잡이(이 판이 읽은 값)** — T593_SEA ${M.Fishing.T593_SEA ? '켬' : '끔'} · T602_SEA_TABLE ${M.Sea.T602_SEA_TABLE ? '켬' : '끔'} · T602_NEW_FISH ${M.Sea.T602_NEW_FISH ? '켬' : '끔'} · T609_FRESH_TABLE ${M.Fresh.T609_FRESH_TABLE ? '켬' : '끔'} · T694 사냥고기 ${M.GameMeat.on() ? '켬' : '끔'} · T877(곳간 건굴·마른 미역) ${M.Specialty.T877_ON ? '켬' : '끔'} · T450_WILD_GROVES ${WILD_ON ? '켬' : '끔'} · ENABLE_WILDLIFE ${HOSTILES_ON ? '켬' : '끔'} · 시대 ${M.Era.currentEra ? M.Era.currentEra() : '?'} · 낚시 도구 검사 ${FISH_TOOL_GATE ? '있음' : '0(T1065 미착지)'}`);
P('');
P('## 셈');
P('| 항목 | 수 |');
P('|---|---|');
{
  const screenOnly = ROWS.filter((r) => r.sources.every((s) => s === '화면')).map((r) => r.key);
  P(`| 품목 키 전수 | **${ROWS.length}** = 카드 합집합 ${ROWS.length - screenOnly.length} + 화면에서만 보이는 키 ${screenOnly.length}(${screenOnly.join(' · ')}) · T472 324 |`);
}
P(`| 그림 own(PNG 있음) | ${own} |`);
P(`| 그림 borrow(갈래 대표 — T481 임시) | ${borrow} (${Object.entries(GROUPS).filter(([, d]) => d && d.icon).map(([g]) => `${g} ${cnt(ROWS, (r) => r.pic === 'borrow:' + g)}`).join(' · ')}) |`);
P(`| 그림 none(점선 칸) | ${none} |`);
P(`| 클라가 실제로 그리는 것 — 그림 · 빌림 · 점선 | ${cnt(ROWS, (r) => r.client === '그림')} · ${cnt(ROWS, (r) => r.client === '빌림')} · ${cnt(ROWS, (r) => r.client === '점선')} |`);
P(`| PNG ↔ ICON_RENDERED ↔ 잠금 어긋남 | ${cnt(ROWS, (r) => r.png !== r.rendered)} · ${cnt(ROWS, (r) => r.png !== r.lock)} |`);
{
  const pngs = fs.existsSync(ICON_DIR) ? fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : [];
  const off = pngs.filter((k) => !U.has(k));
  P(`| PNG 인데 품목 키 아님 | ${off.length}${off.length ? ` (${off.join(' · ')})` : ''} |`);
}
P(`| 손에 드는 품목(단 < 손에 안 듦) | ${cnt(ROWS, (r) => r.held)} |`);
P('');
P('## 출처별(한 품목이 여러 출처에 든다)');
P('| 출처 | 품목 | own | borrow | none |');
P('|---|---|---|---|---|');
{
  const tags = [...new Set(ROWS.flatMap((r) => r.sources))].sort();
  for (const t of tags) { const rs = ROWS.filter((r) => r.sources.indexOf(t) >= 0); P(`| ${t} | ${rs.length} | ${cnt(rs, (r) => r.pic === 'own')} | ${cnt(rs, (r) => r.pic.startsWith('borrow'))} | ${cnt(rs, (r) => r.pic === 'none')} |`); }
}
P('');
P('## 단 × 그림');
P('| 단 | own | borrow | none | 합 |');
P('|---|---|---|---|---|');
for (let t = 0; t < 4; t++) { const rs = ROWS.filter((r) => r.tierIdx === t); P(`| ${TIERS[t]} | ${cnt(rs, (r) => r.pic === 'own')} | ${cnt(rs, (r) => r.pic.startsWith('borrow'))} | ${cnt(rs, (r) => r.pic === 'none')} | ${rs.length} |`); }
P(`| 합 | ${own} | ${borrow} | ${none} | ${ROWS.length} |`);
P('');
P('## 단 × 보는 사람 (none · borrow 만)');
P(`| 단 | ${REACH.join(' | ')} | 없음 |`);
P(`|---|${REACH.map(() => '---').join('|')}|---|`);
for (let t = 0; t < 4; t++) { const rs = ROWS.filter((r) => r.tierIdx === t && r.pic !== 'own'); P(`| ${TIERS[t]} | ${REACH.map((_, i) => cnt(rs, (r) => r.reachIdx === i)).join(' | ')} | ${cnt(rs, (r) => r.reachIdx === 9)} |`); }
P('');
P('## 그림 없는 품목(none · borrow) — 차례: 단 → 보는 사람 → 점선(none) 먼저 · 빌림 뒤 → 사철 먼저 → 보이는 곳 수 → 키');
P('| # | 키 | 이름 | 그림 | 단 | 철 | 보는 사람 | 보이는 곳 | 길(파일:줄 · 요구) |');
P('|---|---|---|---|---|---|---|---|---|');
const nSeas = (r) => (r.seasons ? r.seasons.length : 4);
const PRIO = ROWS.filter((r) => r.pic !== 'own').sort((a, b) => (a.tierIdx - b.tierIdx) || (a.reachIdx - b.reachIdx)
  || ((a.pic === 'none' ? 0 : 1) - (b.pic === 'none' ? 0 : 1)) || (nSeas(b) - nSeas(a)) || (b.surfaces.length - a.surfaces.length) || a.key.localeCompare(b.key));
PRIO.forEach((r, i) => {
  const why = r.best ? `${r.best.verb} ${r.best.at} · ${r.best.req}` : (r.paths.length ? `닿는 길 0 — ${r.offWhy.slice(0, 2).join(' · ')}` : `사람 길 0 · 출처 ${r.sources.join('·')}`);
  P(`| ${i + 1} | \`${r.key}\` | ${r.name || '—'} | ${r.pic} | ${r.tier} | ${r.seasons ? r.seasons.map((x) => SEASON_KO[x]).join('·') : ''} | ${r.reach || '—'} | ${r.surfaces.join(' · ') || (r.held ? '짐 창' : '—')} | ${why.replace(/\|/g, '/')} |`);
});
P('');
P('`*` = 이름표 정본에 없어 조합법 이름을 대신 적음(화면 짐·알림 줄에는 영문 키가 뜬다) · `보이는 곳` 의 짐 창은 손에 드는 모든 품목에 공통이라 다른 곳이 없을 때만 적음.');
P('');
P('## 물고기 표');
{
  // 이 존의 해역 — 해안 구간 정본(`public/coast-shape.js SECTIONS`) → `seafish.SECTION_AREAS`(바다 낚시가 그 자리에서 읽는 그 표)
  let zoneAreas = '?';
  try {
    const CS = require(path.join(ROOT, 'public', 'coast-shape.js'));
    const ids = new Set(); for (const s of CS.SECTIONS) if (s.zone === ZONE) for (const a of (M.Sea.SECTION_AREAS[s.as || s.id] || [])) ids.add(a);
    zoneAreas = [...ids].map((a) => (M.Sea.AREAS.find((x) => x.id === a) || {}).ko || a).join('·') || '없음(해안 구간 0)';
  } catch (e) { zoneAreas = `? (${e.message})`; }
  P(`민물 = \`freshfish.js\` (${AT.fresh}) · 바다 = \`seafish.js TABLE\` (${AT.seaTable}) · 낚시 품목 = \`fishing.FISH_ITEMS\` (${AT.fishItems}) · 갯벌 = \`tidal.CATCH\` (${AT.tidal}) · 사람 민물 갈래 = \`_t593Water\` 가 내는 ${PLAYER_FRESH_WATERS.join('·')} (${AT.t593Water}) · 이 존 해역 = ${zoneAreas}(해역은 흔함 가중만 · 풀을 거르지 않는다)`);
}
P('| 키 | 이름 | 잡는 자리 | 물 · 해역(흔함) | 철 · 달 | 손잡이 | 사람 낚시(이 판) | kg | 그림 | 단 |');
P('|---|---|---|---|---|---|---|---|---|---|');
for (const f of FISH_ROWS) P(`| \`${f.key}\` | ${f.ko} | ${f.gear} | ${f.where} | ${f.when} | ${f.knob} | ${f.player} | ${f.kg == null ? '—' : f.kg} | ${f.pic} | ${f.tier} |`);
P('');
P('## 놀람');
{
  const noLab = ROWS.filter((r) => r.held && !r.ko && !r.equipKey).map((r) => r.key);
  const XW = M.Specialty.EXTRA_WEIGHT || {};   // 채굴 짐 상한이 쓰는 곁 무게 표(무게 정본 catalog 밖)
  const noKg = ROWS.filter((r) => r.held && r.kg == null && !r.equipKey).map((r) => (r.key in XW ? `${r.key}(specialty.EXTRA_WEIGHT ${XW[r.key]}kg 에만)` : r.key));
  const seenNoLab = ROWS.filter((r) => !r.held && !r.ko && r.surfaces.length && !r.equipKey).map((r) => r.key);
  const verbOnly = ROWS.filter((r) => r.sources.every((s) => /^동사|^화면/.test(s))).map((r) => r.key);
  const verbOut = new Set(PATHS.filter((p) => p.on && p.tier < 3).map((p) => p.item));
  const verbNoTable = [...verbOut].filter((k) => !k.startsWith('@') && (!(k in CATALOG) || !(k in LAB)) && !EQUIP_PIC_KEYS.has(k)).sort().map((k) => `${k}(${[!(k in LAB) && '이름표', !(k in CATALOG) && '무게'].filter(Boolean).join('·')} 없음)`);
  const offPaths = ROWS.filter((r) => !r.held && r.paths.length).map((r) => `${r.key}(${r.offWhy.slice(0, 2).join(' · ')})`);
  P(`- 동사가 짐에 넣는데 **표에 빠진 것**: ${verbNoTable.length ? verbNoTable.join(' · ') : '0'}`);
  P(`- 손에 드는데 **이름표 없음**(장비 그림 키 제외): ${noLab.length ? noLab.join(' · ') : '0'}`);
  P(`- 손에 드는데 **무게 표 없음**(kgOfOrDefault ${M.Weights.DEFAULT_KG}kg · 장비 그림 키 제외): ${noKg.length ? noKg.join(' · ') : '0'}`);
  P(`- 손에 안 드는데 화면에 그림 칸이 서고 이름표도 없는 것: ${seenNoLab.length ? seenNoLab.join(' · ') : '0'}`);
  P(`- 무게·이름표·대응표 어디에도 없이 동사·화면에서만 나온 키: ${verbOnly.length ? verbOnly.join(' · ') : '0'}`);
  P(`- 길은 있는데 닿지 않는 것(손잡이 · 이 존에 없음 · 재료가 안 듦): ${offPaths.length ? offPaths.join(' · ') : '0'}`);
  P(`- 요리하면 요리 인스턴스(짐 칸 아님 · ${AT.cookDish}) — ${DISHES.join(' · ')} · 짐 품목이 되는 요리는 \`item: true\` 줄뿐(${AT.cookItem})`);
  P(`- 그림 칸이 없는 화면(글자만): ${TEXT_ONLY.map(([n, a]) => `${n} ${a}`).join(' · ')}`);
  P(`- 사람 손에 \`seed_berry\` 가 오는 길 0 — 덤불은 사람(ctx.day)에게 철 씨앗을 준다(${AT.lootBushSeed}) · \`seed_berry\` 는 주민 갈래(${AT.lootNpcSeed}) ⇒ \`item_farmland\` 손 제작(seed_berry 1)은 사람이 못 한다(밭은 심기가 세운다)`);
  // 사슬을 늦추는 재료 — 단계 짓기(노 · 숯가마)의 재료 중 첫날보다 늦은 것(그 재료의 가장 이른 길)
  const slow = [];
  for (const p of PATHS.filter((x) => x.on && x.item.startsWith('@') && !/^@(wildseed|ironware)$/.test(x.item))) for (const k of Object.keys(p.inputs)) {
    if (tierOf(k) < 2) continue; const b = PATHS.find((x) => x.item === k && x.on && x.tier === tierOf(k));
    slow.push(`${p.verb} ← ${k} ${TIERS[tierOf(k)]}(${b ? b.verb : '길 0'})`);
  }
  P(`- 단계 짓기를 늦추는 재료: ${slow.length ? [...new Set(slow)].join(' · ') : '0'}`);
  // 이름표 글자가 같은 짝 — 단이 갈리면 화면엔 같은 이름인데 손에 드는 것은 하나뿐이다
  const byKo = {}; for (const r of ROWS) if (r.ko) (byKo[r.ko] = byKo[r.ko] || []).push(r);
  const pairs = Object.entries(byKo).filter(([, rs]) => rs.length > 1 && new Set(rs.map((r) => r.tierIdx)).size > 1)
    .map(([ko, rs]) => `${ko}: ${rs.map((r) => `${r.key} ${r.tier}·${r.pic}`).join(' / ')}`);
  P(`- 이름표가 같은데 단이 갈리는 짝: ${pairs.length ? pairs.join(' · ') : '0'}`);
  // 단 `?` — 코드로 못 가른 것(조건 줄을 평가하지 못함 · 닿지 않는데 까닭을 못 댐)
  const q = ROWS.filter((r) => r.offWhy.indexOf('?') >= 0).map((r) => r.key).concat(PV.filter((r) => r.on === null).map((r) => `${r.item}(곳간표 조건 평가 실패 ${r.at})`));
  P(`- 단 \`?\`(코드로 못 가름): ${q.length ? q.join(' · ') : '0'}`);
}
if (MISSING.length) { P(''); P('## 근거 정규식을 못 찾음(소스가 바뀌었다 — 그 칸은 `:?`)'); for (const m of MISSING) P(`- ${m}`); }

if (JSON_OUT) {
  const outPath = path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(ROOT, JSON_OUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    card: 'T1067', zone: ZONE, iconDir: path.relative(ROOT, ICON_DIR), dayMs: DAY_MS, gateDays: GATE_DAYS, tiers: TIERS, reach: REACH,
    knobs: { T593_SEA: M.Fishing.T593_SEA, T602_SEA_TABLE: M.Sea.T602_SEA_TABLE, T602_NEW_FISH: M.Sea.T602_NEW_FISH, T609_FRESH_TABLE: M.Fresh.T609_FRESH_TABLE,
      T694_GAME_MEAT: M.GameMeat.on(), T877_ON: M.Specialty.T877_ON, T450_WILD_GROVES: WILD_ON, ENABLE_WILDLIFE: HOSTILES_ON, fishToolGate: FISH_TOOL_GATE },
    totals: { keys: ROWS.length, own, borrow, none },
    start: { player: L_START.value, at: AT.start, npc: L_NPC_INV.value, npcAt: AT.npcStart },
    surfaces: SURF.map((s) => ({ name: s.name, reach: REACH[s.reach], at: s.at, keys: [...s.keys].sort() })), textOnly: TEXT_ONLY,
    dishes: DISHES, rows: ROWS, priority: PRIO.map((r) => r.key), fish: FISH_ROWS, anchors: AT, missingAnchors: MISSING,
  }, null, 1) + '\n');
  P('');
  P(`JSON → \`${path.relative(ROOT, outPath)}\` (${ROWS.length}줄)`);
}
_log(out.join('\n'));
