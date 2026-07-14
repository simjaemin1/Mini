// ═══════════════════════════════════════════════════════════════════════════
// war-core.js — 전쟁실험실.html 의 NPC 마을 전쟁 "경제 층"만 순수 추출(P1).
//   ★[P1 범위] 경제 층만: 명분(casus·J)·원한 EMA·트라우마·개인편성(conscript)·동원(warMobilize)·
//     headless 전투 판정(battle-core createBattle)·결과 되먹임(약탈·조공·warKill·노획·품질 가중평균)·
//     동원 생산정지(_laborMul)·봉쇄(_siegeBlock)·원한 교역제재(_grudgeBlock).
//   ★[P1 제외] 전투 실체·개별 병사·행군·맵 좌표·broadcast·렌더·포로 이송 — 전부 P2~P4(호스트).
//   ★[2파 재동기 2026-07-12] 공성 결단·siege 상태머신은 이제 이 모듈이 소유(§15 작전층 — 랩 블록B 7890~8140의
//     일 단위 어댑터): march→camp→{assault|siege|withdraw}, 자동 개전 폐지(eta=도착·결단), 공성팩, 방어 3택+sortie,
//     무혈 항복(절박 완화·공납 음수 하한 — 랩 최신), 무저항 함락(walkover — 유령 유닛 0). _siegeBlock 설치가
//     'march 창'(P1 단순화)에서 'siege 상태'로 이동. WAR_OPS=0 → 전부 봉인(P1 궤적 폴백). 실체 개전은
//     opts.onEngage(w,day,why) 훅으로 호스트(villages.js P3)에 위임 — true 반환(phase='battle') 시 되먹임은 실체 경로.
//   ★ battle-core.js 무수정 재사용(createBattle 인스턴스 경로 = 결정론 rng 주입). economy-sim 무수정
//     (무기 숙련 _ws*는 econ.npcs 에 lazy 부착 — 엔진이 안 건드리는 키, serializeEcon 자동 포섭).
//   ★ 결정론: Math.random 미사용. 호출측이 주입한 rng(makeRng)만 사용. VILS/ECON_WORLD 전역 대신
//     createWar({villages, world, ...}) 클로저 주입. 전쟁 상태는 전부 econ(plain object)에 두어
//     serializeEcon 이 자동 영속(Map 금지 — JSON.stringify(Map)={} 로 소실).
//   Node(module.exports) / 브라우저(window.WarCore) dual export (battle-core 패턴).
// ═══════════════════════════════════════════════════════════════════════════
;(function (root) {
'use strict';

// ── battle-core 의존(headless 판정) ──
var BattleCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
  ? require('./battle-core.js')
  : root.BattleCore;

// ═══════════ 결정론 RNG (lab _muRng/_warCapRng 와 동형 xorshift32) ═══════════
function makeRng(seed) { let s = (seed >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hash2(a, b) { let h = (Math.imul((a >>> 0), 374761393) + Math.imul((b >>> 0), 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; }

// ═══════════ 달력(lab L_YEAR/lMonth 복사 — 농번기 억제 게이트용) ═══════════
const L_YEAR = 365, L_MOSTART = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function lMonth(d) { const y = ((d % L_YEAR) + L_YEAR) % L_YEAR; for (let m = 11; m >= 0; m--) if (y >= L_MOSTART[m]) return m; return 0; }

// ═══════════ WAR_* 상수 (전쟁실험실.html 5961~6034 verbatim) ═══════════
// WAR_MINDAY 는 테스트 전용 오버라이드(BANDIT_MINDAY 관례 — 운영 무설정=365 그대로)
const WAR_MIN_DAY = (typeof process !== 'undefined' && process.env && parseInt(process.env.WAR_MINDAY || '', 10)) || 365;
const WAR_GRUDGE_UP = 0.30, WAR_GRUDGE_CAS = 0.05, WAR_GRUDGE_DK = 0.995, WAR_FEUD_TH = 0.28;
const WAR_FAT_CAS = 0.06, WAR_FAT_DK = 0.992, WAR_FAT_GATE = 0.55, WAR_CD = 60;
const WAR_CAS_W = 0.12, WAR_UTIL_TH = 1.5, WAR_TRAUMA_UP = 0.5, WAR_TRAUMA_DK = 0.99;
const WAR_AUX_MULT = 0.25;
const WAR_MARCH = 1440;                 // 셀/맵일(창방패 기준 — lab: L_WALK 2 × L_MINDAY 1440 × MARCH_SUSTAIN 0.5)
const WAR_FOOD_CRISIS = 18, WAR_FOOD_RICH = 45, WAR_RANGE = 520, WAR_LEVY = 0.35, WAR_RAID_MIN = 2, WAR_RATION = 1.0;
const WAR_CAS_BASE = 0.18, WAR_LOOT = 0.3, WAR_LOOT_PREST = 0.5, WAR_TRIB_YRS = 3, WAR_TRIB_RATE = 0.08, WAR_TRIB_INT = 90, WAR_PAL_WOOD = 40, WAR_PAL_MAX = 0.35;
// 전쟁 정의 J
const WAR_J_CASUS = { feud: 1.0, territory: 0.7, trade: 0.6, prestige: 0.4 };
const WAR_J_LOOT0 = 0.12, WAR_J_LOOT1 = 0.28;
const WAR_J_PREST0 = 0.3, WAR_J_PREST1 = 0.7;
const WAR_J_BURN = 3.5;   // ★[감사 2026-07-14] 방화 = 랩 관찰층 전용(walkover builtFloors--) — 서버는 집이 econ 비결합이라 미배선(엔티티 부채 §6.1). export만 존재·서버 미참조(死상수 — 삭제 대신 랩 계약 보존).
const WAR_J_FAT = 0.3;
const WAR_REP_TH = 0.5, WAR_REP_K = 0.35;
const WAR_GRUDGE_BLOCK_TH = 0.45;
// 무기 드랍·궤주 투기
const WAR_SALV_DEAD = 0.7, WAR_SALV_DESERT = 0.5;
const WAR_DESERT_P0 = 0.25, WAR_DESERT_PM = 0.5;
// 편성 → battle-core spec
const _warWEAP_Q_STONE = 0.5, _warSWORD_FRAC_INIT = 0.5;
const _warBRONZE_TIN_MIN_ABS = 13, _warBRONZE_TIN_MIN_PC = 0.95;
const WAR_BRONZE_WEAPQ_TH = 0.30, WAR_BRONZE_WEAPQ_CAP = 0.55;
const LEVY_SPEAR_FRAC = 0.55, LEVY_PIKE_FRAC = 0.15;
const WAR_MAX_ARMY = 60, WAR_ENGAGE_MAX = 44, WAR_DEF_ENGAGE_RATIO = 1.6, WAR_DEF_ENGAGE_MIN = 1.15;
const WAR_BATTLE_DT = 0.05, WAR_BATTLE_MAXTICK = 4000;
// NPC 동원 알고리즘
const WAR_CASUS_MOB = { feud: 1.1, prestige: 1.1, trade: 1.3, territory: 1.3, existential: 1.6 };
const WAR_HOME_KEEP_FRAC = 0.25, WAR_HOME_KEEP_WAR = 0.5, WAR_SUPPLY_DIST_K = 0.06, WAR_MOB_ODDS_MIN = 0.42;
// 봉쇄(econ 훅) — ★[2파 작전층] 설치 주체가 'march 창'(P1 단순화)에서 'siege 상태'로 이동(WAR_OPS=0 폴백만 구 방식)
const WAR_SIEGE_OUTMUL = 0.15;
// ═══════════ ★[3파 포로 §18] 상수 (전쟁실험실.html 6213~6218 verbatim) — "포로는 잡히는 게 아니라 끌려간다" ═══════════
//   결판(전투·전장 장악) 시 패자 사상 판정자의 35%는 사망 대신 기절→포로. 상한 = round(J×후보)(불의전은 포로 권리도 작음)
//   && 승자 병력×0.5(호송 능력). 초과분 방면(귀향). 항복 협상·무저항 함락 = 사상 0 → 후보 0(자연 무포로).
//   엔티티 연속: npc '객체'를 패자 econ.npcs에서 splice→승자 econ.npcs로 push(createNPC 금지 — age·skills 보존).
//   노동은 econ v1 훅(captive ×0.6·전사/사냥꾼 금지 — 기도달·미설치=무해)이 즉시 반응. WAR_CAPTIVES=0 게이트.
const WAR_CAP_FRAC = 0.35;       // 패자 사상 판정자 중 기절(포로 후보) 비율
const WAR_CAP_ESCORT = 0.5;      // 호송 상한 = 승자 생존 병력 × 이 값
const WAR_CAP_ASSIM = 1080;      // 동화(3년) — since+1080일 경과 시 captive 해제(정식 주민)
const WAR_CAP_ESC0 = 0.002, WAR_CAP_ESC1 = 0.004, WAR_CAP_ESC_D = 500;   // 일일 탈출 p = 0.002+0.004×max(0,1−고향거리/500)
const WAR_CAP_RANSOM_INT = 30, WAR_CAP_RANSOM_P = 0.15, WAR_CAP_RANSOM_FOOD = 40, WAR_CAP_RANSOM_FD = 60, WAR_CAP_RANSOM_GR = 0.4; // 몸값: 30일 주기 p0.15·식량 40/명·고향 여유>60일치·원한<0.4
const WAR_CAP_ON = !(typeof process !== 'undefined' && process.env && process.env.WAR_CAPTIVES === '0');
// 개전 EU 기대 포로 가치(명당) — ★[3파] 0→8 활성(랩 최신): 사람=재화(청동기 고증 — 인구가 최대 자원). 과도 시 하향.
const WAR_CAP_EU = WAR_CAP_ON ? 8 : 0;
// ═══════════ ★[2파 작전층 · §15] 상수 (전쟁실험실.html 7907~7919 verbatim — WAR_SIEGE_R 제외: 추상층은 eta=링 도착) ═══════════
//   "전투는 수단, 전쟁은 선택의 연속" — march→camp→{assault|siege|withdraw} 상태기계. ★자동 개전 폐지:
//   eta 도달=도착·결단이지 개전이 아니다. LiveBattle/헤드리스 전투는 오직 ①공격 assault 결단 ②방어 sortie 결단에서만.
//   랩은 프레임 틱(블록B tickWarGroups) 소유 — 서버 추상층은 daily(일 단위) 어댑터(결정론 rng 시드 랩 동형).
const WAR_SIEGE_PACK = 12;         // 동원 시 공성 군량 적재(일분) — 행군분(marchDays×2)과 별도. camp/siege 1일=병력×WAR_RATION 소모
const WAR_PACK_CRIT = 3;           // 군량 잔량 임계(일) — 미만이면 도박 돌격 or 철수 강제
const WAR_ASSAULT_ODDS = 0.58;     // 결단: 이 승산 이상이면 즉시 돌격(포위 소모전보다 낫다)
const WAR_GAMBLE_ODDS = 0.38;      // 군량 임계 시 도박 돌격 하한(미만=철수)
const WAR_HOLD_GAMBLE = 0.45;      // 소모전 열세(팩≤곳간추정)일 때 돌격 전환 하한(미만=철수)
const WAR_SORTIE_ODDS = 0.60;      // 방어 출격(sortie) 승산 문턱
const WAR_DEF_RESPOND_ODDS = 0.52; // 방어 응전 소집 문턱(전력비 유리)
const WAR_SURR_FOODD = 5;          // 무혈 항복: 방어 곳간 일수 임계
const WAR_SURR_ODDS = 0.25;        // 무혈 항복: 응전 승산 절망 문턱(곳간<2일이면 ×2.2 절박 완화 — 랩 최신 수리)
const WAR_DEF_HYST = 2;            // 방어 태세(응전↔버티기) 전환 최소 간격(일)
// ENABLE 게이트 관례: WAR_OPS=0 → 작전층 완전 봉인(P1 폴백: eta 즉시 headless + march 창 봉쇄 — 기존 궤적 그대로).
const WAR_OPS_ON = !(typeof process !== 'undefined' && process.env && process.env.WAR_OPS === '0');

const _clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

// ═══════════ 청동 자격(economy _bronzeCapable 판정 재현) ═══════════
function _warBronzeCapable(v) { if (((v.land && v.land.tin) || 0) > 0) return true; const N = v.npcs ? v.npcs.length : 1; return ((v.storage && v.storage.tin) || 0) >= Math.max(_warBRONZE_TIN_MIN_ABS, N * _warBRONZE_TIN_MIN_PC); }

// ═══════════════════════════════════════════════════════════════════════════
// 개인 무기 숙련 (economy npc 에 lazy 부착 — RNG 미사용·순수 초기화·serializeEcon 자동 포섭)
//   활은 기존 사냥 숙련(skills.archery) 공유(추가 필드 없음).
// ═══════════════════════════════════════════════════════════════════════════
const WAR_WSKILL_MAX = 10;
const WAR_WS_INIT = {
  warrior: { sword: 4.2, spear: 4.2, sling: 0.5 }, hunter: { sword: 0.4, spear: 0.6, sling: 1.2 },
  fisher: { sword: 0.3, spear: 2.4, sling: 0.5 }, farmer: { sword: 1.0, spear: 1.4, sling: 0.4 },
  lumberjack: { sword: 1.8, spear: 0.6, sling: 0.4 }, forager: { sword: 0.3, spear: 0.4, sling: 2.6 },
  miner: { sword: 0.4, spear: 1.8, sling: 0.6 }, mason: { sword: 0.5, spear: 1.8, sling: 0.5 }, smith: { sword: 2.2, spear: 0.8, sling: 0.3 },
  weaponsmith: { sword: 2.6, spear: 1.0, sling: 0.3 }, armorsmith: { sword: 1.6, spear: 0.8, sling: 0.3 },
  cook: { sword: 0.2, spear: 0.3, sling: 0.3 }, merchant: { sword: 0.4, spear: 0.4, sling: 0.5 }
};
const WAR_WS_INIT_DEF = { sword: 0.3, spear: 0.4, sling: 0.4 };
const WAR_WS_TRAIN = { warrior: { sword: 0.014, spear: 0.014, sling: 0.002 } };
const WAR_WS_VET_GAIN = 0.9;

function _warEnsureWSkills(npc) {
  if (!npc || npc._wsInit) return;
  const base = WAR_WS_INIT[npc.currentJob] || WAR_WS_INIT_DEF;
  if (npc._wsSword == null) npc._wsSword = base.sword;
  if (npc._wsSpear == null) npc._wsSpear = base.spear;
  if (npc._wsSling == null) npc._wsSling = base.sling;
  npc._wsInit = 1;
}
function warNPCWSkill(npc, wtype) {
  if (!npc) return 0; _warEnsureWSkills(npc);
  if (wtype === 'bow') return npc.skills ? (npc.skills.archery || 0) : 0;
  if (wtype === 'sword') return npc._wsSword || 0;
  if (wtype === 'spear') return npc._wsSpear || 0;
  if (wtype === 'sling') return npc._wsSling || 0;
  return 0;
}
function warJobWeaponType(job) {
  switch (job) {
    case 'warrior': return 'sword';
    case 'hunter': return 'bow';
    case 'fisher': return 'spear';
    case 'farmer': return 'spear';
    case 'lumberjack': return 'axe';
    case 'forager': return 'sling';
    case 'miner': return 'spear';
    case 'mason': return 'spear';
    case 'smith': return 'sword';
    case 'weaponsmith': return 'sword';
    case 'armorsmith': return 'sword';
    default: return 'militia';
  }
}
function warTickWeaponSkills(e) {
  if (!e || !e.npcs) return;
  for (const npc of e.npcs) {
    _warEnsureWSkills(npc);
    const tr = WAR_WS_TRAIN[npc.currentJob]; if (!tr) continue;
    if (tr.sword) npc._wsSword = Math.min(WAR_WSKILL_MAX, (npc._wsSword || 0) + tr.sword);
    if (tr.spear) npc._wsSpear = Math.min(WAR_WSKILL_MAX, (npc._wsSpear || 0) + tr.spear);
    if (tr.sling) npc._wsSling = Math.min(WAR_WSKILL_MAX, (npc._wsSling || 0) + tr.sling);
  }
}
function warVeteranGrowth(e, roster) {
  if (!e || !roster) return; const arr = Array.isArray(roster) ? roster : [roster];
  for (const it of arr) {
    const npc = it.npc || it; const wt = it.wtype || it._veteranWType; if (!npc || !wt) continue; _warEnsureWSkills(npc);
    if (wt === 'bow') { if (npc.skills) npc.skills.archery = Math.min(WAR_WSKILL_MAX, (npc.skills.archery || 0) + WAR_WS_VET_GAIN); }
    else if (wt === 'spear') npc._wsSpear = Math.min(WAR_WSKILL_MAX, (npc._wsSpear || 0) + WAR_WS_VET_GAIN);
    else if (wt === 'sling') npc._wsSling = Math.min(WAR_WSKILL_MAX, (npc._wsSling || 0) + WAR_WS_VET_GAIN);
    else npc._wsSword = Math.min(WAR_WSKILL_MAX, (npc._wsSword || 0) + WAR_WS_VET_GAIN);
  }
}
function warSlingerCapByStone(e) { const stone = (e && e.storage && e.storage.stone) || 0; const per = (BattleCore.STONES_PER || 15); return Math.floor(stone / per); }

// ═══════════════════════════════════════════════════════════════════════════
// 개인 기반 편성 — 각 주민(직업 도구→무기)+개인 숙련+마을 재고 → 병종 확정(pure·econ 입력).
// ═══════════════════════════════════════════════════════════════════════════
function _warConscriptIndividual(v, mode, opts) {
  opts = opts || {};
  const e = v.econ || v; if (!e || !e.npcs || !e.npcs.length) return null;
  const N = e.npcs.length, c = e.counts || {}, warrior = Math.round(c.warrior || 0), hunter = Math.round(c.hunter || 0);
  const defense = !!opts.defense;
  let force;
  if (defense) { force = Math.max(1, N - 1); }
  else if (opts.forceCount != null) { force = Math.max(0, Math.round(opts.forceCount)); force = Math.min(force, N - 2); if (force < WAR_RAID_MIN) return null; }
  else if (opts.mobFrac != null) { force = Math.round((N - 1) * _clamp01(opts.mobFrac)); force = Math.min(force, N - 2); if (force < WAR_RAID_MIN) return null; }
  else { force = (mode === 'raid') ? warrior + hunter : warrior + Math.round((N - warrior) * WAR_LEVY); force = Math.min(force, N - 2); if (force < WAR_RAID_MIN) return null; }
  if (force < 1) return null;
  const pool = e.npcs.filter(n => !n.captive);
  if (!pool.length) return null;
  const prio = n => { const j = n.currentJob; return (j === 'warrior' ? 1000 : 0) + (j === 'hunter' ? 800 : 0) + (j === 'fisher' ? 90 : 0) + (j === 'miner' ? 85 : 0) + (j === 'lumberjack' ? 80 : 0) + (j === 'forager' ? 70 : 0) + (j === 'farmer' ? 40 : 0) + (j === 'smith' || j === 'weaponsmith' || j === 'armorsmith' ? 120 : 0) + 30; };
  const idxOf = new Map(); for (let i = 0; i < pool.length; i++) idxOf.set(pool[i], i);
  pool.sort((a, b) => prio(b) - prio(a) || idxOf.get(a) - idxOf.get(b));
  const draft = pool.slice(0, Math.min(force, pool.length));
  if (!draft.length) return null;
  const soldiers = [];
  for (let i = 0; i < draft.length; i++) {
    const npc = draft[i]; let want = warJobWeaponType(npc.currentJob);
    if (npc.currentJob === 'farmer' && (idxOf.get(npc) % 4 === 0)) want = 'sword';
    soldiers.push({ npc, want, wskill: warNPCWSkill(npc, want) });
  }
  const weapon = e.storage.weapon || 0;
  const swordFrac = (e._swordFrac != null ? e._swordFrac : _warSWORD_FRAC_INIT);
  const weapQavg = (e._weapQ != null ? e._weapQ : _warWEAP_Q_STONE);
  let swordStock = Math.floor(weapon * swordFrac), bowStock = Math.floor(weapon * (1 - swordFrac));
  let bronzeStock = 0;
  if (_warBronzeCapable(e) && weapQavg > WAR_BRONZE_WEAPQ_TH) {
    const bf = _clamp01((weapQavg - WAR_BRONZE_WEAPQ_TH) / (WAR_BRONZE_WEAPQ_CAP - WAR_BRONZE_WEAPQ_TH));
    bronzeStock = Math.min(swordStock, Math.round(swordStock * bf));
  }
  let stoneSwordStock = Math.max(0, swordStock - bronzeStock);
  let stoneAmmoCap = warSlingerCapByStone(e);
  const comp = { champion: 0, dagger: 0, spear: 0, pike: 0, archer: 0, slinger: 0, greataxe: 0, militia: 0 };
  const swordSeekers = soldiers.filter(s => s.want === 'sword').sort((a, b) => b.wskill - a.wskill || idxOf.get(a.npc) - idxOf.get(b.npc));
  const bowSeekers = soldiers.filter(s => s.want === 'bow').sort((a, b) => b.wskill - a.wskill || idxOf.get(a.npc) - idxOf.get(b.npc));
  const _assignWType = (s, t) => { s._veteranWType = t; s.npc._veteranWType = t; };
  let champLeft = warrior;
  for (const s of swordSeekers) {
    if (bronzeStock > 0 && champLeft > 0) { comp.champion++; bronzeStock--; champLeft--; _assignWType(s, 'sword'); }
    else if (stoneSwordStock > 0) { comp.dagger++; stoneSwordStock--; _assignWType(s, 'sword'); }
    else if (stoneAmmoCap > 0) { comp.slinger++; stoneAmmoCap--; _assignWType(s, 'sling'); }
    else { comp.militia++; _assignWType(s, 'militia'); }
  }
  for (const s of bowSeekers) {
    if (bowStock > 0) { comp.archer++; bowStock--; _assignWType(s, 'bow'); }
    else if (stoneAmmoCap > 0) { comp.slinger++; stoneAmmoCap--; _assignWType(s, 'sling'); }
    else { comp.militia++; _assignWType(s, 'militia'); }
  }
  const spearSeekers = soldiers.filter(s => s.want === 'spear');
  { const ns = spearSeekers.length; const pike = Math.round(ns * LEVY_PIKE_FRAC); const spear = ns - pike; comp.spear += spear; comp.pike += pike; for (let i = 0; i < spearSeekers.length; i++) _assignWType(spearSeekers[i], 'spear'); }
  const axeSeekers = soldiers.filter(s => s.want === 'axe'); comp.greataxe += axeSeekers.length;
  for (const s of axeSeekers) _assignWType(s, 'sword');
  const slingSeekers = soldiers.filter(s => s.want === 'sling');
  for (const s of slingSeekers) { if (stoneAmmoCap > 0) { comp.slinger++; stoneAmmoCap--; _assignWType(s, 'sling'); } else { comp.militia++; _assignWType(s, 'militia'); } }
  const milSeekers = soldiers.filter(s => s.want === 'militia'); comp.militia += milSeekers.length;
  for (const s of milSeekers) _assignWType(s, 'militia');
  const total = comp.champion + comp.dagger + comp.spear + comp.pike + comp.archer + comp.slinger + comp.greataxe + comp.militia;
  if (total < 1) return null;
  if (!defense && total < WAR_RAID_MIN) return null;
  let wsum = 0, wn = 0;
  for (const s of soldiers) { wsum += Math.min(WAR_WSKILL_MAX, s.wskill); wn++; }
  const skillMean = wn ? (wsum / wn) : 0;
  const wq = Math.max(0.15, Math.min(0.95, 0.30 + 0.05 * skillMean));
  const arrows = comp.archer * (BattleCore.ARROWS_PER || 20);
  const stones = comp.slinger * (BattleCore.STONES_PER || 15);
  const armedCap = Math.floor(weapon);
  const veteranRoster = soldiers.map(s => ({ npc: s.npc, wtype: s._veteranWType || s.want }));
  return { composition: comp, force: total, warriors: warrior, hunters: hunter, archer: comp.archer, melee: comp.champion + comp.dagger + comp.spear + comp.pike + comp.greataxe + comp.militia, champion: comp.champion, arrows, stones, armed: armedCap, weapQ: wq, skillMean: +skillMean.toFixed(2), mode, veteranRoster, _individual: 1 };
}
function _warConscriptAggregate(v, mode, opts) {
  opts = opts || {};
  const e = v.econ || v; if (!e || !e.npcs) return null;
  const defense = !!opts.defense;
  const N = e.npcs.length, c = e.counts || {}, warrior = Math.round(c.warrior || 0), hunter = Math.round(c.hunter || 0);
  let force = defense ? Math.max(1, N - 1) : ((mode === 'raid') ? warrior + hunter : warrior + Math.round((N - warrior) * WAR_LEVY));
  force = Math.min(force, defense ? N - 1 : N - 2);
  if (!defense && force < WAR_RAID_MIN) return null;
  if (force < 1) return null;
  const weapon = e.storage.weapon || 0, armedCap = Math.floor(weapon);
  if (!defense) { force = Math.min(force, armedCap); if (force < WAR_RAID_MIN) return null; }
  const swordFrac = (e._swordFrac != null ? e._swordFrac : _warSWORD_FRAC_INIT);
  const bowStock = weapon * (1 - swordFrac);
  let archer = Math.min(Math.round(bowStock), force);
  archer = Math.min(archer, Math.max(hunter, mode === 'raid' ? hunter : Math.round(force * 0.5)));
  archer = Math.max(0, Math.min(archer, force));
  let melee = force - archer;
  const weapQ = (e._weapQ != null ? e._weapQ : _warWEAP_Q_STONE);
  let champion = 0;
  if (_warBronzeCapable(e) && weapQ > WAR_BRONZE_WEAPQ_TH) {
    const _bfrac = _clamp01((weapQ - WAR_BRONZE_WEAPQ_TH) / (WAR_BRONZE_WEAPQ_CAP - WAR_BRONZE_WEAPQ_TH));
    champion = Math.round(melee * _bfrac); champion = Math.min(champion, warrior); champion = Math.min(champion, melee);
  }
  const stoneMelee = melee - champion;
  let spear = Math.round(stoneMelee * LEVY_SPEAR_FRAC), pike = Math.round(stoneMelee * LEVY_PIKE_FRAC);
  let dagger = stoneMelee - spear - pike;
  if (dagger < 0) { dagger = 0; spear = Math.min(spear, stoneMelee); pike = Math.max(0, stoneMelee - spear); }
  let militia = 0;
  if (defense) { const armedTotal = champion + dagger + spear + pike + archer; militia = Math.max(0, force - armedTotal); }
  const composition = { champion, dagger, spear, pike, archer, slinger: 0, greataxe: 0, militia };
  const arrows = archer * (BattleCore.ARROWS_PER || 20);
  return { composition, force: champion + dagger + spear + pike + archer + militia, warriors: warrior, hunters: hunter, archer, melee, champion, arrows, stones: 0, armed: armedCap, weapQ, mode };
}
function conscript(v, mode, opts) { const ind = _warConscriptIndividual(v, mode, opts); if (ind) return ind; return _warConscriptAggregate(v, mode, opts); }

// 편성 비례축소(과밀 방지)
const _COMP_KEYS = ['champion', 'greataxe', 'spear', 'pike', 'dagger', 'archer', 'slinger', 'militia'];
function _warCompTotal(c) { let t = 0; for (const k of _COMP_KEYS) t += (c[k] || 0); return t; }
function _warScaleComp(comp, target) {
  const total = _warCompTotal(comp);
  if (total <= target || total <= 0) return { comp: Object.assign({}, comp), scaled: false, factor: 1 };
  const f = target / total; const out = {}; let acc = 0; const frac = [];
  for (const k of _COMP_KEYS) { const v = comp[k] || 0; if (v <= 0) { out[k] = 0; continue; } const raw = v * f; let n = Math.floor(raw); if (n < 1) n = 1; out[k] = n; acc += n; frac.push([k, raw - Math.floor(raw)]); }
  if (acc > target) { frac.sort((a, b) => a[1] - b[1]); let over = acc - target; for (const [k] of frac) { if (over <= 0) break; while (out[k] > 1 && over > 0) { out[k]--; over--; } } if (over > 0) { const order = _COMP_KEYS.filter(k => out[k] > 0).sort((a, b) => (comp[a] || 0) - (comp[b] || 0)); for (const k of order) { if (over <= 0) break; if (out[k] > 0) { out[k]--; over--; } } } }
  else if (acc < target) { frac.sort((a, b) => b[1] - a[1]); let need = target - acc; let i = 0; while (need > 0 && frac.length) { const [k] = frac[i % frac.length]; out[k]++; need--; i++; } }
  return { comp: out, scaled: true, factor: f };
}
// 마을 편성 → battle-core spec (방어측 conscript·홈 어드밴티지·교전상한)
function toBattleSpec(army, defenderVil, opts) {
  opts = opts || {};
  const dE = defenderVil.econ || defenderVil, ND = dE.npcs ? dE.npcs.length : 0;
  const existential = (army.force || 0) > ND * 0.5;
  const defComp = conscript(defenderVil, existential ? 'full' : 'raid', { defense: true }) || conscript(defenderVil, 'full', { defense: true }) || { composition: { champion: 0, dagger: 0, spear: 0, pike: 0, archer: 0, slinger: 0, greataxe: 0, militia: Math.max(1, Math.min(ND - 1, Math.round(ND * 0.5))) }, weapQ: _warWEAP_Q_STONE, force: 1, arrows: 0 };
  const aWeapQ = (army.weapQ != null ? army.weapQ : ((army.atkEcon && army.atkEcon._weapQ) != null ? army.atkEcon._weapQ : _warWEAP_Q_STONE));
  const dWeapQ = (defComp.weapQ != null ? defComp.weapQ : (dE._weapQ != null ? dE._weapQ : _warWEAP_Q_STONE));
  let A = Object.assign({ form: 'line' }, army.composition);
  let B = Object.assign({ form: 'line' }, defComp.composition);
  const aTot = _warCompTotal(A);
  if (aTot > 0) {
    const engageTarget = existential ? _warCompTotal(B) : Math.min(_warCompTotal(B), Math.max(Math.ceil(aTot * WAR_DEF_ENGAGE_MIN), Math.ceil(aTot * WAR_DEF_ENGAGE_RATIO)));
    const bScaled = _warScaleComp(B, Math.min(engageTarget, WAR_ENGAGE_MAX)); B = Object.assign({ form: B.form || 'line' }, bScaled.comp);
    const aScaled = _warScaleComp(A, WAR_ENGAGE_MAX); A = Object.assign({ form: A.form || 'line' }, aScaled.comp);
  }
  const terrain = opts.terrain || 'village';
  return { A, B, terrain, quality: { A: { weapQ: aWeapQ }, B: { weapQ: dWeapQ } }, playerCmd: false, _defComp: defComp, _atkComp: { composition: A }, _existential: existential };
}
// 헤드리스 전술전투 — battle-core createBattle 인스턴스 경로(결정론 rng 주입). 실체·행군·렌더 없음.
function runBattleHeadless(spec, rng) {
  const b = BattleCore.createBattle(spec, { rng: rng || Math.random });
  let steps = 0;
  while (!b.result && steps < WAR_BATTLE_MAXTICK) { b.step(WAR_BATTLE_DT); steps++; }
  const S = b.sides, r = b.result;
  const winner = r ? r.win : ((S.A.start - S.A.dead) >= (S.B.start - S.B.dead) ? 'A' : 'B');
  const survivorsByType = { A: {}, B: {} }; let routA = 0, routB = 0, _mA = 0, _mB = 0;
  for (const u of b.units) { if (u.hp > 0) { const s = survivorsByType[u.side]; s[u.type] = (s[u.type] || 0) + 1; if (u.routing) { if (u.side === 'A') { routA++; _mA += (u.mrl || 0); } else { routB++; _mB += (u.mrl || 0); } } } }
  return { winner, atkStart: S.A.start, atkDead: S.A.dead, defStart: S.B.start, defDead: S.B.dead, atkSurv: S.A.start - S.A.dead, defSurv: S.B.start - S.B.dead, survivorsByType, ticks: steps, tick: +b.tick.toFixed(2), routA, routB, routMrlA: routA ? _mA / routA : 0.5, routMrlB: routB ? _mB / routB : 0.5 };
}

// ═══════════ 원한/트라우마/명분 (econ plain-object 저장 — serializeEcon 자동 영속) ═══════════
function warFE(e) { const S = e.storage || {}; return (S.food || 0) + (S.fish || 0) + (S.meat || 0) + (S.cooked_food || 0) + (S.vegetable || 0); }
function warGrudge(e, nm) { return (e && e._grudge && e._grudge[nm]) || 0; }
function warAddGrudge(e, nm, amt) { if (!e._grudge) e._grudge = {}; e._grudge[nm] = _clamp01((e._grudge[nm] || 0) + amt); }
function warTrauma(e, nm) { return (e && e._warTrauma && e._warTrauma[nm]) || 0; }
function warAddTrauma(e, nm, amt) { if (!e._warTrauma) e._warTrauma = {}; e._warTrauma[nm] = _clamp01((e._warTrauma[nm] || 0) + amt); }
// warJustice(atkEcon, defName, casus) → 0~1. 명분 기반 + 원한 가산.
//   ※TODO(본체 인계 — §17 벌점 연동 자리): 본게임에선 침략자 벌점(악행 카르마)이 J를 추가 감산한다.
//   설계 예약(3파 — 구현은 central 벌점 레이어 설계 후): central에 개인 벌점 원장(교전 플래그·무고 판정·세탁 방지)
//   → 길드(마을) 집계 karma(0..1) → J' = max(J_floor, J − k×karma) (하한 유지 — 악당 존재 가능 계약 §17).
//   인터페이스 예약: createWar(opts.karmaOf?(vilName)→0..1) 주입 시 이 함수 말미에서 감산 — 현재 미주입·미호출(무해).
function warJustice(atkE, defName, casus) {
  const gr = warGrudge(atkE, defName || '');
  const base = WAR_J_CASUS[casus];
  if (base == null) return Math.min(1, 0.4 + 0.6 * Math.min(1, gr / 0.5));
  return Math.min(1, base + 0.5 * gr);
}
// ═══════════ ★[3파 포로 §18] 포로화(econ 층·pure — 랩 6220~6263 verbatim, 서버 grudge=econ 소재) ═══════════
// warCapture — 포로화 1/2: 후보 산정→상한→npc 객체를 패자 econ에서 splice(+captive 부착·무기직 박탈).
//   ★승자 편입은 warCaptiveIntake(2/2)가 warKill '이후' 수행 — 순서 뒤집히면 승자 사상 주사위가 포로를 집어 죽임(림보 격리).
function warCapture(loserVil, winnerVil, loserDead, winnerSurv, J, day, roster, st) {
  const out = { cand: 0, take: [], freed: 0 };
  if (!WAR_CAP_ON) return out;
  const le = loserVil && loserVil.econ, we = winnerVil && winnerVil.econ;
  if (!le || !we || !le.npcs || !we.npcs) return out;
  const cand = Math.round(Math.max(0, loserDead || 0) * WAR_CAP_FRAC); if (cand < 1) return out;
  out.cand = cand;
  let cap = Math.min(Math.round(J * cand), Math.floor(Math.max(0, winnerSurv || 0) * WAR_CAP_ESCORT));
  cap = Math.max(0, Math.min(cap, le.npcs.length - 1));   // 패자 최후 1인 보존(전멸 방지 — warKill 동형)
  if (cap > 0) {
    const inE = new Set(le.npcs);
    const takeOne = (npc) => {
      const j = le.npcs.indexOf(npc); if (j < 0) return false;
      le.npcs.splice(j, 1); if (le.counts && npc.currentJob) le.counts[npc.currentJob] = Math.max(0, (le.counts[npc.currentJob] || 0) - 1);
      npc.captive = { home: (loserVil.name || '?'), since: day };
      if (npc.currentJob === 'warrior' || npc.currentJob === 'hunter') {   // 무기 직 박탈 — 승자 땅에 맞는 식량직
        const wl = we.land || {}; const opts2 = [['farmer', (wl.fertility || 0) * 1.5], ['fisher', (wl.water || 0) * 1.2], ['forager', 0.3]];
        opts2.sort((a, b) => b[1] - a[1]); npc.currentJob = opts2[0][0]; npc.lastJobChangeDay = day;
      }
      out.take.push(npc); return true;
    };
    if (roster) for (const it of roster) { if (out.take.length >= cap) break; const n = it && it.npc; if (!n || !inE.has(n) || n.captive) continue; takeOne(n); }   // 참전 로스터(실제 싸운 이) 우선
    const rng = makeRng((((day | 0) * 131071) ^ (((loserDead | 0) + 7) * 2246822519) ^ (le.npcs.length * 97 + 13)) >>> 0);
    let guard = 0;
    while (out.take.length < cap && le.npcs.length > 1 && guard++ < 200) { const j = (rng() * le.npcs.length) | 0; const n = le.npcs[j]; if (!n || n.captive) continue; takeOne(n); }
  }
  out.freed = cand - out.take.length;
  if (st) { st.captured = (st.captured || 0) + out.take.length; st.capFreed = (st.capFreed || 0) + out.freed; }
  return out;
}
// warCaptiveIntake — 포로화 2/2: warKill 이후 승자 econ.npcs로 push(같은 객체·counts 정합).
function warCaptiveIntake(winnerVil, take) {
  const we = winnerVil && winnerVil.econ; if (!we || !we.npcs || !take) return;
  for (const npc of take) { if (!npc) continue; we.npcs.push(npc); if (we.counts) we.counts[npc.currentJob] = (we.counts[npc.currentJob] || 0) + 1; }
}
// _capComplete — 포로 귀향 확정(econ): npc 객체를 승자 econ→고향 econ으로 splice 복귀 + captive 해제.
function _capComplete(fromVil, toVil, npc) {
  const fe = fromVil && fromVil.econ, te = toVil && toVil.econ; if (!fe || !te || !fe.npcs || !te.npcs) return false;
  const ni = fe.npcs.indexOf(npc); if (ni < 0) return false;
  if (fe.npcs.length <= 1) return false;   // 억류 마을 최후 1인 보존
  fe.npcs.splice(ni, 1); if (fe.counts && npc.currentJob) fe.counts[npc.currentJob] = Math.max(0, (fe.counts[npc.currentJob] || 0) - 1);
  te.npcs.push(npc); if (te.counts) te.counts[npc.currentJob] = (te.counts[npc.currentJob] || 0) + 1;
  delete npc.captive;
  return true;
}
// 무기 드랍·궤주 투기(econ) — 사망자 드랍 승자 0.7 회수 + 궤주 기대 투기 승자 0.5 회수. 품질 가중평균.
function warWeaponFlow(winnerE, loserE, loserStart, loserDead, routN, routMrl, st) {
  if (!winnerE || !loserE) return null;
  const lw0 = loserE.storage.weapon || 0; if (lw0 <= 0.01) return null;
  const armed = Math.min(1, lw0 / Math.max(1, loserStart || 1));
  const drop = Math.min(lw0, Math.max(0, loserDead || 0) * armed);
  const mrl = _clamp01(routMrl == null ? 0.5 : routMrl);
  const pDes = _clamp01(WAR_DESERT_P0 + WAR_DESERT_PM * (1 - mrl));
  const desert = Math.min(Math.max(0, lw0 - drop), Math.max(0, routN || 0) * pDes * armed);
  const loss = drop + desert; if (loss <= 0.01) return null;
  loserE.storage.weapon = lw0 - loss;
  const gain = drop * WAR_SALV_DEAD + desert * WAR_SALV_DESERT;
  const wOld = winnerE.storage.weapon || 0, qW = (winnerE._weapQ != null ? winnerE._weapQ : _warWEAP_Q_STONE), qL = (loserE._weapQ != null ? loserE._weapQ : _warWEAP_Q_STONE);
  winnerE.storage.weapon = wOld + gain;
  winnerE._weapQ = (wOld + gain) > 0 ? ((qW * wOld + qL * gain) / (wOld + gain)) : qW;
  if (st) st.weaponLoot = (st.weaponLoot || 0) + 1;
  return { drop, desert, loss, gain, pDesert: pDes, newQ: winnerE._weapQ, qUp: qL > qW + 0.02 };
}

// ═══════════ ★[2파 작전층] 정찰 근사 승산(pure — 랩 7920~7938 verbatim, _palisade·econ 서버 소재 반영) ═══════════
// 방어 유효전력 — _warNpcMobPlan dEff와 동일 수식(전사1.0/보조 0.25 가중 × 무장 × 목책 × 홈1.25)
function _opDefEff(defVil) {
  const D = defVil && defVil.econ; if (!D) return 1;
  const duc = D.counts || {}, NU = D.npcs.length, dWar = Math.round(duc.warrior || 0), dHun = Math.round(duc.hunter || 0);
  const dEng = Math.min(Math.max(1, NU - 1), dWar + dHun + Math.round((NU - dWar) * 0.25));
  const dAux = Math.max(0, dEng - dWar);
  const dWep = Math.min(1, (D.storage.weapon || 0) / Math.max(1, dEng)), dArm = Math.min(1, (D.storage.armor || 0) / Math.max(1, dEng));
  return Math.max(1, (dWar + dAux * WAR_AUX_MULT)) * (0.6 + 0.5 * dWep + 0.3 * dArm) * (1 + (D._palisade || 0)) * 1.25;
}
// 공격 시점 승산 — 자기 전력(동원 시점 wep/arm 스냅) vs 방어 정찰 근사
function _opAtkOdds(w) {
  const A = w.atk && w.atk.econ, D = w.def && w.def.econ; if (!A || !D) return 0.5;
  const F = Math.max(1, w.force || 1), war = Math.min(F, Math.round(w.warriors || 0));
  const aEff = Math.max(1, (war + (F - war) * WAR_AUX_MULT)) * (0.6 + 0.5 * (w.wep || 0) + 0.3 * (w.arm || 0));
  const dEff = _opDefEff(w.def);
  return aEff / (aEff + dEff);
}
// 방어 시점 승산 — 정보 비대칭: 자기 전력은 정확히, 공격은 '보이는 머릿수'만(정예 0.4·무장 0.5/0.15 표준 가정)
function _opDefOdds(defVil, atkForce) {
  const dEff = _opDefEff(defVil);
  const F = Math.max(1, atkForce || 1), wG = Math.round(F * 0.4);
  const aEff = Math.max(1, (Math.min(F, wG) + Math.max(0, F - wG) * WAR_AUX_MULT)) * (0.6 + 0.5 * 0.5 + 0.3 * 0.15);
  return dEff / (dEff + aEff);
}
// 방어의 공격 군량 '추정' — 병력 수 기반 근사(정확값 w._packRem 사용 금지 — 정보 비대칭)
function _opDefEstPack(force) { return Math.max(8, Math.min(14, WAR_SIEGE_PACK * (1 - 0.004 * ((force || 20) - 20)))); }

// ═══════════════════════════════════════════════════════════════════════════
// createWar({villages, world, ...}) — 일일 econ 전쟁 구동 팩토리(headless).
//   villages: 마을 래퍼 배열 [{econ, name, ...}] (전쟁 상태는 .econ 에 저장 — serializeEcon 영속)
//   world: econ world (world._warStats/_warWars/_warTributes/_warSeq 부착)
//   opts.centerOf(v)→{cx,cy}(맵 셀), opts.territoryOf(v)→영토 셀수, opts.seed, opts.infoRange, opts.log(day,msg)
// ═══════════════════════════════════════════════════════════════════════════
function createWar(opts) {
  opts = opts || {};
  const villages = opts.villages;
  const world = opts.world;
  const centerOf = opts.centerOf || (v => v.center || { cx: 0, cy: 0 });
  const territoryOf = opts.territoryOf || (v => (v.econ && v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800));
  const infoRange = opts.infoRange != null ? opts.infoRange : (world && world.infoRange) || 5000;
  const baseSeed = (opts.seed >>> 0) || (world && world.seed >>> 0) || 1;
  const userLog = typeof opts.log === 'function' ? opts.log : null;

  world._warWars = world._warWars || [];
  world._warTributes = world._warTributes || [];
  if (world._warSeq == null) world._warSeq = 1;
  const WARS = world._warWars, TRIBUTES = world._warTributes;

  function stats() { return world._warStats || (world._warStats = { decl: 0, battle: 0, atkWin: 0, defWin: 0, cas: 0, loot: 0, tribute: 0, palisade: 0, weaponLoot: 0, unjust: 0, byCasus: { trade: 0, territory: 0, prestige: 0, feud: 0 }, active: 0, tributes: 0, siege: 0, assault: 0, withdraw: 0, surrender: 0, sortie: 0, walkover: 0, captured: 0, capFreed: 0, escaped: 0, assimilated: 0, ransomed: 0, log: [] }); }   // ★[2파] 작전층 + ★[3파] 포로 카운터(랩 warStats 재동기)
  function log(day, m) { const st = stats(); if (st && st.log.length < 500) st.log.push('D' + day + ' ' + m); if (userLog) userLog(day, m); }
  function warTerrR(v) { return Math.sqrt(territoryOf(v) / Math.PI); }
  function _battleRng(day, id) { return makeRng(hash2(baseSeed ^ 0x5ca1ab1e, hash2(day | 0, id | 0))); }

  // 영구 인구손실(도적 killTrader 동형·rng 주입) — ≥1 유지(전멸 방지)
  function warKill(e, k, rng) { let r = 0; for (let i = 0; i < k && e.npcs.length > 1; i++) { const j = (rng() * e.npcs.length) | 0, npc = e.npcs.splice(j, 1)[0]; if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1); r++; } return r; }

  // 제3자 평판 전파 — J<0.5 불의 침공 관전 마을이 침략자 원한 학습(→_grudgeBlock 창발)
  function warThirdPartyRep(atkVil, defVil, J, day) {
    if (!(J < WAR_REP_TH) || !atkVil || !defVil) return 0;
    const dc = centerOf(defVil); if (!dc) return 0;
    const infoR = infoRange / 2.5; let n = 0;
    for (const o of villages) { if (o === atkVil || o === defVil || !o.econ) continue; const oc = centerOf(o); if (!oc) continue; const d = Math.hypot(oc.cx - dc.cx, oc.cy - dc.cy); if (d > infoR) continue; const prox = Math.max(0, 1 - d / infoR); if (prox <= 0) continue; warAddGrudge(o.econ, atkVil.name, (WAR_REP_TH - J) * WAR_REP_K * prox); n++; }
    const st = stats(); if (st && n) st.unjust = (st.unjust || 0) + 1;
    if (n) log(day, '불의 침공 소문(J ' + J.toFixed(2) + ') — ' + atkVil.name + '→' + defVil.name + ': 관전 ' + n + '개 마을 경계');
    return n;
  }

  // 원한>문턱 상대 교역 기피(econ._grudgeBlock={name:1}) 발행/해제(1일 1회)
  function grudgeBlockSweep(day) {
    for (const vil of villages) { const e = vil.econ; if (!e) continue; let blk = null; if (e._grudge) for (const k in e._grudge) { if (e._grudge[k] > WAR_GRUDGE_BLOCK_TH) { if (!blk) blk = {}; blk[k] = 1; } } if (blk) e._grudgeBlock = blk; else if (e._grudgeBlock) delete e._grudgeBlock; }
  }

  // NPC 동원 알고리즘 — 방어전력×명분배수, 잔류·식량·거리 제약, 승산 미달시 축소/포기
  function _warNpcMobPlan(V, U, casus, dist, day) {
    const e = V.econ, eu = U.econ; if (!e || !eu) return { viable: false };
    const c = e.counts || {}, NV = e.npcs.length, warriors = Math.round(c.warrior || 0), hunters = Math.round(c.hunter || 0);
    const duc = eu.counts || {}, NU = eu.npcs.length, dWar = Math.round(duc.warrior || 0), dHun = Math.round(duc.hunter || 0);
    const marchDays = Math.max(1, Math.ceil(dist / WAR_MARCH));
    const AUX = WAR_AUX_MULT;
    const existentialGuess = (casus === 'existential');
    const dEng = existentialGuess ? Math.max(1, NU - 1) : Math.min(Math.max(1, NU - 1), dWar + dHun + Math.round((NU - dWar) * 0.25));
    const dAux = Math.max(0, dEng - dWar);
    const dWep = Math.min(1, (eu.storage.weapon || 0) / Math.max(1, dEng)), dArm = Math.min(1, (eu.storage.armor || 0) / Math.max(1, dEng));
    const dEff = Math.max(1, (dWar + dAux * AUX)) * (0.6 + 0.5 * dWep + 0.3 * dArm) * (1 + (eu._palisade || 0)) * 1.25;
    const mul = WAR_CASUS_MOB[casus] || 1.2;
    const myWepAll = e.storage.weapon || 0, myArmAll = e.storage.armor || 0;
    const attEff = (force) => { const w = Math.min(force, warriors), a = Math.max(0, force - w); const wep = Math.min(1, myWepAll / Math.max(1, force)), arm = Math.min(1, myArmAll / Math.max(1, force)); return Math.max(1, (w + a * AUX)) * (0.6 + 0.5 * wep + 0.3 * arm); };
    const targetEff = dEff * mul;
    const keepAdults = Math.round((NV - 1) * WAR_HOME_KEEP_FRAC);
    const keepWar = Math.round(warriors * WAR_HOME_KEEP_WAR);
    const maxByHome = Math.max(0, (NV - 1) - Math.max(keepAdults, keepWar));
    const foodStore = e.storage.food || 0;
    const maxByFood = Math.floor(foodStore / Math.max(1e-6, marchDays * 2 * WAR_RATION));
    const maxBySupplyDist = Math.floor((NV - 1) / (1 + WAR_SUPPLY_DIST_K * marchDays));
    const maxByEngage = WAR_ENGAGE_MAX;
    const cap = Math.min(NV - 2, maxByHome, maxByFood, maxBySupplyDist, maxByEngage);
    let want = WAR_RAID_MIN;
    for (let f = WAR_RAID_MIN; f <= Math.max(WAR_RAID_MIN, cap); f++) { if (attEff(f) >= targetEff) { want = f; break; } want = f; }
    let forceCount = Math.min(cap, Math.max(WAR_RAID_MIN, want));
    let capReason = (forceCount < want) ? (forceCount === maxByFood ? '식량' : forceCount === maxByHome ? '잔류' : forceCount === maxBySupplyDist ? '거리' : '교전상한') : '목표달성';
    if (forceCount < WAR_RAID_MIN) return { viable: false, capReason: '병력부족' };
    let mode = 'full';
    const oddsOf = (f) => { const pA = attEff(f); return pA / (pA + dEff); };
    let pWin = oddsOf(forceCount);
    if (pWin < WAR_MOB_ODDS_MIN) {
      const raidF = Math.min(cap, Math.max(WAR_RAID_MIN, warriors + hunters));
      const raidOdds = oddsOf(raidF);
      if (raidF >= WAR_RAID_MIN && raidF < forceCount && raidOdds >= WAR_MOB_ODDS_MIN * 0.9) { forceCount = raidF; mode = 'raid'; pWin = raidOdds; capReason = '소습격축소'; }
      else if (pWin < WAR_MOB_ODDS_MIN * 0.8) { return { viable: false, forceCount, pWin, capReason: '승산부족' }; }
    }
    const rations = forceCount * marchDays * 2 * WAR_RATION;
    return { viable: true, forceCount, marchDays, rations, warriors, aux: Math.max(0, forceCount - Math.min(forceCount, warriors)), mode, pWin, capReason };
  }

  // 동원 — 군량 선차감 + 동원기간 생산정지(_warMobUntil/_warMobFrac) + 편성 저장(WARS push)
  function warMobilize(V, U, casus, dist, day) {
    const e = V.econ, st = stats(), c = e.counts || {}, warriors = Math.round(c.warrior || 0), NV = e.npcs.length;
    const plan = _warNpcMobPlan(V, U, casus, dist, day);
    if (!plan.viable) return false;
    const force = plan.forceCount, marchDays = plan.marchDays, rations = plan.rations, mode = plan.mode;
    if ((e.storage.food || 0) < rations) return false;
    e.storage.food -= rations; e._warMobUntil = day + marchDays * 2 + 1; e._warMobFrac = Math.min(0.8, force / NV); e._warCd = day + WAR_CD;
    const wep = Math.min(1, (e.storage.weapon || 0) / force), arm = Math.min(1, (e.storage.armor || 0) / force);
    const _mob = conscript(V, mode, { forceCount: force });
    const composition = _mob ? _mob.composition : { champion: 0, dagger: Math.max(1, force - warriors), spear: 0, pike: 0, archer: 0 };
    const arrows = _mob ? _mob.arrows : 0, weapQ = (_mob && _mob.weapQ != null ? _mob.weapQ : (e._weapQ != null ? e._weapQ : _warWEAP_Q_STONE));
    const _vetRoster = (_mob && _mob.veteranRoster) ? _mob.veteranRoster : null, stones = (_mob && _mob.stones) || 0;
    const _actualForce = _mob ? _mob.force : force;
    const _war = { id: world._warSeq++, atk: V, def: U, casus, force: _actualForce, warriors, wep, arm, composition, arrows, stones, weapQ, phase: 'march', eta: day + marchDays, marchDays, born: day, _vetRoster };
    // ★[2파 작전층] 공성 군량 팩 적재(곳간 선차감·있는 만큼) + op 초기화 — 랩 _opInitWar의 동원 시점 전진(서버 추상층은 _mg 빌드가 없음)
    if (WAR_OPS_ON) { _war.op = 'march'; _war._packDays = _war._packRem = _opPackLoad(V, _actualForce); }
    WARS.push(_war);
    st.decl++; st.byCasus[casus] = (st.byCasus[casus] || 0) + 1;
    log(day, V.name + '→' + U.name + ' 선전포고[' + casus + '·' + mode + '] 병력' + _actualForce + '(전사' + warriors + '·승산' + (plan.pWin * 100 | 0) + '%·' + plan.capReason + ')·행군' + marchDays + '일' + (WAR_OPS_ON && _war._packDays > 0 ? '·공성팩 ' + _war._packDays.toFixed(1) + '일분' : ''));
    return true;
  }

  // 조공 등록(payer/payee 래퍼) + payer econ 미러(_warTribOut) — serializeEcon 영속
  function _addTribute(payerVil, payeeVil, day) { TRIBUTES.push({ payer: payerVil, payee: payeeVil, until: day + WAR_TRIB_YRS * 360, next: day + WAR_TRIB_INT }); _syncTribToEcon(payerVil); }
  function _syncTribToEcon(payerVil) { const e = payerVil.econ; if (!e) return; const out = []; for (const t of TRIBUTES) if (t.payer === payerVil) out.push({ payee: t.payee.name, until: t.until, next: t.next }); if (out.length) e._warTribOut = out; else if (e._warTribOut) delete e._warTribOut; }

  // ═══════════ ★[2파 작전층 · §15] camp/siege/assault/withdraw 상태기계 (랩 7939~8140 일 단위 어댑터) ═══════════
  // 봉쇄 설치/해제 — econ 훅(_siegeBlock·_siegeOutMul)은 'siege 상태'만 소유. 다중 포위 refcount(같은 방어를 딴 군대가 포위 중이면 유지).
  function _opSetSiege(w, on, day) {
    if (!w || !w.def) return; const D = w.def.econ;
    if (on) {
      if (w._siegeOn) return; w._siegeOn = true;
      if (D) { D._siegeBlock = true; D._siegeOutMul = WAR_SIEGE_OUTMUL; }
      const st = stats(); st.siege = (st.siege || 0) + 1;
      log(day, w.atk.name + ' → ' + w.def.name + ' 포위 개시 — 봉쇄(교역 발/착 차단·야외 노동 ' + (WAR_SIEGE_OUTMUL * 100 | 0) + '%)');
    } else {
      if (!w._siegeOn) return; w._siegeOn = false;
      let other = false; for (const o of WARS) { if (o !== w && o._siegeOn && o.def === w.def) { other = true; break; } }
      if (!other && D) { delete D._siegeBlock; delete D._siegeOutMul; }
      log(day, w.def.name + ' 포위 해제' + (other ? '(타군 포위 지속)' : ''));
    }
  }
  // 군량 팩 — 적재=곳간 선차감(부족하면 있는 만큼), 잔량 '일수' 단위. 철수·항복 잔량은 환급.
  function _opPackLoad(atkVil, force) {
    const A = atkVil && atkVil.econ; const per = (force || 0) * WAR_RATION;
    if (!A || per <= 0) return 0;
    const got = Math.max(0, Math.min(per * WAR_SIEGE_PACK, A.storage.food || 0)); A.storage.food = (A.storage.food || 0) - got;
    return got / per;
  }
  function _opPackRefund(atkVil, force, remDays) { const A = atkVil && atkVil.econ; if (!A) return; const rem = Math.max(0, remDays || 0); if (rem > 0) A.storage.food = (A.storage.food || 0) + rem * (force || 0) * WAR_RATION; }
  // 무혈 항복 공통 효과 — 조공 계약+곳간 공납(WAR_LOOT 절반·★음수 하한 0 — 빈 곳간 항복=공납 0+조공 계약만, 랩 최신 수리)·사상 0·방화 없음·원한/피로 소폭
  function _opDoSurrender(atkVil, defVil, day) {
    const A = atkVil && atkVil.econ, D = defVil && defVil.econ; if (!A || !D) return 0;
    const take = Math.max(0, D.storage.food || 0) * WAR_LOOT * 0.5;
    D.storage.food = (D.storage.food || 0) - take; A.storage.food = (A.storage.food || 0) + take;
    if (D.npcs.length > 4) _addTribute(defVil, atkVil, day);
    warAddGrudge(D, atkVil.name, WAR_GRUDGE_UP * 0.5);
    A._warFatigue = (A._warFatigue || 0) + 0.10; D._warFatigue = (D._warFatigue || 0) + 0.25;
    const st = stats(); st.surrender = (st.surrender || 0) + 1;
    log(day, defVil.name + ' 무혈 항복 → ' + atkVil.name + ' — 곳간 ' + take.toFixed(0) + ' 공납·조공 ' + WAR_TRIB_YRS + '년·사상 0·성문 개방(방화 없음)');
    return take;
  }
  // 무저항 함락(walkover) — 방어 징발 불가(주민<2)·전투·사상·유령 0. 승리 권리는 J 상한(§17) 그대로.
  //   ※방화(builtFloors--)는 랩 시각층 소유 — 서버 실체 집(buildings 행)엔 미적용(econ 무의미·엔티티 부채로 기록, 2파 TODO 주석).
  function _warWalkoverOutcome(atkVil, defVil, day, casus) {
    const A = atkVil && atkVil.econ, D = defVil && defVil.econ; if (!A || !D) return;
    const J = warJustice(A, defVil.name, casus);
    const loot = (D.storage.food || 0) * (WAR_J_LOOT0 + WAR_J_LOOT1 * J); D.storage.food = (D.storage.food || 0) - loot; A.storage.food = (A.storage.food || 0) + loot;
    for (const pg of ['tigerhide', 'hide', 'bronze', 'jade']) { if (D.storage[pg] > 0) { const q = D.storage[pg] * WAR_LOOT_PREST * (WAR_J_PREST0 + WAR_J_PREST1 * J); D.storage[pg] -= q; A.storage[pg] = (A.storage[pg] || 0) + q; } }
    if (D.npcs.length > 4) _addTribute(defVil, atkVil, day);
    warAddGrudge(D, atkVil.name, WAR_GRUDGE_UP * 0.5);
    A._warFatigue = (A._warFatigue || 0) + 0.06;
    if (J < WAR_REP_TH) A._warFatigue += (WAR_REP_TH - J) * WAR_J_FAT;
    warThirdPartyRep(atkVil, defVil, J, day);
    const st = stats(); st.walkover = (st.walkover || 0) + 1;
    log(day, defVil.name + ' 무저항 함락 → ' + atkVil.name + ' — 약탈 ' + loot.toFixed(0) + '(J ' + J.toFixed(2) + ')·위신재(전투·사상 0, 유령 유닛 0)');
  }
  // NPC 전이 실행 — 상태 진입 효과(봉쇄 훅·통계·로그·귀환 전환). withdraw=잔여 팩 환급+phase 'return'.
  function _opTransNPC(w, to, day, why) {
    if (w.op === to) return; w.op = to;
    const st = stats();
    if (to === 'siege') { _opSetSiege(w, true, day); log(day, w.atk.name + ' → ' + w.def.name + ' 포위 유지 결단(' + (why || '') + ')'); return; }
    _opSetSiege(w, false, day);
    if (to === 'assault') { st.assault = (st.assault || 0) + 1; log(day, w.atk.name + ' → ' + w.def.name + ' 돌격 결단(' + (why || '') + ')'); }
    else if (to === 'withdraw') {
      st.withdraw = (st.withdraw || 0) + 1;
      log(day, w.atk.name + ' → ' + w.def.name + ' 철수(' + (why || '') + ') — 도보 귀환');
      _opPackRefund(w.atk, w.force || 0, w._packRem); w._packRem = 0;
      w._sortie = false; w.phase = 'return'; w.eta = day + (w.marchDays || 1);
    }
  }
  // NPC 결단(도착 시+매일·결정론 — 랩 rng 시드 동형): assault(승산) vs siege(소모전 우위) vs withdraw(둘 다 나쁨)
  function _opNpcDecide(w, day) {
    if (w.phase !== 'march') return;
    if (w._opPolicy === 'assault') { _opTransNPC(w, 'assault', day, '정책'); return; }
    const pWin = _opAtkOdds(w);
    const rng = makeRng((((w.id || 1) * 7919 + (day | 0) * 131 + 17) >>> 0));
    const D = w.def && w.def.econ;
    const defFoodEst = (D ? warFE(D) / Math.max(1, D.npcs.length) : 99) * (0.75 + 0.5 * rng());   // 정찰 추정(±25% 결정론 노이즈 — 정보 비대칭)
    const pack = (w._packRem != null) ? w._packRem : 0;
    // ★[포로 EU] 돌격만 포로를 낳는다 — 기대 포로 가치만큼 돌격 문턱 소폭 완화(상한 0.05). WAR_CAP_EU=0(3파 전)이면 0.
    const _capB = Math.min(0.05, (D && D.npcs ? D.npcs.length : 0) * WAR_CAS_BASE * WAR_CAP_FRAC * WAR_CAP_EU / 800);
    if (w._opPolicy === 'siege') { if (pack < WAR_PACK_CRIT) _opTransNPC(w, 'withdraw', day, '군량 소진(봉쇄 전용 정책)'); else _opTransNPC(w, 'siege', day, '정책'); return; }
    if (pack < WAR_PACK_CRIT) { if (pWin >= WAR_GAMBLE_ODDS) _opTransNPC(w, 'assault', day, '군량 ' + pack.toFixed(1) + '일 — 도박 승산 ' + (pWin * 100 | 0) + '%'); else _opTransNPC(w, 'withdraw', day, '군량 ' + pack.toFixed(1) + '일·승산 ' + (pWin * 100 | 0) + '%'); return; }
    if (pWin >= WAR_ASSAULT_ODDS - _capB) { _opTransNPC(w, 'assault', day, '승산 ' + (pWin * 100 | 0) + '%' + (_capB > 0 ? '(+포로 기대)' : '')); return; }
    if (pack > defFoodEst + 1) { _opTransNPC(w, 'siege', day, '소모전 우위 — 군량 ' + pack.toFixed(0) + '일 > 추정 곳간 ' + defFoodEst.toFixed(0) + '일'); return; }
    if (pWin >= WAR_HOLD_GAMBLE - _capB) { _opTransNPC(w, 'assault', day, '소모전 열세 — 승산 도박 ' + (pWin * 100 | 0) + '%'); return; }
    _opTransNPC(w, 'withdraw', day, '승산 ' + (pWin * 100 | 0) + '%·소모전 열세');
  }
  // 무혈 항복 검사(siege 중·매일) — 절박 완화(곳간<2일=문턱 ×2.2) 포함. true=항복 성립(phase 'return' 전환).
  function _opCheckSurrender(w, day) {
    const D = w.def && w.def.econ; if (!D) return false;
    if (w.op !== 'siege') return false;
    if (w.def._defPolicy === 'respond') return false;   // 결사 항전 정책(프로브 훅)이면 항복 없음
    const fd = warFE(D) / Math.max(1, D.npcs.length);
    if (fd >= WAR_SURR_FOODD) return false;
    const _oddsTh = fd < 2 ? WAR_SURR_ODDS * 2.2 : WAR_SURR_ODDS;   // ★절박 항복(랩 수리): 곳간 2일 미만이면 문턱 완화 — 곳간 음수 추락·공납 불능 결함 차단
    if (_opDefOdds(w.def, w.force || 0) >= _oddsTh) return false;
    _opDoSurrender(w.atk, w.def, day);
    _opSetSiege(w, false, day);
    _opPackRefund(w.atk, w.force || 0, w._packRem); w._packRem = 0;
    w.op = 'withdraw'; w._sortie = false; w.phase = 'return'; w.eta = day + (w.marchDays || 1);
    return true;
  }
  // 방어 태세 결정(3택 중 ①②) — respond(응전)/hold(버티기). ③위협 소멸 해산 = phase 전환이 소유.
  function _opDefStance(defVil, atkForce, day, w) {
    if (defVil && defVil._defPolicy === 'respond') return 'respond';
    if (defVil && defVil._defPolicy === 'hold') return 'hold';
    const D = defVil && defVil.econ; if (!D) return 'respond';
    const pDef = _opDefOdds(defVil, atkForce);
    if (pDef >= WAR_DEF_RESPOND_ODDS) return 'respond';          // ①전력비 유리 → 나가서 맞선다
    const mo = lMonth(day);
    if ((mo >= 4 && mo <= 9) && pDef >= 0.40) return 'respond';  // ①농번·수확 임박 — 봉쇄 손실이 커 응전 하한 완화
    const fd = warFE(D) / Math.max(1, D.npcs.length);
    const sieged = Math.max(0, day - ((w && w._arriveDay != null) ? w._arriveDay : day));
    if (fd > _opDefEstPack(atkForce) - sieged + 2) return 'hold';   // ②열세·곳간이 상대 군량 추정보다 오래감 → 농성
    return (pDef >= 0.35) ? 'respond' : 'hold';                  // 못 버티면: 승산 어느 정도면 응전, 절망이면 농성(→항복 수렴)
  }
  // 방어 AI 일일 틱(태세 히스테리시스 + sortie 결단) — 랩 _opDefenseTick의 일 단위 어댑터(추상층: respond=상비 포진 간주)
  function _opDefenseDaily(w, day) {
    if (w._defEvalDay != null && day <= w._defEvalDay) return; w._defEvalDay = day;
    if (w._defMode == null || day - ((w._defModeDay != null) ? w._defModeDay : -99) >= WAR_DEF_HYST) {
      const stance = _opDefStance(w.def, w.force || 0, day, w);
      if (stance !== w._defMode) { w._defMode = stance; w._defModeDay = day; log(day, w.def.name + ' 방어 태세: ' + (stance === 'respond' ? '응전 소집' : '버티기(농성 — 소집 안 함)')); }
    }
    if (w._defMode === 'respond' && !w._sortie && (w._sortieEval == null || day > w._sortieEval)) {
      w._sortieEval = day;
      const pDef = _opDefOdds(w.def, w.force || 0);
      const fd = (w.def.econ) ? warFE(w.def.econ) / Math.max(1, w.def.econ.npcs.length) : 99;
      if (pDef >= WAR_SORTIE_ODDS || (fd < 8 && pDef >= 0.42)) { w._sortie = true; const st = stats(); st.sortie = (st.sortie || 0) + 1; log(day, w.def.name + ' 출격(sortie) 결단 — 응전 승산 ' + (pDef * 100 | 0) + '%'); }
    }
  }
  // ═══════════ ★[3파 포로 §18] 일일 처리(동화·탈출·몸값·추상 이송 — 랩 warCaptiveDaily 서버 어댑터) ═══════════
  //   결정론(makeRng — 랩 _warCapRng 동형 시드). 화면 층(agent 동반·도보 연출)은 호스트(villages P3) 몫 —
  //   여기선 추상 이송 큐(world._capTransit — 비영속: 재부팅 유실분은 esc 마킹으로 재큐, 아래 ⓪′)만.
  function warCaptiveDaily(day) {
    if (!WAR_CAP_ON) return;
    const st = stats();
    const TQ = world._capTransit || (world._capTransit = []);
    for (let i = TQ.length - 1; i >= 0; i--) { const t = TQ[i]; if (day < t.eta) continue; TQ.splice(i, 1); if (_capComplete(t.from, t.to, t.npc)) log(day, '포로 귀향(도보 이송 도착) — ' + (t.npc.id || '?') + ' → ' + (t.to.name || '?')); }   // ⓪이송 도착
    for (let vi = 0; vi < villages.length; vi++) {
      const hv = villages[vi], e = hv.econ; if (!e || !e.npcs) continue;
      let caps = null; for (const n of e.npcs) { if (n && n.captive) (caps || (caps = [])).push(n); }
      if (!caps) continue;
      const rng = makeRng((((day | 0) * 2654435761) ^ (vi * 97 + 13)) >>> 0);
      for (const npc of caps) {
        const cv = npc.captive; if (!cv) continue;
        if (cv.esc != null) {   // ⓪′귀향 중 — 이송 큐에 없으면(재부팅 유실) 재큐(추상층 정직 복구, 랩엔 없는 서버 보강)
          if (!TQ.some(t => t.npc === npc)) { const home0 = villages.find(v2 => v2 && v2 !== hv && v2.name === cv.home && v2.econ && v2.econ.npcs.length > 0); if (home0) TQ.push({ npc, from: hv, to: home0, eta: day + 1 }); else delete cv.esc; }
          continue;
        }
        if (day - cv.since >= WAR_CAP_ASSIM) {   // ①동화(3년) — 필드 삭제(정식 주민)
          delete npc.captive; st.assimilated = (st.assimilated || 0) + 1;
          log(day, '포로 동화 — ' + (npc.id || '?') + ' ' + hv.name + ' 정식 주민(3년 경과)'); continue;
        }
        const home = villages.find(v2 => v2 && v2 !== hv && v2.name === cv.home && v2.econ && v2.econ.npcs && v2.econ.npcs.length > 0);
        if (!home) continue;   // 고향 소멸 → 잔류(captive 유지·동화 대기 — 도적 합류 후보 아님)
        const hc = centerOf(hv), oc = centerOf(home);
        const dist = Math.hypot(hc.cx - oc.cx, hc.cy - oc.cy);
        const p = WAR_CAP_ESC0 + WAR_CAP_ESC1 * Math.max(0, 1 - dist / WAR_CAP_ESC_D);   // ②탈출 — 가까울수록↑
        if (rng() < p) {
          cv.esc = day; st.escaped = (st.escaped || 0) + 1;
          log(day, '포로 탈출 — ' + (npc.id || '?') + ' ' + hv.name + '→' + cv.home + ' 도보 귀향(거리 ' + dist.toFixed(0) + '·p ' + (p * 100).toFixed(2) + '%)');
          TQ.push({ npc, from: hv, to: home, eta: day + Math.max(1, Math.ceil(dist / WAR_MARCH)) });
        }
      }
      if (day % WAR_CAP_RANSOM_INT === 0) {   // ③몸값(마을 단위·드묾)
        const byHome = new Map();
        for (const npc of caps) { const cv = npc.captive; if (!cv || cv.esc != null) continue; if (!byHome.has(cv.home)) byHome.set(cv.home, []); byHome.get(cv.home).push(npc); }
        for (const [hn, list] of byHome) {
          const home = villages.find(v2 => v2 && v2 !== hv && v2.name === hn && v2.econ && v2.econ.npcs && v2.econ.npcs.length > 0);
          if (!home) continue; const he = home.econ, HN = Math.max(1, he.npcs.length);
          if (warFE(he) / HN <= WAR_CAP_RANSOM_FD) continue;               // 고향 식량 여유(>60일치)만 지불
          if (warGrudge(he, hv.name) >= WAR_CAP_RANSOM_GR) continue;       // 원한 깊으면 지불 거부
          if (rng() >= WAR_CAP_RANSOM_P) continue;
          const m = Math.min(list.length, Math.floor((he.storage.food || 0) / WAR_CAP_RANSOM_FOOD)); if (m < 1) continue;
          he.storage.food -= m * WAR_CAP_RANSOM_FOOD; e.storage.food = (e.storage.food || 0) + m * WAR_CAP_RANSOM_FOOD;
          const hc = centerOf(hv), oc = centerOf(home);
          const dist = Math.hypot(hc.cx - oc.cx, hc.cy - oc.cy);
          for (let k = 0; k < m; k++) { const npc = list[k]; npc.captive.esc = day; st.ransomed = (st.ransomed || 0) + 1; TQ.push({ npc, from: hv, to: home, eta: day + Math.max(1, Math.ceil(dist / WAR_MARCH)) }); }
          log(day, '몸값 — ' + hn + '→' + hv.name + ' 식량 ' + (m * WAR_CAP_RANSOM_FOOD) + ' 지불, 포로 ' + m + '명 도보 귀향');
        }
      }
    }
  }

  // 교전 확정(assault·sortie 공통) — ★무저항 함락 검사 → 호스트 실체 훅(opts.onEngage — 관측자 근접 LiveBattle) → headless.
  //   onEngage가 true(실체 개전·w.phase='battle')면 되먹임·귀환은 실체 경로(war-live onResolved) 소유.
  function _opResolveEngage(w, day, why) {
    const D = w.def && w.def.econ;
    _opSetSiege(w, false, day);   // 개전=봉쇄 해제(전투가 봉쇄를 대체 — 랩 8283 정합)
    if (!D || D.npcs.length < 2) { _warWalkoverOutcome(w.atk, w.def, day, w.casus); }
    else {
      if (typeof opts.onEngage === 'function') { let took = false; try { took = !!opts.onEngage(w, day, why); } catch (_) { } if (took && w.phase === 'battle') return; }
      warResolveBattle(w, day);
    }
    w._sortie = false; w.phase = 'return'; w.eta = day + (w.marchDays || 1);
  }

  // headless 전투 판정 + 결과 되먹임(약탈·조공·warKill·노획·원한·트라우마·숙련성장). P1: 포로·방화 제외.
  // ★[P2·3인자 additive] warResolveBattle(w, day, precomputedRes) — 랩 전쟁실험실.html 3인자 분리 이식.
  //   precomputedRes({res,spec}) 있으면(server/war-live 실체 전투가 맵 시간축으로 이미 결판) → headless(runBattleHeadless)
  //     스킵하고 그 결과(runBattleHeadless 반환형 동형 res)로 되먹임만 수행. spec은 방어 veteranRoster 승계용.
  //   precomputedRes 없음(기존 2인자 headless 경로) → 내부 toBattleSpec+runBattleHeadless로 즉시 판정.
  //   ★byte 불변: precomputedRes undefined → 아래 if 조건 거짓 → else 분기 = 기존 2줄과 값·순서 동일(P1 헤드리스 회귀 동일).
  function warResolveBattle(w, day, precomputedRes) {
    const st = stats(), A = w.atk.econ, D = w.def.econ;
    if (!A || !D || A.npcs.length < 2 || D.npcs.length < 2) return;
    const rng = _battleRng(day, w.id);
    const _atkArmy = { composition: w.composition || { champion: 0, dagger: Math.max(1, w.force - (w.warriors || 0)), spear: 0, pike: 0, archer: 0 }, force: w.force, weapQ: (w.weapQ != null ? w.weapQ : (A._weapQ != null ? A._weapQ : _warWEAP_Q_STONE)), atkEcon: A };
    let _spec, _res;
    if (precomputedRes && precomputedRes.res) { _res = precomputedRes.res; _spec = precomputedRes.spec || toBattleSpec(_atkArmy, w.def, { terrain: 'village' }); }   // 맵 LiveBattle: 결과·스펙 승계(전술 스킵)
    else { _spec = toBattleSpec(_atkArmy, w.def, { terrain: 'village' }); _res = runBattleHeadless(_spec, rng); }   // 기존 경로 — precomputedRes undefined면 여기 = P1 byte 불변
    const atkWin = _res.winner === 'A'; st.battle++;
    const loserE = atkWin ? D : A, winnerE = atkWin ? A : D;
    const _atkDead = Math.min(A.npcs.length - 1, Math.max(0, _res.atkDead)), _defDead = Math.min(D.npcs.length - 1, Math.max(0, _res.defDead));
    const J = warJustice(A, w.def.name, w.casus);
    // ★[3파 포로 §18] 패자 사상 판정자 35% 기절→포로(warKill 前 분리 — 승자 전장 장악). 기절(후보)분은 사망에서 제외.
    //   승자 편입(warCaptiveIntake)은 warKill '이후' — 자군 사상 주사위가 방금 끌려온 포로를 집지 않게(림보 격리, 랩 수리 계승).
    const _capLoserVil = atkWin ? w.def : w.atk, _capWinnerVil = atkWin ? w.atk : w.def;
    const _capLDead = atkWin ? _defDead : _atkDead;
    const _capWSurv = atkWin ? Math.max(0, _res.atkSurv || 0) : Math.max(0, _res.defSurv || 0);
    const _capRoster = atkWin ? ((_spec && _spec._defComp && _spec._defComp.veteranRoster) || null) : (w._vetRoster || null);
    const _cap = warCapture(_capLoserVil, _capWinnerVil, _capLDead, _capWSurv, J, day, _capRoster, st);
    const atkCas = warKill(A, atkWin ? _atkDead : Math.max(0, _atkDead - _cap.cand), rng), defCas = warKill(D, atkWin ? Math.max(0, _defDead - _cap.cand) : _defDead, rng);
    warCaptiveIntake(_capWinnerVil, _cap.take);
    { const _aSet = new Set(A.npcs); if (w._vetRoster) warVeteranGrowth(A, w._vetRoster.filter(it => _aSet.has(it.npc))); const _dSet = new Set(D.npcs), _dvet = (_spec._defComp && _spec._defComp.veteranRoster) || null; if (_dvet) warVeteranGrowth(D, _dvet.filter(it => _dSet.has(it.npc))); }
    w.atk.pop = A.npcs.length; w.def.pop = D.npcs.length;
    const lc = atkWin ? defCas : atkCas, wc = atkWin ? atkCas : defCas;
    A._warFatigue = (A._warFatigue || 0) + atkCas * WAR_FAT_CAS; D._warFatigue = (D._warFatigue || 0) + defCas * WAR_FAT_CAS;
    warAddGrudge(D, w.atk.name, WAR_GRUDGE_UP + defCas * WAR_GRUDGE_CAS);
    st.cas += lc + wc;
    let outcome = '격퇴';
    if (atkWin) {
      st.atkWin++; warAddTrauma(A, w.def.name, -0.4);
      const loot = (D.storage.food || 0) * (WAR_J_LOOT0 + WAR_J_LOOT1 * J); D.storage.food = (D.storage.food || 0) - loot; A.storage.food = (A.storage.food || 0) + loot; st.loot++; outcome = '약탈곡물' + loot.toFixed(0) + '(J ' + J.toFixed(2) + ')';
      for (const pg of ['tigerhide', 'hide', 'bronze', 'jade']) { if (D.storage[pg] > 0) { const t = D.storage[pg] * WAR_LOOT_PREST * (WAR_J_PREST0 + WAR_J_PREST1 * J); D.storage[pg] -= t; A.storage[pg] = (A.storage[pg] || 0) + t; } }
      if (w.casus === 'feud') { warAddGrudge(A, w.def.name, -1); outcome += ' +원한해소'; }
      else if (w.casus === 'territory') { A._terrSat = day + 720; outcome += ' +경계양보(2년)'; }
      else if (w.casus === 'trade' && D.npcs.length > 4) { _addTribute(w.def, w.atk, day); outcome += ' +조공' + WAR_TRIB_YRS + '년'; }
      if (J < WAR_REP_TH) { A._warFatigue = (A._warFatigue || 0) + (WAR_REP_TH - J) * WAR_J_FAT; outcome += ' [불의전 피로]'; }
    } else { st.defWin++; warAddTrauma(A, w.def.name, WAR_TRAUMA_UP); A._warCaution = Math.min(1, (A._warCaution || 0) + 0.5); }
    warThirdPartyRep(w.atk, w.def, J, day);
    { const _ls = atkWin ? _res.defStart : _res.atkStart, _ld = atkWin ? _defDead : _atkDead; const _rn = atkWin ? (_res.routB || 0) : (_res.routA || 0), _rm = atkWin ? _res.routMrlB : _res.routMrlA; const _wf = warWeaponFlow(winnerE, loserE, _ls, _ld, _rn, _rm, st); if (_wf) outcome += ' +노획' + _wf.gain.toFixed(1) + (_wf.qUp ? '·품질↑' + _wf.newQ.toFixed(2) : ''); }
    // ★[3파 포로] 화면 층 인계 스태시 — villages._warOnResolved가 패자측 사상 표본 pid 일부를 호송 실체로 전환(승자 마을 이관).
    if (_cap.take.length || _cap.freed) {
      w._capResolve = { side: atkWin ? 'B' : 'A', npcs: _cap.take.slice(), freedN: _cap.freed, day };
      outcome += ' +포로' + _cap.take.length + '명' + (_cap.freed ? '(방면' + _cap.freed + ')' : '') + '[후보' + _cap.cand + '·J' + J.toFixed(2) + '·호송상한' + Math.floor(_capWSurv * WAR_CAP_ESCORT) + ']';
      log(day, '포로 ' + _cap.take.length + '명 ' + _capLoserVil.name + '→' + _capWinnerVil.name + (_cap.freed ? ' · 방면 ' + _cap.freed + '명(상한 초과 — 그 자리 해제·귀향)' : '') + ' — 승자 귀환에 호송(도보)');
    }
    log(day, '전투 ' + w.atk.name + ' vs ' + w.def.name + '[' + w.casus + '] → ' + (atkWin ? '공격승' : '방어승') + ' 사상 공' + atkCas + '·방' + defCas + ' [전술 공' + _res.atkStart + '→' + _res.atkSurv + ' 방' + _res.defStart + '→' + _res.defSurv + ' ' + _res.ticks + '틱] · ' + outcome);
  }

  // 봉쇄(econ 훅) 재계산 — ★[2파 작전층] 'siege 상태'의 방어 마을만(_opSetSiege 즉시 설치의 일일 조정자 겸 잔존 훅 안전망).
  //   WAR_OPS=0 폴백 = P1 단순화(march 창 전체 봉쇄) 그대로.
  function _recomputeSiege() {
    const under = new Set();
    if (WAR_OPS_ON) { for (const w of WARS) if (w.phase === 'march' && w.op === 'siege' && w.def && w.def.econ) under.add(w.def.econ); }
    else { for (const w of WARS) if (w.phase === 'march' && w.def && w.def.econ) under.add(w.def.econ); }
    for (const vil of villages) { const e = vil.econ; if (!e) continue; if (under.has(e)) { e._siegeBlock = true; e._siegeOutMul = WAR_SIEGE_OUTMUL; } else { if (e._siegeBlock) delete e._siegeBlock; if (e._siegeOutMul != null) delete e._siegeOutMul; } }
  }
  // 동원 생산정지(_laborMul) 재계산 — 동원 창 내 = max(0.2, 1−mobFrac), 아니면 1(무해)
  function _recomputeLabor(day) {
    for (const vil of villages) { const e = vil.econ; if (!e) continue; e._laborMul = (e._warMobUntil && day < e._warMobUntil) ? Math.max(0.2, 1 - (e._warMobFrac || 0)) : 1; }
  }

  // ═══════════ 일일 driver (전쟁실험실 warDaily 의 econ·headless 경로) ═══════════
  function daily(day) {
    const st = stats();
    const rng = makeRng(hash2(baseSeed, day | 0));   // 이 날의 결정론 rng(재부팅 안전 — day만 있으면 재현)
    // 1) 무기 숙련 성장(전사 상비 훈련·전 npc _ws* lazy 초기화) + 원한·트라우마·개전신중·전쟁피로 감쇠 + 목책 방어투자 + 원한최고 캐시
    for (const vil of villages) {
      const e = vil.econ; if (!e) continue;
      warTickWeaponSkills(e);
      if (e._grudge) for (const k in e._grudge) { const nv = e._grudge[k] * WAR_GRUDGE_DK; if (nv < 0.01) delete e._grudge[k]; else e._grudge[k] = nv; }
      if (e._warTrauma) for (const k in e._warTrauma) { const nv = e._warTrauma[k] * WAR_TRAUMA_DK; if (nv < 0.01) delete e._warTrauma[k]; else e._warTrauma[k] = nv; }
      if (e._warCaution) e._warCaution *= 0.99;
      if (e._warFatigue) e._warFatigue *= WAR_FAT_DK;
      let mx = 0; if (e._grudge) for (const k in e._grudge) if (e._grudge[k] > mx) mx = e._grudge[k]; e._grudgeMax = mx;
      if (Math.max(e._banditRisk || 0, mx) > 0.35 && (e.storage.wood || 0) > WAR_PAL_WOOD && (e._palisade || 0) < WAR_PAL_MAX) { e.storage.wood -= WAR_PAL_WOOD; e._palisade = Math.min(WAR_PAL_MAX, (e._palisade || 0) + 0.12); st.palisade++; log(day, vil.name + ' 목책 증축(방어+' + ((e._palisade * 100) | 0) + '%)'); }
    }
    // 2) 조공 징수(90일마다 곳간 8%)
    for (let i = TRIBUTES.length - 1; i >= 0; i--) {
      const t = TRIBUTES[i]; if (day >= t.until) { TRIBUTES.splice(i, 1); _syncTribToEcon(t.payer); continue; }
      if (day >= t.next) { const P = t.payer.econ, Q = t.payee.econ; if (P && Q) { const take = Math.min((P.storage.food || 0) * WAR_TRIB_RATE, P.storage.food || 0); if (take > 1) { P.storage.food -= take; Q.storage.food = (Q.storage.food || 0) + take; t.next = day + WAR_TRIB_INT; st.tribute++; if (warFE(P) / Math.max(1, P.npcs.length) > WAR_FOOD_RICH * 0.7) { warAddGrudge(Q, t.payer.name, WAR_GRUDGE_UP); TRIBUTES.splice(i, 1); _syncTribToEcon(t.payer); log(day, t.payer.name + ' 조공 거부(회복) → ' + t.payee.name + ' 원한'); } else { _syncTribToEcon(t.payer); log(day, '조공 ' + t.payer.name + '→' + t.payee.name + ' 곡물' + take.toFixed(0)); } } } }
    }
    // 2.5) ★[3파 포로] 일일 처리(동화·탈출·몸값·이송 — 포로 0이면 사실상 no-op·랩 warDaily 위치 정합)
    warCaptiveDaily(day);
    // 3) 행군→(eta 도달=링 도착)→★[2파 작전층] camp 결단 상태기계→귀환→동원 해제.
    //    WAR_OPS=0 폴백 = P1 원형(eta 즉시 headless — 자동 개전). ★자동 개전 폐지: ops 모드에선 도착≠개전.
    for (let i = WARS.length - 1; i >= 0; i--) {
      const w = WARS[i];
      if (w.phase === 'march') {
        if (!WAR_OPS_ON) { if (day < w.eta) continue; warResolveBattle(w, day); w.phase = 'return'; w.eta = day + w.marchDays; continue; }   // P1 폴백(구 궤적 그대로)
        if (w.op == null) w.op = 'march';   // 방어적(훅 경로·구 객체)
        if (w.op === 'march') {
          if (day < w.eta) continue;   // 행군 중
          w.op = 'camp'; w._arriveDay = day;
          log(day, w.atk.name + ' → ' + w.def.name + ' 앞 도착(포위 결정 링) — 주둔·결단');
        } else if (w.op === 'camp' || w.op === 'siege') {
          w._packRem = Math.max(0, (w._packRem || 0) - 1);   // camp/siege 1일 = 군량 팩 1일분 소모
          const e = w.atk.econ; if (e && e._warMobUntil) e._warMobUntil = Math.max(e._warMobUntil, day + (w.marchDays || 1) + 1);   // 원정 지속=동원 생산감소 지속(귀환 여유 포함)
        }
        _opDefenseDaily(w, day);                                        // 방어 3택(응전/버티기·히스테리시스 2일) + sortie 결단
        if (w._sortie && w.phase === 'march') { _opResolveEngage(w, day, 'sortie'); continue; }   // 방어 출격 → 교전(방어 결단으로만 열리는 전투)
        if (w.op === 'siege' && _opCheckSurrender(w, day)) continue;    // 무혈 항복 → 귀환 전환됨
        _opNpcDecide(w, day);                                           // 공격 결단(assault/siege/withdraw)
        if (w.op === 'assault' && w.phase === 'march') _opResolveEngage(w, day, 'assault');
      }
      else if (w.phase === 'battle') { /* ★[P2 LOD] 실체 전투(server/war-live) 진행 중 — 상태머신이 판정·되먹임(warResolveBattle 3인자)·귀환 전환 담당. daily 관여 안 함(랩 warDaily 정합). */ }
      else { if (day < w.eta) continue; const e = w.atk.econ; if (e) { e._warMobUntil = 0; e._warMobFrac = 0; } WARS.splice(i, 1); }
    }
    // 4) 원한 교역제재 발행(원한>문턱 상대 교역 기피)
    grudgeBlockSweep(day);
    // 5) 개전 명분 평가 — WAR_MIN_DAY 이후, 농번기 억제
    if (day >= WAR_MIN_DAY) {
    const mo = lMonth(day), seasonMul = (mo >= 4 && mo <= 8) ? 0.12 : 1;
    for (const V of villages) {
      const e = V.econ; if (!e || e.npcs.length < 6 || day < (e._warCd || 0) || WARS.some(w => w.atk === V) || (e._warFatigue || 0) > WAR_FAT_GATE) continue;
      const c = e.counts || {}, warriors = Math.round(c.warrior || 0), NV = e.npcs.length, fdV = warFE(e) / NV, prV = (e.lastStats && e.lastStats.prestige) || 0;
      if (warriors < 1) continue;
      const mb = e._expandMBMC ? e._expandMBMC.mb : 0, mc = e._expandMBMC ? e._expandMBMC.mc : 1;
      const Vc = centerOf(V);
      let best = null, bestU = 0;
      for (const U of villages) {
        if (U === V || !U.econ || U.econ.npcs.length < 3) continue;
        const eu = U.econ, NU = eu.npcs.length, Uc = centerOf(U), d = Math.hypot(Vc.cx - Uc.cx, Vc.cy - Uc.cy); if (d > WAR_RANGE) continue;
        const fdU = warFE(eu) / NU, prU = (eu.lastStats && eu.lastStats.prestige) || 0, gr = warGrudge(e, U.name);
        let casus = null, raw = 0;
        if (fdV < WAR_FOOD_CRISIS && fdU > WAR_FOOD_RICH) { casus = 'trade'; raw = warFE(eu) * WAR_LOOT / NV * (1 + gr); }
        if (mb > mc * 1.15 && day > (e._terrSat || 0) && d < warTerrR(V) + warTerrR(U) + 180) { const u = (mb - mc) * 0.05 * (1 + gr); if (u > raw) { casus = 'territory'; raw = u; } }
        if (fdV > WAR_FOOD_RICH && warriors >= 2 && prU > prV + 0.15) { const u = (prU - prV) * 8 * (1 + gr); if (u > raw) { casus = 'prestige'; raw = u; } }
        if (gr > WAR_FEUD_TH) { const u = gr * 16; if (u > raw) { casus = 'feud'; raw = u; } }
        if (!casus) continue;
        raw += NU * WAR_CAS_BASE * WAR_CAP_FRAC * warJustice(e, U.name, casus) * WAR_CAP_EU;
        const plan = _warNpcMobPlan(V, U, casus, d, day);
        if (!plan || !plan.viable) continue;
        const force = plan.forceCount;
        const pWin = plan.pWin * (1 - 0.6 * warTrauma(e, U.name)) * (1 - 0.4 * (e._warCaution || 0));
        const EU = pWin * raw - (1 - pWin) * force * WAR_CAS_W;
        if (EU > bestU) { bestU = EU; best = { U, casus, d }; }
      }
      if (best && bestU > WAR_UTIL_TH && rng() < 0.05 * seasonMul) warMobilize(V, best.U, best.casus, best.d, day);
    }
    }
    // 6) 봉쇄(_siegeBlock)·동원 생산정지(_laborMul) 재계산 — 이번 tick 신규 선포까지 반영(다음 econ 틱 적용).
    //   march 중 방어=봉쇄, 동원창(_warMobUntil) 내 공격=생산정지. 비활성 econ은 _laborMul=1(무해 복귀).
    _recomputeSiege();
    _recomputeLabor(day);
    st.active = WARS.length; st.tributes = TRIBUTES.length;
  }

  // 재부팅 복원 — 각 econ._warTribOut(serializeEcon 영속분) 에서 world TRIBUTES 재구성(payee 이름→래퍼).
  function rebuildFromEcon() {
    TRIBUTES.length = 0;
    const byName = new Map(villages.map(v => [v.name, v]));
    for (const vil of villages) { const e = vil.econ; if (!e || !Array.isArray(e._warTribOut)) continue; for (const t of e._warTribOut) { const payee = byName.get(t.payee); if (payee) TRIBUTES.push({ payer: vil, payee, until: t.until, next: t.next }); } }
    return TRIBUTES.length;
  }

  return {
    daily, stats, conscript, warMobilize, _warNpcMobPlan, warResolveBattle, toBattleSpec,
    grudgeBlockSweep, rebuildFromEcon, warTickWeaponSkills: (e) => warTickWeaponSkills(e),
    // ★[2파 작전층] 게이트·프로브 접점(호스트 villages.js가 OPS_ON으로 P3 게이팅)
    OPS_ON: WAR_OPS_ON, _opNpcDecide, _opCheckSurrender, _opDefenseDaily, _warWalkoverOutcome, _opDoSurrender, _opSetSiege, _opPackLoad, _opPackRefund,
    // ★[3파 포로] 접점
    CAP_ON: WAR_CAP_ON, warCaptiveDaily,
    get WARS() { return WARS; }, get TRIBUTES() { return TRIBUTES; },
  };
}

// ═══════════ 노출 (battle-core 패턴) ═══════════
const WarCore = {
  // 상수
  WAR_MIN_DAY, WAR_GRUDGE_UP, WAR_GRUDGE_CAS, WAR_GRUDGE_DK, WAR_FEUD_TH, WAR_FAT_CAS, WAR_FAT_DK, WAR_FAT_GATE, WAR_CD,
  WAR_CAS_W, WAR_UTIL_TH, WAR_TRAUMA_UP, WAR_TRAUMA_DK, WAR_AUX_MULT, WAR_MARCH, WAR_FOOD_CRISIS, WAR_FOOD_RICH, WAR_RANGE,
  WAR_LEVY, WAR_RAID_MIN, WAR_RATION, WAR_CAS_BASE, WAR_LOOT, WAR_LOOT_PREST, WAR_TRIB_YRS, WAR_TRIB_RATE, WAR_TRIB_INT,
  WAR_PAL_WOOD, WAR_PAL_MAX, WAR_J_CASUS, WAR_J_LOOT0, WAR_J_LOOT1, WAR_J_PREST0, WAR_J_PREST1, WAR_J_BURN, WAR_J_FAT,
  WAR_REP_TH, WAR_REP_K, WAR_GRUDGE_BLOCK_TH, WAR_SALV_DEAD, WAR_SALV_DESERT, WAR_DESERT_P0, WAR_DESERT_PM,
  WAR_BRONZE_WEAPQ_TH, WAR_BRONZE_WEAPQ_CAP, LEVY_SPEAR_FRAC, LEVY_PIKE_FRAC, WAR_MAX_ARMY, WAR_ENGAGE_MAX,
  WAR_DEF_ENGAGE_RATIO, WAR_DEF_ENGAGE_MIN, WAR_BATTLE_DT, WAR_BATTLE_MAXTICK, WAR_CASUS_MOB, WAR_HOME_KEEP_FRAC,
  WAR_HOME_KEEP_WAR, WAR_SUPPLY_DIST_K, WAR_MOB_ODDS_MIN, WAR_SIEGE_OUTMUL, WAR_CAP_EU, WAR_CAP_FRAC,
  WAR_WSKILL_MAX, WAR_WS_INIT, WAR_WS_INIT_DEF, WAR_WS_TRAIN, WAR_WS_VET_GAIN,
  // ★[2파 작전층 §15] 상수·정찰 근사(pure)
  WAR_SIEGE_PACK, WAR_PACK_CRIT, WAR_ASSAULT_ODDS, WAR_GAMBLE_ODDS, WAR_HOLD_GAMBLE, WAR_SORTIE_ODDS,
  WAR_DEF_RESPOND_ODDS, WAR_SURR_FOODD, WAR_SURR_ODDS, WAR_DEF_HYST, WAR_OPS_ON,
  _opDefEff, _opAtkOdds, _opDefOdds, _opDefEstPack,
  // ★[3파 포로 §18] 상수·pure
  WAR_CAP_ESCORT, WAR_CAP_ASSIM, WAR_CAP_ESC0, WAR_CAP_ESC1, WAR_CAP_ESC_D,
  WAR_CAP_RANSOM_INT, WAR_CAP_RANSOM_P, WAR_CAP_RANSOM_FOOD, WAR_CAP_RANSOM_FD, WAR_CAP_RANSOM_GR, WAR_CAP_ON,
  warCapture, warCaptiveIntake, _capComplete,
  // RNG·달력
  makeRng, hash2, lMonth,
  // 무기 숙련(pure)
  _warEnsureWSkills, warNPCWSkill, warJobWeaponType, warTickWeaponSkills, warVeteranGrowth, warSlingerCapByStone,
  // 편성·전투(pure)
  _warBronzeCapable, _warConscriptIndividual, _warConscriptAggregate, conscript, _warCompTotal, _warScaleComp, toBattleSpec, runBattleHeadless,
  // 원한·명분·노획(pure — econ 입력)
  warFE, warGrudge, warAddGrudge, warTrauma, warAddTrauma, warJustice, warWeaponFlow,
  // 팩토리
  createWar,
};
root.WarCore = WarCore;
if (typeof module !== 'undefined' && module.exports) module.exports = WarCore;

})(typeof window !== 'undefined' ? window : globalThis);
