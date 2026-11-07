'use strict';
// === server/village-view.js — T1072: 마을 화면 자료 `villageView` — 서버가 보내는 한 덩어리 ===================
//
// ★[★재민 11-01 · PM 카드 T1072 · 짝 T1070(마을 화면 클라)] 모양 정본 `설계/설계_마을화면_villageView.md` · 고정 자료 `test/fixtures/village-view.json`.
//   칸 전수표(시안 네 장의 칸 하나하나 → 서버 정본 · 있음/파생/없음)는 `보고/T1072_2026-11-02.md`.
//
// ★제1 규약 — **읽기만.** 이 파일엔 게임 규칙 · 새 수가 없다. 칸마다 서버 정본 함수(게시판 · 거래소 · 연대기 · 곳간 스냅숏 ·
//   소속 · 촌장 · 달력)를 부르고, 그 결과를 칸으로 묶을 뿐이다(사본 0 — 값을 다시 계산하지 않는다).
// ★제2 규약 — **없는 칸은 키가 없다.** 서버에 그 값이 없으면 만들지 않는다(빈 문자열 · 0 으로 채우지 않는다) — 회부 `인계/회부.md` T1072.
// ★제3 규약 — **품목은 구체다**(캐논 `설계/설계_품목·동사·거래소_캐논.md` §1). 뭉뚱그린 econ 재화(아래 `LUMPED`)가 품목인 줄은
//   싣지 않고 칸마다 **센다**(`withheld`) — 곳간 구성 = 구체 작물(ECON 2-c)이 서면 그 줄이 저절로 구체 품목으로 들어온다.
// ★제4 규약 — **원격 시세 0.** 게이트는 게시판 · 브리핑 · 연대기 · 거래소와 같은 술어(`villages.js _villageNear` · 260px)이고,
//   열 때 그 게이트를 지나야 한다. 열린 채 멀어지면 시세 칸 = `{ none:'far' }` · 나머지 칸은 마지막 값에서 멈춘다(멀리서 다시 안 읽는다).
// ★제5 규약 — 가입 계량기는 하나(`onboarding.contrib` — `membership.publicState` 가 `contribOf` 로 읽는 그 값).
//
// ★[T1084] 없던 29칸 중 지금 세계에서 셀 수 있는 둘을 더했다 — 집터 줄 `bedsGain` · 공사 줄 `kind:'clear'`(새 칸만 · 옛 이름 무변 · `보고/T1084_2026-11-02.md`).
// ★[T1105] PM 임시 `vvAdapt` 가 비워 둔 칸 중 셀 수 있는 셋을 더했다 — 지역 이름 `head.region`(그 존의 `displayName`) ·
//   먹을 것 며칠치 `dash.foodDays`(곳간 스냅숏 정본 값) · 땔감 충당 몫 `dash.fuelCov` · `dash.fuelShort`(econ 이 그날 남긴 `_fuelCov`).
//   새 칸만 · 옛 이름 무변 · 새 수 0. 겨울 준비 %(겨울 목표) · 인구 증감 · 다음 일 한 줄은 여전히 키가 없다(`보고/T1105_2026-11-03.md`).
// ★[T1116] 창고 탭(재민 11-01 "창고 · 각 물품별 시세")에 셀 수 있는 것을 더했다 — 곳간 줄 하루 수요 `use` · 값 래치 `priceUp`/`priceDown` ·
//   모자란 것 / 남는 것 줄 `store.short` · `store.glut`(사건 장부 래치 · 곳간이 바닥난 물건 포함) · 값 오르내림 줄 `store.priceMoves`(이 마을 장부 링 ·
//   지난 `PRICE_WIN` 날). 새 칸만 · 옛 이름 무변 · 새 수 0. 지난 날마다의 시세(30날 흐름)는 저장 칸이 없어 키가 없다(`보고/T1116_2026-11-03.md` · 회부).
// ★[T1189 · ★재민 11-05 문 24 권고대로] 빈칸 — ① 겨울 준비 `dash.winter`(먹을 것 며칠치 ÷ 겨울 끝까지 남은 날) ② 마을 꼴 `head.kindKo` ⑥ 시세 흐름 `prices.trend`
//   (econ 행 30날 고리 · `villages.js _t1189PxRecord`) ⑦ kg `store.rows[].kg` — ⑤ 재료 가져오기는 존 문 `village_site_give`(`villages.js playerSiteGive`) · ③ ④ ⑧ ⑨ 는 화면 몫/무변.
// ★[T1169 · K18] 촌장 「일 맡기기」 명부 `members.assign`(게시판 판 T1085 와 같은 `assignRoster` · 같은 술어 · 촌장에게만 · 아니면 키 없음).
//
// 보내는 때: 열 때 칸 전부(`full:true`) · 열려 있는 동안 **JSON 이 바뀐 칸만**(`full:false`) — 존의 5초 박자(아래 `TICK_MS`) +
//   마을 장부 메시지(납품 · 교환 · 기부 · 꺼내기 …) 직후 한 번. 닫거나 끊기면 표지를 지운다.

const Events = require('./events');
const HutStages = require('./hut-stages');
const ZoneConfig = require('./zone-config');

// ── 뭉뚱그린 재화 — 캐논 §1 의 "카테고리"(food/ore/forage/cooked/fish/meat) + 연장 · 무장(연장 · 무기 · 갑옷 — 시안은 "돌도끼"처럼 그 물건을 쓴다).
//   ⚠목록 하나는 여기뿐이다(하네스도 이것을 읽는다). 정본 목록이 서버에 따로 없어 회부에 올렸다(T1072 ④).
const LUMPED = new Set(['food', 'fish', 'meat', 'cooked_food', 'fruit', 'vegetable', 'mushroom', 'herb', 'ore', 'tool', 'iron_tool', 'bronze_tool', 'weapon', 'armor']);
if(require('./ore-goods').ON)LUMPED.delete('ore');
const isLumped = (r) => r != null && LUMPED.has(String(r));

// ★열려 있는 동안 다시 읽는 박자 — 존의 5초(`zone.js` 바닥 물건 정리 `setInterval(…, 5000)` · 잠든 존 유지보수와 같은 수 · 새 수 0).
const TICK_MS = Math.max(1000, parseInt(process.env.VILLAGE_VIEW_MS || '5000', 10) || 5000);
const SLOTS = ['head', 'me', 'dash', 'requests', 'news', 'projects', 'members', 'store', 'prices', 'gate'];

let H = null;          // { SimVillages, Membership, VillageKin, send, players, jobKo, timer }
const OPEN = new Map();   // 사람 pid → { player, vid, numeraire, seq, last: {칸: JSON} }
const ST = { open: 0, full: 0, delta: 0, deltaSlots: 0, same: 0, far: 0, busySkip: 0, err: 0, buildUs: 0, builds: 0, maxUs: 0, priceReuse: 0 };

function init(h) {
  H = h || null;
  if (H && H.timer !== false) { const t = setInterval(tickAll, TICK_MS); if (t.unref) t.unref(); }
}

const ko = (r) => (Events.koRes ? Events.koRes(r) : r);
let _W; const _kgOf = (r) => { if (_W === undefined) { try { _W = require('./weights'); } catch (e) { _W = null; } } try { return (_W && _W.kgOf) ? (+_W.kgOf(r) || 0) : 0; } catch (e) { return 0; } };   // ★[T1189 ⑦] 무게 정본
const _r = (x, n) => (Number.isFinite(+x) ? +(+x).toFixed(n) : null);

// 다음 겨울 첫날까지(겨울이면 0) — 달력 정본(`calendarOf` 의 철 첫날 · 철 길이)만 따라간다(365 · 90 같은 수 0).
function toWinter(day) {
  let c = Events.calendarOf(day);
  if (c.season === 'winter') return 0;
  let d = day;
  for (let i = 0; i < 4; i++) {
    d = d - c.dayOfSeason + 1 + c.seasonDays;
    c = Events.calendarOf(d);
    if (c.season === 'winter') return d - day;
  }
  return null;
}

// ── 칸 만들기 ─────────────────────────────────────────────────────────────────────────
function _head(src, vil) {
  const day = src.day, c = Events.calendarOf(day);
  const out = { vid: vil.dbId | 0, name: vil.name, day,
    cal: { label: c.label, season: c.season, seasonKo: c.seasonKo, dayOfSeason: c.dayOfSeason, seasonDays: c.seasonDays, year: c.year } };
  // ★[T1105] 지역 이름 — 이 마을이 선 존의 이름(`zone-config.js` `ZONES[id].displayName` · 한반도 존 = "새벌"). 게임이 이미 "지역"으로 부르는
  //   그 이름이다(존 고르기 · 존이 가득 찼을 때 "다른 지역을 고르십시오" — `public/client/30-n-net.js` · 다른 곳에 있는 사람 `zone.js _elsewhereLine`).
  //   존을 모르는 판(헤드리스)이면 키가 없다.
  const zc = src.zoneId && ZoneConfig.ZONES ? ZoneConfig.ZONES[src.zoneId] : null;
  if (zc && zc.displayName) out.region = zc.displayName;
  //   ★[T1189 ② · 문 24 ② ㄱ] 마을 꼴 — 회관 행의 꼬리표 낱말(`villages.js` `_kindKo` · 농촌 · 어촌 · 광산 · 임업). 부제 = 지역 이름 + 마을 꼴(화면이 잇는다). 없으면 키 없음.
  if (vil._kindKo) out.kindKo = vil._kindKo;
  if (Number.isFinite(vil.econ.foundedDay)) out.age = day - (vil.econ.foundedDay | 0);
  let ch = null; try { ch = H.VillageKin && H.VillageKin.chiefOf ? H.VillageKin.chiefOf(vil) : null; } catch (e) { ch = null; }
  out.chief = ch ? { name: ch.name || null, npc: !!ch.npc } : null;
  return { slot: out, chiefId: ch ? String(ch.id) : null };
}
function _me(player, vil) {
  let ps = null; try { ps = H.Membership && H.Membership.publicState ? H.Membership.publicState(player, vil) : null; } catch (e) { ps = null; }
  if (!ps) return null;
  const me = { member: ps.vid != null && (ps.vid | 0) === (vil.dbId | 0), memberVid: ps.vid, contrib: ps.contrib | 0, need: ps.need | 0, left: Math.max(0, (ps.need | 0) - (ps.contrib | 0)), chief: !!ps.chief, offer: ps.offer };
  //   ★[T1137] 켬(`ps.open`)에서만 칸 — 가입 문 · 인정 구성원 · 다시 들기(분 · 올림 — 1분에 한 번만 바뀐다) · 이 마을 수수료율(끔 = 종전 바이트)
  if (ps.open) {
    me.open = true; me.recognized = !!ps.recognized && me.member;
    me.coolMin = ps.coolMs > 0 ? Math.max(1, Math.ceil(ps.coolMs / 60000)) : 0;
    if (ps.fee != null) { me.fee = ps.fee; me.feeBase = ps.feeBase; me.feeMember = ps.feeMember; }
  }
  return me;
}
// 부탁 — 게시판 줄 그대로. 구하는 품목이 뭉뚱그린 것이면 줄째 빼고 센다(`withheld`).
//   갚는 품목만 뭉뚱그린 것이면(거의 `food` 곡식) 부탁은 싣고 **갚는 칸 · 문장**(`boardLine` = "나무 18 → 곡식 4")만 뺀다(`rewardWithheld`).
function _requests(board) {
  const rows = []; let withheld = 0, rewardWithheld = 0;
  for (const r of board.rows || []) {
    if (isLumped(r.item)) { withheld++; continue; }
    const o = { res: r.item, ko: ko(r.item), item: (r.give && r.give[0]) || null, qty: r.qty, filled: r.filled, remain: r.remain };
    if (r.rewItem && isLumped(r.rewItem)) rewardWithheld++;
    else Object.assign(o, { rewRes: r.rewItem || null, rewKo: r.rewItem ? ko(r.rewItem) : null, rewQty: r.rewQty, line: r.line });
    rows.push(o);
  }
  return { rows, withheld, rewardWithheld };
}
// ★[T1103] 줄은 마을 화면용 하십시오체(`villages.js villageViewNews` → `Events.newsLine`) — 사건 · 술어 · 줄 수는 게시판 소식과 같다(촌장 말 하게체 줄은 게시판 그대로).
function _news(board, day, vid) {
  const V = H && H.SimVillages;
  const src = (V && V.villageViewNews) ? V.villageViewNews(vid | 0) : (board.news || []);
  const rows = []; let withheld = 0;
  for (const r of src) {
    if (isLumped(r.item)) { withheld++; continue; }
    rows.push({ line: r.line, type: r.type, day: r.day, heard: r.heard, ago: day - (r.heard | 0), from: r.from || null });
  }
  return { rows, withheld };
}
function _projects(src, vil, chron) {
  const now = [], E = src.E; let withheld = 0;
  const stages = (E && E.hutStageCount) ? E.hutStageCount() : HutStages.HUT_STAGES.length;
  const site = (s2, kind) => {
    const st = s2.stage | 0, o = { kind, stage: st, stages };
    const lab = (HutStages.HUT_STAGES[st] || {}).label; if (lab) o.stageLabel = lab;
    return o;
  };
  if (vil._site) {
    const o = site(vil._site, 'house');
    // 자재 — 집 행위가 켜진 판에서만 집터 장부(`_site.mat`)가 선다(`T400_BUILD_ACT` · econ `houseCrewDay`). 꺼진 판은 econ 이 추상 차감 — 칸 없음.
    if (E && E.T400_BUILD_ACT && E.hutEconStage) {
      const need = E.hutEconStage(vil._site.stage | 0) || {}, mat = vil._site.mat || {};
      o.need = [];
      //   ★[T1103] `give` — 그 자재로 곳간에 들어가는 내 물건 키(기부 문 `village_donate` 이 받는 키 · 정본 `playerVillageDepositMap` 그대로 · 화면 "재료 가져오기"가 쓴다)
      const dm = (H.SimVillages && H.SimVillages.playerVillageDepositMap) ? H.SimVillages.playerVillageDepositMap() : {};
      for (const k of Object.keys(need)) { if (isLumped(k)) { withheld++; continue; } o.need.push({ res: k, ko: ko(k), need: _r(need[k], 2), have: _r(mat[k] || 0, 2), give: Object.keys(dm).filter((it) => dm[it] === k) }); }
    }
    // ★[T1084] 다 지으면 늘어나는 침상 — econ 정본 `hutCapPerHut()`(층당 정원 × 층수 상한 1). 완공(`villages.js _lifeCompleteHouse`)이
    //   `_houseCells` 에 한 칸을 더하고 침상 명부 `_mapBedsOf` = 칸 수 × 층당 정원이라, 집 한 채가 더하는 침상이 바로 이 수다(새 수 0).
    //   의뢰 집터(`phouse`)는 마을 침상 명부에 안 들어간다(그 집은 의뢰한 사람 것) — 그 줄엔 키가 없다.
    if (E && E.hutCapPerHut) { const b = E.hutCapPerHut(); if (b > 0) o.bedsGain = b; }
    now.push(o);
  }
  if (vil._psite) { const o = site(vil._psite, 'phouse'); if (vil._psite.ownerName) o.ownerName = vil._psite.ownerName; now.push(o); }
  // ★[T1084] 밭 일구기 — 개간 술어 정본(`villages.js _lifeNeedClear` · 손잡이 `src.needClear`)이 참이고 농부 몸이 있는 동안 선다.
  //   그 둘이 개간 두 길(몸 · 일괄 `_lifeClearDay(vil, farmerN)`)의 문 그대로다. 지금 밭 칸 수 · 지금 개간을 쥔 몸 수(`_clearCrew`)만 싣는다 —
  //   목표 칸 수는 술어 안의 식이라 싣지 않는다(옮겨 적으면 사본 · 회부 T1084).
  {
    let nc = false; try { nc = !!(src.needClear && src.needClear()); } catch (e) { nc = false; }
    let farmer = false;
    if (nc) for (const pid of vil.npcPids || []) { const q = H.players && H.players.get(pid); if (q && q.simJob === 'farmer') { farmer = true; break; } }
    if (nc && farmer) now.push({ kind: 'clear', fields: vil._farmSet ? vil._farmSet.size : 0, crew: vil._clearCrew | 0 });
  }
  for (const c of (src.world && src.world.caravans) || []) {
    if (!c || c._done || c.from !== vil.econ) continue;
    const to = src.nameOfEcon ? src.nameOfEcon(c.to) : null;
    const back = c.state !== 'outbound';
    const o = { kind: 'caravan', state: c.state, to, toDays: Math.max(0, ((back ? c.returnArriveDay : c.arriveDay) | 0) - src.day) };
    const cargo = [];
    const add = (res, n) => { if (!res || !(+n > 0)) return; if (isLumped(res)) { withheld++; return; } cargo.push({ res, ko: ko(res), n: _r(n, 2) }); };
    if (c.basket) { for (const x of (back ? (c._retBasket || []) : c.basket)) add(x.res, x.amt); }   // ★[T1136] 바구니 — 품목마다(끔 = 바구니 없음 = 아래 종전 두 줄)
    else if (back) { add(c._returningRes, c._returningAmt); add(c._returningRes2, c._returningAmt2); }
    else { add(c.giveRes, c.giveAmt); add(c.giveRes2, c.giveAmt2); }
    o.cargo = cargo;
    now.push(o);
  }
  // 끝낸 일 — 연대기(올해)의 완공(`BUILT`)만. 문장은 장부가 쓴 그대로.
  const done = [];
  //   ★[T1103] 줄 = 같은 사건의 하십시오체(`Events.newsLine` — 곳간 · 움집은 사건의 `item` 이 가른다 · 연대기가 그 칸을 싣는다)
  if (chron && !chron.err) for (const b of chron.seasons || []) for (const x of b.items || []) if (x.type === 'BUILT') done.push({ line: (Events.newsLine && Events.newsLine(x)) || x.line, day: x.day, ago: src.day - (x.day | 0) });
  done.sort((a, b) => b.day - a.day);
  return { now, done, withheld };
}
function _members(vil, chiefId) {
  const people = [], tally = new Map();
  for (const pid of vil.npcPids || []) {
    const p = H.players && H.players.get(pid);
    if (!p) continue;
    const job = p.simJob || null;
    people.push({ pid, name: p.name || null, job, jobKo: job ? ((H.jobKo && H.jobKo[job]) || null) : null, act: p._lifeAct || '', chief: chiefId != null && String(pid) === chiefId });
    if (job) tally.set(job, (tally.get(job) || 0) + 1);
  }
  const byJob = [...tally].map(([job, n]) => ({ job, ko: (H.jobKo && H.jobKo[job]) || null, n })).sort((a, b) => (b.n - a.n) || (a.job < b.job ? -1 : 1));
  return { n: people.length, byJob, people };
}
// ★[T1169 · K18 · T1115 회부 2] 촌장 「일 맡기기」 명부 — 게시판 판(T1085 `_t1085Members`)이 싣던 **그 자료 그대로**(`SimVillages.assignRoster` 하나 · 사본 0).
//   싣는 때도 같다: 사람이 세운 마을(`econ.founder`) · 이 사람이 촌장(`me.chief` = `membership.publicState().chief` = `chiefCached` — 게시판과 같은 술어).
//   아니면 키가 없다(제2 규약). 한 줄 = econ 사람(몸 이름 없음 — 게시판과 같다): id · 지금 일 · 나이 · 남은 날 · 원정 중 · 촌장이 맡김. 고를 일 = 자리 있는 직업 · 빈자리.
function _assign(vil, me) {
  const V = H && H.SimVillages;
  if (!me || !me.chief || !V || !V.assignRoster || !vil || !vil.econ || !vil.econ.founder) return null;
  const R = V.assignRoster(vil);
  if (!R) return null;
  const k = (j) => (H.jobKo && H.jobKo[j]) || j;
  return { rows: R.rows.map((x) => Object.assign(x, { jobKo: k(x.job) })), jobs: R.jobs.map((x) => Object.assign(x, { ko: k(x.job) })), cooldown: R.cooldown };
}
// 대시보드 — 옛 셋(`pop` · `toWinter` · `projectsN`) 그대로 + [T1105] 서버에 이미 있는 두 값(값이 없으면 키가 없다).
//   `foodDays` = 곳간 스냅숏 정본(`villages.js playerVillageInventory().foodDays` = econ `totalFoodEquivalent ÷ 인구` — 한 사람 하루 1 이라 "며칠치")
//     그대로. 새로 오는 사람 문(`newcomers.js` "자립 n일")과 같은 함수다. ⚠겨울 준비 **%** 가 아니다 — 분모(겨울 목표)가 없다(T779 가 걷었다 · 회부).
//   `fuelCov` = econ 이 그날 연료 단계에서 남긴 땔감 충당 몫(`sim/economy-sim.js` `_fuelCov` = (짚 + 잔가지·껍질 + 땔나무) ÷ 그날 땔감 수요 · 0..1 ·
//     겨울엔 추위만큼 수요가 커진다). econ 이 이 값으로 건강을 깎는다(`stats.fuelCov`). 소수 둘째 자리(이 파일 `_r` 관례) ·
//     `fuelShort` = 그 값이 1 아래(오늘 쓸 땔감을 다 못 땠다). 첫 econ 날 전엔 둘 다 키가 없다.
//     ⚠이것도 "겨울 대비" 가 아니라 **오늘** 몫이다 — 겨울 목표는 위와 같이 회부.
// ★[T1189 ① · 문 24 ① ㄱ] 겨울 준비 — 먹을 것 며칠치(`foodDays`) ÷ **겨울 끝까지 남은 날**(`winterLeft` — 달력 정본: 겨울이면 이번 겨울 남은 날 ·
//   아니면 다음 겨울 첫날까지 + 그 겨울 날 수). `dash.winter[]` 한 줄 `{ label:'먹을 것', frac, short, days, need }`(frac 은 1 에서 멈춘다 · short = 며칠치 < 남은 날).
//   ⚠카드 원문은 "다음 수확까지"(T1179 수확창)인데 그 창이 main 에 아직 없다 — 그 전 꼴("남은 겨울 날")이다(T1179 가 서면 분모 한 줄을 바꾼다).
//   땔감은 이 줄에 넣지 않는다 — "오늘 땔감"(`fuelCov` · `fuelShort`)이 따로 선다(화면).
function winterLeft(day) {
  const c = Events.calendarOf(day);
  if (c.season === 'winter') return c.seasonDays - c.dayOfSeason + 1;
  const t = toWinter(day);
  return t + Events.calendarOf(day + t).seasonDays;
}
function _dash(src, vil, projects, inv) {
  const out = { pop: vil.econ.npcs.length, toWinter: toWinter(src.day), projectsN: projects.now.length };
  if (inv && Number.isFinite(inv.foodDays)) out.foodDays = inv.foodDays;
  if (Number.isFinite(out.foodDays)) {
    const need = winterLeft(src.day);
    if (need > 0) out.winter = [{ label: '먹을 것', frac: _r(Math.min(1, out.foodDays / need), 2), short: out.foodDays < need, days: out.foodDays, need }];
  }
  const fc = vil.econ._fuelCov;
  if (Number.isFinite(fc)) { out.fuelCov = _r(fc, 2); out.fuelShort = out.fuelCov < 1; }
  return out;
}
// 창고 — 곳간 줄(T1072) + [T1116] 하루 수요 `use` · 값 래치 `priceUp`/`priceDown` · 모자란 것/남는 것 줄 · 값 오르내림 줄.
//   ★[T1116] 새 수 0 · 새 문턱 0 · 새 저장 0 — 전부 사건 장부(`events.js createLedger`)와 econ 이 이미 쥔 값을 읽는다.
//   · `use` = econ 하루 소비 EMA(`_consEMA` — `daysOf` 의 분모 그대로 · 소수 둘째 자리). 0 이면 키가 없다(`daysOf` 가 null 인 줄).
//   · `priceUp`/`priceDown` = 장부의 값 래치(`detOf().up/down` — `PRICE_SPIKE`/`PRICE_DROP` 이 선 뒤 풀리기 전까지 참 · `events.js` ③④).
//     장부가 그 물건 값을 자기평균 창(`cfg.PRICE_WIN` 30날)만큼 지켜보기 전엔(`pN < PRICE_WIN` · 재기동 직후 포함) 판정이 없어 **키가 없다**.
//   · `short`/`glut` 줄 = 같은 장부의 모자람 · 넘침 래치(`STOCK_SHORTAGE`/`STOCK_GLUT` — 문턱 `SHORT_DAYS`/`GLUT_DAYS` × 소비 EMA · 히스테리시스 `HYST`).
//     래치는 소비 EMA 가 0 보다 큰 품목에서만 선다 ⇒ 후보 = 곳간 줄 ∪ `_consEMA` 키. 곳간이 바닥난 물건(스냅숏에 없는 줄)도 `qty:0` 으로 든다.
//     차례 = 곳간 스냅숏 차례(묶음 표 `PV_INV_GROUPS`) 뒤 `_consEMA` 키 차례 — 새 정렬 규칙 0.
//   · `priceMoves` = 이 마을 장부 링(`ledger.ringOf` — 이 마을에서 난 사건 · DB `village_events` 에서 되살린 것 포함)의
//     `PRICE_SPIKE`/`PRICE_DROP` 중 지난 `PRICE_WIN` 날 것(새것부터) · 줄 = 하십시오체 `Events.newsLine`. 값 수(`mag` · `meta.p/avg`)는
//     싣지 않는다 — 장부의 그림자가격 원값이라 시세 칸(거래소 정본 · 기준 품목 환산)과 다른 자(사본 0 · 회부 T1116 1).
//   ⚠지난 날마다의 시세 줄(30날 흐름)은 저장 칸이 없어 키가 없다 — 회부 T1116 1.
const PRICE_MOVE = new Set(['PRICE_SPIKE', 'PRICE_DROP']);
function _store(src, vil, inv) {
  const L = src.ledger, ema = vil.econ._consEMA || {}, vid = vil.dbId | 0;
  const cfg = (L && L.cfg) || Events.CFG;
  const detOf = (r) => ((L && L.detOf) ? L.detOf(vid, r) : null);
  const line = (r, q) => {
    const e = +ema[r] || 0, o = { res: r, ko: ko(r), qty: q, daysOf: e > 0 ? _r(q / e, 1) : null };
    if (e > 0) o.use = _r(e, 2);
    //   ★[T1189 ⑦ · 문 24 ⑦ ㄱ] 단위 둘 — 낱개(`qty` 그대로) · kg(= 낱개 × 무게 정본 `weights.kgOf` · 소수 첫째 자리). 무게를 모르는 품목은 키 없음.
    const kg = _kgOf(r); if (kg > 0) o.kg = _r(q * kg, 1);
    return o;
  };
  const rows = [], short = { rows: [], withheld: 0 }, glut = { rows: [], withheld: 0 }, seen = new Set(); let withheld = 0;
  const latch = (r, q, d) => {
    if (!d || !(d.short || d.glut)) return;
    if (isLumped(r)) { if (d.short) short.withheld++; if (d.glut) glut.withheld++; return; }
    if (d.short) short.rows.push(line(r, q));
    if (d.glut) glut.rows.push(line(r, q));
  };
  for (const g of (inv && inv.groups) || []) for (const it of g.items || []) {
    seen.add(it.r);
    const det = detOf(it.r);
    latch(it.r, it.q, det);
    if (isLumped(it.r)) { withheld++; continue; }
    const o = Object.assign(line(it.r, it.q), { short: !!(det && det.short), glut: !!(det && det.glut) });
    if (det && (det.pN | 0) >= cfg.PRICE_WIN) { o.priceUp = !!det.up; o.priceDown = !!det.down; }
    rows.push(o);
  }
  for (const r of Object.keys(ema)) { if (seen.has(r) || r.charCodeAt(0) === 95) continue; latch(r, 0, detOf(r)); }   // 곳간 스냅숏에 없는(바닥난) 물건
  const priceMoves = { rows: [], withheld: 0, days: cfg.PRICE_WIN };
  const ring = (L && L.ringOf) ? L.ringOf(vid) : [];
  for (let i = ring.length - 1; i >= 0; i--) {
    const ev = ring[i], ago = src.day - (ev.day | 0);
    if (ago >= cfg.PRICE_WIN) break;   // 링은 날 오름차순 — 창 밖이면 더 볼 것이 없다
    if (ago < 0 || !PRICE_MOVE.has(ev.type)) continue;
    if (isLumped(ev.item)) { priceMoves.withheld++; continue; }
    priceMoves.rows.push({ res: ev.item, ko: ko(ev.item), type: ev.type, day: ev.day | 0, ago, line: Events.newsLine(ev) });
  }
  return { rows, shortDays: cfg.SHORT_DAYS, glutDays: cfg.GLUT_DAYS, withheld, short, glut, priceMoves };
}
// ★시세표 입력의 지문 — 거래소 정본(`trade.board`)이 읽는 것: 그날 · 곳간(`v.storage`) · 내 짐(`mine`) · 기준 품목 · 걸린 의뢰의 보상(팔지 않는 품목).
//   열린 동안 다시 읽을 때 지문이 같으면 지난 시세 칸을 그대로 둔다 — 값은 언제나 정본이 낸 그것이다(하루 캐시가 아니다: 곳간이 한 톨만 움직여도 다시 부른다).
//   ⚠지문은 **열린 동안의 다시 읽기**에만 쓴다(열 때 · 기준을 바꿀 때는 늘 정본을 부른다). 정본 한 번이 ⑥ 값의 거의 전부다(`gluttedAt` 이 품목마다 시세를 두 번 낸다).
function pricesKey(src, vil, player, numeraire, board) {
  return src.day + '|' + JSON.stringify(vil.econ.storage || {}) + '|' + JSON.stringify(player.inventory || {}) + '|' + (numeraire || '') + '|'
    + (board.rows || []).map((r) => r.rewItem || '').join(',');
}
// ★[T1189 ⑥ · 문 24 ⑥ ㄱ] 시세 흐름 — 마을 econ 행의 30날 고리(`villages.js _t1189PxRecord` · 하루 한 줄 · 거래소 정본 값을 받아 적은 것)를
//   지금 고른 기준 품목으로 나눈다(거래소 `num` 과 같은 나눗셈 · 같은 자리수 `trade.sig` — 값을 새로 계산하지 않는다).
//   `prices.trend = { days, rows[] { res, pts[] { ago, num } } }` — 시세 칸(`prices.rows`)에 있는 품목만 · 오래된 것부터 · 그날 기준이나 품목 값이 없으면 그 점은 없다.
//   시세 칸 안에 산다 ⇒ 멀면(`none:'far'`) 같이 없다(원격 시세 0 · 제4 규약). 고리가 비면 키 없음.
function _trend(vil, P, day) {
  const ring = vil && vil.econ && Array.isArray(vil.econ._t1189Px) ? vil.econ._t1189Px : null;
  if (!P || P.none || P.pick || !P.numeraire || !ring || !ring.length) return;
  const T = require('./trade'), n = P.numeraire, rows = [];
  for (const r of P.rows || []) {
    const pts = [];
    for (const x of ring) { const pn = +(x.p || {})[n] || 0, p = +(x.p || {})[r.res] || 0; if (pn > 0 && p > 0) pts.push({ ago: (day | 0) - (x.d | 0), num: T.sig(p / pn) }); }
    if (pts.length) rows.push({ res: r.res, pts });
  }
  if (rows.length) P.trend = { days: (Events.CFG && Events.CFG.PRICE_WIN) || ring.length, rows };
}
function _prices(player, vid, numeraire) {
  const tb = H.SimVillages.villageTradeBoard ? H.SimVillages.villageTradeBoard(vid | 0, player.x, player.y, player.inventory, numeraire) : { err: 'far' };
  if (!tb || tb.err) return { none: 'far' };
  const rows = [], basis = []; let withheld = 0;
  for (const r of tb.rows || []) {
    if (isLumped(r.res)) { withheld++; continue; }
    rows.push({ res: r.res, ko: r.ko, num: r.num, glut: !!r.glut, canGive: !!r.canGive, canTake: !!r.canTake, mine: r.mine | 0 });
    if ((r.mine | 0) > 0 && r.canGive) basis.push({ res: r.res, ko: r.ko, mine: r.mine | 0 });
  }
  // 거래소의 기본 기준은 `food`(뭉뚱그린 재화)다 — 그 기준의 수는 싣지 않고 고르게 한다(고르면 그 기준으로 다시 온다).
  if (isLumped(tb.numeraire)) return { pick: true, basis, withheld };
  return { numeraire: tb.numeraire, numeraireKo: tb.numeraireKo, spread: tb.spread, rows, basis, withheld };
}

// 한 마을 열기 값 — 칸 전부. 게이트 밖이면 `{ far:true, err }`. `memo` = 열린 사람의 지난 시세(`{ key, slot }` · 없으면 늘 정본).
function build(player, vid, numeraire, memo) {
  const V = H && H.SimVillages;
  if (!V || !V.villageViewSrc || !V.villageBoard) return { err: '마을 화면을 열 수 없습니다.' };
  const src = V.villageViewSrc(vid | 0);
  if (!src) return { err: '그런 마을이 없습니다.' };
  const board = V.villageBoard(vid | 0, player.x, player.y);   // ★게이트 = 게시판과 같은 술어(260px)
  if (board.err) return { far: true, err: board.err };
  const vil = src.vil;
  const hd = _head(src, vil);
  const projects = _projects(src, vil, V.villageChronicle ? V.villageChronicle(vid | 0, player.x, player.y) : null);
  const inv = V.playerVillageInventory ? V.playerVillageInventory(vil) : null;   // 곳간 스냅숏 정본 — 창고 칸 · 먹을 것 며칠치가 같은 한 번을 읽는다
  const me = _me(player, vil);
  const view = {
    head: hd.slot,
    me,
    dash: _dash(src, vil, projects, inv),
    requests: _requests(board),
    news: _news(board, src.day, vid),
    projects,
    members: _members(vil, hd.chiefId),
    store: _store(src, vil, inv),
    prices: null,
    gate: { near: true },
  };
  { const A = _assign(vil, me); if (A) view.members.assign = A; }   // ★[T1169] 촌장에게만(없으면 키 없음 — 옛 바이트)
  const key = memo ? pricesKey(src, vil, player, numeraire, board) : null;
  if (memo && memo.key === key && memo.slot) { view.prices = memo.slot; ST.priceReuse++; }
  else { view.prices = _prices(player, vid, numeraire); _trend(vil, view.prices, src.day); if (memo) { memo.key = key; memo.slot = view.prices; } }
  return { view };
}
function _timed(player, vid, numeraire, memo) {
  const t0 = process.hrtime.bigint();
  let r;
  try { r = build(player, vid, numeraire, memo); } catch (e) { ST.err++; r = { err: '마을 화면을 읽지 못했습니다.' }; }
  const us = Number(process.hrtime.bigint() - t0) / 1e3;
  ST.builds++; ST.buildUs += us; if (us > ST.maxUs) ST.maxUs = us;
  return r;
}
const _pidOf = (p) => String(p.pid != null ? p.pid : p.playerId);

// ── 열기 · 닫기 · 바뀐 칸 ─────────────────────────────────────────────────────────────
function open(player, vid, numeraire) {
  if (!H || !player) return null;
  const memo = {};   // 열 때는 늘 정본을 부른다(빈 지문) — 그 결과가 열린 동안의 첫 지문이 된다
  const r = _timed(player, vid, numeraire, memo);
  if (r.err) { H.send(player.ws, { type: 'notice', text: r.err }); return r; }   // 게시판과 같은 말(마을 화면 이모지 0)
  const prev = OPEN.get(_pidOf(player));
  const o = { player, vid: vid | 0, numeraire: numeraire || undefined, seq: (prev && prev.vid === (vid | 0)) ? prev.seq : 0, last: {}, memo };
  for (const k of SLOTS) o.last[k] = JSON.stringify(r.view[k]);
  o.seq++;
  OPEN.set(_pidOf(player), o);
  ST.open++; ST.full++;
  H.send(player.ws, { type: 'village_view', vid: o.vid, seq: o.seq, full: true, view: r.view });
  return r;
}
function close(player) { if (player) OPEN.delete(_pidOf(player)); }
function isOpen(player) { return !!(player && OPEN.has(_pidOf(player))); }
// 다시 읽어 바뀐 칸만. 반환 = 보낸 칸 이름들(없으면 []).
function refresh(player) {
  const o = player && OPEN.get(_pidOf(player));
  if (!o) return [];
  if (H.players && H.players.get(player.pid) !== player) { OPEN.delete(_pidOf(player)); return []; }   // 끊겼다
  const r = _timed(player, o.vid, o.numeraire, o.memo);
  let next;
  if (r.err && r.far) { ST.far++; o.memo = {}; next = { gate: { near: false }, prices: { none: 'far' } }; }   // 멀리서는 시세 · 문만(나머지는 멈춘다)
  else if (r.err) return [];
  else next = r.view;
  const slots = {}, keys = [];
  for (const k of Object.keys(next)) { const s = JSON.stringify(next[k]); if (o.last[k] !== s) { o.last[k] = s; slots[k] = next[k]; keys.push(k); } }
  if (!keys.length) { ST.same++; return []; }
  o.seq++; ST.delta++; ST.deltaSlots += keys.length;
  H.send(player.ws, { type: 'village_view', vid: o.vid, seq: o.seq, full: false, slots });
  return keys;
}
function poke(player) { if (isOpen(player)) { try { return refresh(player); } catch (e) { ST.err++; } } return []; }
function tickAll() {
  if (!H || !OPEN.size) return;
  if (H.SimVillages && H.SimVillages.villagesBusy && H.SimVillages.villagesBusy()) { ST.busySkip++; return; }   // 장부 마감 중 — 다음 박자에
  for (const o of [...OPEN.values()]) { try { refresh(o.player); } catch (e) { ST.err++; } }
}
function stats() { return Object.assign({ openNow: OPEN.size, avgUs: ST.builds ? +(ST.buildUs / ST.builds).toFixed(1) : 0, tickMs: TICK_MS }, ST); }

module.exports = { meOf: _me, init, build, pricesKey, open, close, isOpen, refresh, poke, tickAll, stats, toWinter, LUMPED, isLumped, SLOTS, TICK_MS };
