'use strict';
// === server/winter.js — 겨울나기 공동 프로젝트 ==================================
//
// ★설계 정본: `설계/겨울나기_공동프로젝트_설계안.md` · 재민 판정 [2026-09-02 · T20]
//   W-1ⓐ 목표는 **마을 하루치 × D** · W-2ⓑ 지금 곳간이 받는 품목으로 · W-3ⓐ 납품은 현행 econ 재고로 ·
//   W-4ⓐ **미달이 NPC 를 굶기지 않는다** · W-5ⓐ 진행은 게시판 머리줄(새 패널 0) ·
//   W-6ⓐ 달성 보상은 **그 해 한정** 인출 한도 가산 · W-7ⓐ **양은 횟수와 별개 축**.
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★제1 규약: **이 파일은 세계를 바꾸지 않는다.** econ 재고도 인구도 안 건드린다.
//   플레이어가 낸 물건은 이미 `playerVillageDeposit` 이 곳간에 넣었고(그건 T20 이전부터 그렇다),
//   이 파일이 하는 일은 **그 양을 세어 두었다가 겨울 첫날에 한 번 말하는 것**뿐이다.
//   ⇒ 플레이어가 0 인 헤드리스 랩에서는 **아무 일도 일어나지 않는다**(사건 0 · 기준선 비트 동일).
//
// ★★제2 규약: **계량기는 하나다.** 기여 **횟수**(`onboarding.contrib`)를 이 파일은 읽지도 쓰지도 않는다.
//   여기서 세는 것은 **양**이고, 둘은 뜻이 다르다 — 양을 횟수에 실으면 부자가 소속을 산다(설계안 W-7).
//
// ★★제3 규약: **상수를 적지 않는다.** 겨울이 며칠인지·한 해가 며칠인지·가을이 언제 시작하는지는
//   전부 `Events.calendarOf`(달력 정본, econ `seasonOf` 하나에서 유도)에서 나온다.
//   1인 하루치 식량은 econ 의 `SUBSISTENCE_PER_NPC` 그 수다. 이 파일에 365·270·95·158.4 는 없다
//   (`test-winter ①` 이 소스 정규식으로 그걸 검사한다).
//
// ★★제4 규약: **시계는 econ 게임일 하나다**(`Events.calendarOf(gameDay())`).
//   ⚠`zoneGameDay`(벽시계 파생)는 서버가 꺼져 있던 동안 econ 틱과 **영구히 벌어진다**.
//   호스트가 넘겨 주는 `gameDay` 는 `zone.js gameDayNow`(= econDay 우선) 여야 한다.
//
// ★★제5 규약: **달성 여부를 저장하지 않는다.** 그건 사건(`WINTER_KEPT`)이고 연표가 영구히 갖고 있다.
//   `bonusOf` 는 연표에 물어본다 — T50 이 "처음 들어온 물건"을 연표로 되돌린 것과 같은 자리
//   (파생 상태를 두 번 적으면 그 둘이 갈리는 날이 온다).
//
// ★되돌릴 줄 하나: `EV_WINTER_OFF=1` ⇒ 공표·적립·판정·보상·머리줄이 전부 no-op = **T50 동작 정확히 재현**.

const path = require('path');
const Events = require(path.join(__dirname, 'events'));

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  // ★목표 = 마을 하루치 × 이 일수. **새 손잡이는 이것 하나다**(W-1ⓐ · 재민 확정 기본 5).
  D: Math.max(1, _num('WINTER_D', 5)),
  // 달성한 해에 마을 사람의 일일 인출 한도에 더해지는 몫. 다음 겨울 첫날에 만료된다(W-6ⓐ).
  BONUS: Math.max(0, _num('WINTER_BONUS', 2) | 0),
  // 브리핑에 이름을 적는 기여자 수(연표엔 안 적는다 — T50 ㉝ 계약).
  NAMES: Math.max(1, _num('WINTER_NAMES', 3) | 0),
  // 머리줄 막대 칸 수(표시 전용).
  BAR: Math.max(4, _num('WINTER_BAR', 10) | 0),
  OFF: _num('EV_WINTER_OFF', 0),
};

let H = null;          // { db, zoneId, gameDay(), econV2, ledger(), send, players }
let _rows = null;      // `${vid}|${year}` → { res, target, by: Map(pid → qty), got }
const _names = new Map();   // pid → 표시 이름(브리핑 전용 · 영속 안 한다)

function init(host) {
  H = host || {};
  _rows = null;
  return true;
}
function ready() { return !!(H && H.db && typeof H.gameDay === 'function'); }
const off = () => !!CFG.OFF;
function _day() { try { return H.gameDay() | 0; } catch (e) { return 0; } }
function _ledger() { try { return H.ledger ? H.ledger() : null; } catch (e) { return null; } }

// ── 달력 — **전부 유도한다** ────────────────────────────────────────────────
//   계절 이름('autumn'·'winter')은 달력 정본의 어휘지 이 파일이 발명한 상수가 아니다.
const calOf = (d) => Events.calendarOf(d | 0);
const isAnnounceDay = (d) => { const c = calOf(d); return c.season === 'autumn' && c.dayOfSeason === 1; };
const isJudgeDay = (d) => { const c = calOf(d); return c.season === 'winter' && c.dayOfSeason === 1; };
const yearOf = (d) => calOf(d).year;
// 공표일에서 본 마감 = **그 가을이 끝나는 날** = 겨울 첫날.
const deadlineFrom = (announceDay) => (announceDay | 0) + calOf(announceDay).seasonDays;
// 오늘 기준 **가장 최근 겨울 첫날**. 그 해 마지막 날은 언제나 겨울이므로 거기서 계절 머리를 되짚는다.
function lastWinterStart(d) {
  const c = calOf(d);
  const yd = c.yearDays;
  const wThis = Events.seasonStartOf(c.year * yd + yd - 1);
  return (d | 0) >= wThis ? wThis : (wThis - yd);
}

// ── 목표 품목 — 서버가 고른다(게시판 문법). **표를 새로 적지 않는다** ────────
//   후보 = 곳간이 실제로 받는 재화(`ledger.deliverable.toEcon` — `PV_DEPOSIT_MAP` 정본 사슬)
//   그중 **econ 이 사람 수대로 먹는 것**(`SUBSISTENCE_PER_NPC`)만 남기고 가장 큰 것을 고른다.
//   ⚠`_consEMA` 를 쓰지 않는다 — econ 은 **식량 소비를 flow-EMA 에 폴드하지 않는다**
//     (economy-sim.js "식단은 가용성 기반 대체 소비"). 그래서 식량은 `_consEMA` 에 **아예 없고**,
//     설계안이 적은 `_consEMA[res] × D` 는 식량에 대해 성립하지 않는다(§0-ⓕ 실측).
let _econV2 = null;
function _subs() {
  try {
    if (!_econV2) _econV2 = (H && H.econV2) || require(path.join(__dirname, '..', 'sim', 'economy-sim-v2'));
    return _econV2.SUBSISTENCE_PER_NPC || {};
  } catch (e) { return {}; }
}
function pickRes() {
  const L = _ledger();
  const S = _subs();
  let best = null, bestQ = 0;
  const cands = (L && L.deliverable && L.deliverable.toEcon) ? [...L.deliverable.toEcon.keys()] : [];
  for (const r of cands) { const q = +S[r] || 0; if (q > bestQ) { bestQ = q; best = r; } }
  return best ? { res: best, perHead: bestQ } : null;
}
// N = round(인구 × 1인 하루치 × D) — "마을 하루치 × D"(W-1ⓐ) 를 식량이 실제로 가진 수로 읽은 것.
//   ★`dOverride` 는 **계측기 전용 인자**다(`scripts/winter-metrics.js` 가 D 를 쓸어 보려고 쓴다).
//     세계는 절대 이걸 넘기지 않는다 — 넘기지 않으면 `CFG.D`(env `WINTER_D`) 하나뿐이다.
//     계측기가 공식을 베껴 쓰지 않게 하려고 열어 둔 문이지, 두 번째 손잡이가 아니다.
function targetOf(vil, dOverride) {
  const p = pickRes();
  if (!p || !vil || !vil.econ) return null;
  const pop = (vil.econ.npcs || []).length;
  if (pop <= 0) return null;                      // 사람이 없는 마을엔 겨울나기도 없다
  const D = Math.max(1, (+dOverride > 0) ? +dOverride : CFG.D);
  const n = Math.max(1, Math.round(pop * p.perHead * D));
  return { res: p.res, target: n, pop };
}

// ── 저장 — (마을, 해, 사람). 머리 행(`player_id=''`)이 그 해의 목표다 ─────────
function _load() {
  if (_rows) return _rows;
  _rows = new Map();
  if (!ready()) return _rows;
  try {
    const since = yearOf(_day()) - 1;             // 지난 해까지만 되살린다(그 앞은 그 해의 일이 아니다)
    for (const r of H.db.getVillageWinterSince(H.zoneId, since)) {
      const k = `${r.vid | 0}|${r.year | 0}`;
      let e = _rows.get(k);
      if (!e) { e = { res: null, target: 0, by: new Map(), got: 0 }; _rows.set(k, e); }
      if (!r.player_id) { e.target = +r.qty || 0; e.res = r.res || null; }
      else { e.by.set(r.player_id, +r.qty || 0); e.got += +r.qty || 0; }
    }
  } catch (e) { /* 복구 실패가 겨울을 죽이지 않는다 */ }
  return _rows;
}
function _entry(vid, year, make) {
  const m = _load();
  const k = `${vid | 0}|${year | 0}`;
  let e = m.get(k);
  if (!e && make) { e = { res: null, target: 0, by: new Map(), got: 0 }; m.set(k, e); }
  return e || null;
}
function _persist(vid, year, pid, qty, res) {
  try { H.db.upsertVillageWinter(H.zoneId, vid | 0, year | 0, pid || '', qty, res || null); } catch (e) {}
}

// ── ① 공표 — 가을 첫날. 마을마다 한 번 ───────────────────────────────────────
//   반환은 `SEASON_CHANGE` 사건의 `meta.winter` 로 실린다(새 사건 종류 0 — 설계안 §2.3).
//   ⚠연표는 이 meta 를 못 본다(T50 ㉝: 연표 문장은 vid·day·type·item·mag 만으로).
//     공표는 브리핑·게시판의 일이고, **연표에 남는 것은 판정**이다 — 그게 뜻에도 맞다.
function announce(vils, day) {
  const goal = {};
  const year = yearOf(day);
  for (const vil of (vils || [])) {
    if (!vil || vil.dbId == null) continue;
    const e0 = _entry(vil.dbId, year, false);
    if (e0 && e0.target > 0) { goal[vil.dbId | 0] = { res: e0.res, target: e0.target, deadline: deadlineFrom(day) }; continue; }
    const t = targetOf(vil);
    if (!t) continue;
    const e = _entry(vil.dbId, year, true);
    e.res = t.res; e.target = t.target;
    _persist(vil.dbId, year, '', t.target, t.res);
    goal[vil.dbId | 0] = { res: t.res, target: t.target, deadline: deadlineFrom(day) };
  }
  return goal;
}

// ── ①b 겨울 몫 납품 — **의뢰가 아니다** ──────────────────────────────────────
//   ★★§0 실측이 카드의 전제 하나를 뒤집었다: econ 은 **식량 소비를 flow-EMA 에 담지 않는다**
//     (economy-sim.js "식단은 가용성 기반 대체 소비"). 그래서 `_consEMA` 에 식량 키가 **아예 없고**,
//     부족 래치(`d.short`)가 식량에 대해 서지 않으며, ⇒ **게시판은 식량 의뢰를 한 건도 안 낸다**
//     (랩 실측 0/6). 그런데 곳간 납품(`village_deliver`)은 **열린 의뢰**를 통과해야만 성립한다.
//     ⇒ 겨울 목표를 곡식으로 잡으면 **낼 길이 아예 없다.** 이 갈래가 없으면 이 배치는 화면에서 성립하지 않는다.
//   ⇒ 공표된 품목은 **의뢰가 없어도 받는다.** 대신 **보상이 없고**(그 대가는 겨울 보상이다)
//     **기여 횟수도 안 오른다**(의뢰 완료가 아니다 — 양과 횟수는 다른 축, W-7).
//   반환: `{ res, give }`(플레이어 아이템 → 개수) · 받을 수 없으면 `null`.
function goalRes(vid) {
  if (off() || !ready()) return null;
  const e = _entry(vid, yearOf(_day()), false);
  return (e && e.target > 0 && e.res) ? e.res : null;
}
function deliverable(vid, item, ledger, inventory) {
  const res = goalRes(vid);
  if (!res) return null;
  if (item && String(item) !== res) return null;                 // 공표한 품목만
  try { if ((ledger.board(vid | 0) || []).some((r) => r.item === res)) return null; }   // 의뢰가 있으면 그 길이 먼저다
  catch (e) { return null; }
  const items = (ledger.deliverable.items.get(res) || []);
  const give = {};
  let any = 0;
  for (const it of items) { const q = Math.floor(Number((inventory || {})[it]) || 0); if (q > 0) { give[it] = q; any += q; } }
  return any > 0 ? { res, give } : null;
}

// ── ② 적립 — 납품 정본 훅 뒤에서. **양만** 센다 ──────────────────────────────
//   ⚠부분 납품도 센다(횟수 `contrib` 는 완료 에지에만 오른다 — 두 축이 다르다는 것이 곧 그 증거다).
//   ⚠적립은 **공표된 품목**만이다. 곳간에 딴것을 넣는 것도 좋은 일이지만 그건 이 프로젝트가 아니다.
function onDeliver(player, r, vid) {
  if (off() || !ready() || !player || !r || !r.ok) return 0;
  const year = yearOf(_day());
  const e = _entry(vid, year, false);
  if (!e || !(e.target > 0) || !e.res) return 0;
  const q = +((r.moved || {})[e.res]) || 0;
  if (!(q > 0)) return 0;
  const pid = String(player.playerId || '');
  if (!pid) return 0;
  const was = e.by.get(pid) || 0;
  const now = +(was + q).toFixed(3);
  e.by.set(pid, now);
  e.got = +(e.got + q).toFixed(3);
  if (player.name) _names.set(pid, String(player.name));
  _persist(vid, year, pid, now, null);
  return q;
}

// ── ③ 판정 — 겨울 첫날. 세 갈래(§0-ⓔ · 재민 PM 판정) ────────────────────────
//   ① 달성            → `WINTER_KEPT`
//   ② 미달이되 참여>0  → `WINTER_SHORT`("올해는 궁했다" — 굶주림이 아니다)
//   ③ **참여 0**       → **사건 없음**. 아무도 안 나선 프로젝트는 연표에 없다.
//     ⇒ 플레이어가 0 인 랩에서 사건이 구조적으로 0 이고, 그래서 기준선이 저절로 불변이다.
//   ⚠어느 갈래든 econ 은 한 글자도 안 바뀐다(W-4ⓐ — 미달이 NPC 를 굶기지 않는다).
function judge(vils, day) {
  const out = [];
  const year = yearOf(day);
  for (const vil of (vils || [])) {
    if (!vil || vil.dbId == null) continue;
    const e = _entry(vil.dbId, year, false);
    if (!e || !(e.target > 0) || !e.res) continue;
    if (!(e.got > 0)) continue;                                   // ③ 참여 0 — 사건 없음
    const rate = e.got / e.target;
    const names = [...e.by.entries()].sort((a, b) => b[1] - a[1]).slice(0, CFG.NAMES)
      .map(([pid, q]) => ({ name: _names.get(pid) || null, qty: +q.toFixed(1) }));
    out.push({
      vid: vil.dbId | 0,
      type: rate >= 1 ? 'WINTER_KEPT' : 'WINTER_SHORT',
      item: e.res,
      mag: +rate.toFixed(4),
      meta: { got: +e.got.toFixed(1), target: e.target, n: e.by.size, names },
    });
  }
  return out;
}

// ── 하루 경계 훅 — `villages.js` 가 한 줄로 부른다 ───────────────────────────
//   반환은 `ledger.scanDay(world, day, extra)` 의 `extra.winter` 다:
//     `goal` = SEASON_CHANGE 에 실을 meta · `emit` = 호스트가 낸 사건(완공 `builds` 와 같은 자리)
function dailyExtra(day, vils) {
  if (off() || !ready()) return null;
  const d = day | 0;
  if (isAnnounceDay(d)) return { goal: announce(vils, d) };
  if (isJudgeDay(d)) return { emit: judge(vils, d) };
  return null;
}

// ── ⑤ 게시판 머리줄 — 서버가 만든 문장 하나(클라는 그리기만) ─────────────────
//   공표(가을 첫날)~판정(겨울 첫날) 사이에만 뜬다. 그 밖의 계절엔 `null`.
const _KO_DAYS = { 1: '하루', 2: '이틀', 3: '사흘', 4: '나흘', 5: '닷새', 6: '엿새', 7: '이레', 8: '여드레', 9: '아흐레', 10: '열흘' };
function headLine(vid, day) {
  if (off() || !ready()) return null;
  const d = (day == null) ? _day() : (day | 0);
  const c = calOf(d);
  if (c.season !== 'autumn') return null;                        // 마감이 지나면 머리줄도 내린다
  const e = _entry(vid, yearOf(d), false);
  if (!e || !(e.target > 0) || !e.res) return null;
  const left = Math.max(0, (deadlineFrom(d - (c.dayOfSeason - 1))) - d);
  const rate = Math.min(1, e.got / e.target);
  const fill = Math.round(rate * CFG.BAR);
  const bar = '▓'.repeat(fill) + '░'.repeat(Math.max(0, CFG.BAR - fill));
  const dur = _KO_DAYS[CFG.D] || `${CFG.D}일`;
  return `🧊 올겨울 — ${Events.koRes(e.res)} ${Math.round(e.got)} / ${e.target}`
    + ` (마을 ${dur}치 · 남은 ${left}일) ${bar} ${Math.round(rate * 100)}%`;
}

// ── ④ 달성 보상 — 그 해 한정 인출 한도 가산 ──────────────────────────────────
//   ★**저장하지 않는다.** 달성은 사건이고 연표가 갖고 있다(제5 규약) —
//     "지난 겨울 첫날 이후에 이 마을이 `WINTER_KEPT` 를 냈는가" 한 줄이 곧 답이다.
//   ⚠다음 겨울 첫날이 오면 `lastWinterStart` 가 앞으로 밀려 **저절로 만료된다**(만료 타이머 0).
function bonusOf(vid) {
  if (off() || !ready() || vid == null) return 0;
  const L = _ledger();
  if (!L || !L.chronOf) return 0;
  const w = lastWinterStart(_day());
  try {
    const arr = L.chronOf(vid | 0);
    for (let i = arr.length - 1; i >= 0; i--) {
      const ev = arr[i];
      if (ev.day < w) break;                                     // chron 은 day 오름차순
      if (ev.type === 'WINTER_KEPT') return CFG.BONUS;
    }
  } catch (e) {}
  return 0;
}

// ── 관측 훅(하네스·계측기 전용 · 읽기만) ─────────────────────────────────────
function probe(vid, year) {
  const e = _entry(vid, year == null ? yearOf(_day()) : (year | 0), false);
  if (!e) return null;
  return { res: e.res, target: e.target, got: +e.got.toFixed(3), n: e.by.size,
    by: [...e.by.entries()].map(([pid, q]) => ({ pid, qty: +q.toFixed(3) })) };
}

module.exports = {
  CFG, init, ready, dailyExtra, onDeliver, headLine, bonusOf, probe, goalRes, deliverable,
  // 유도자 — 하네스가 **같은 함수**로 재도록 내준다(사본 금지)
  targetOf, pickRes, isAnnounceDay, isJudgeDay, deadlineFrom, lastWinterStart, yearOf,
  __reset: () => { _rows = null; _names.clear(); },
};
