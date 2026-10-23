'use strict';
// (@regress 없음 — 러너 밖 · T837 갈림 대조 자 · 제품 무변)
// === scripts/diverge-ctl.js — 서버 판 갈래 견주기의 **갈림 대조(ⓩ)** 자 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 · 읽기만 + 사건 하나 건너뜀 ==========
//
// ★왜 [T810 회부 1 · T837] 서버 판은 한 사건만 달라도 그날부터 세계가 갈린다(T810: 첫 습격 조우 하나만 건너뛴 판이 첫해 오는 캐러밴 350 → 527).
//   판 하나 대 판 하나로 견주면 그 갈림 몫을 갈래의 몫으로 읽는다(T796). 그래서 같은 갈래를 **사건 하나만 다르게** k 판 더 돌려
//   셈마다 **대조 띠**(갈래 판 + 대조 k 판의 최소 ~ 최대)를 세우고, 두 갈래의 차가 띠 폭보다 큰지를 본다(판정 0 — 표만).
//
// 쓰는 법(env 는 이 프리로드만 읽는다 · 제품 손잡이는 부르는 쪽 env 그대로 아이에게 간다):
//   NODE_OPTIONS="-r $PWD/scripts/diverge-ctl.js" [DCTL_ARM=g] [DCTL_SKIP=raid:2] node scripts/t577-server-run.js 800 1020,7,42
//   DCTL_SKIP — 대조 판: `raid:n` = n 번째 습격 조우(econ 도착 · 귀환 전투 자리가 부른 `banditGang` 이 단 n > 0 을 낸 n 번째) 하나만 null
//               — 갈래 `g`(전투 끔)에서는 거울로: n 번째 조우 **하나만 치른다**(습격이 없는 갈래도 같은 사건 하나로 갈린다)
//               `sight:n` = n 번째 교역 결정의 갱 목격(`tickTradeV2Steps` 가 부른 `banditGang` 이 단을 낸 n 번째) 하나만 null
//               ⚠`sight:1` 은 ⓖ 1020 150일에서 세계를 안 갈랐다(결정이 그대로 — 보고 T837 §1) · 갈림 대조로 쓰려면 갈림 날을 먼저 확인한다
//               n 은 1 · 2 · 3(k = 3 — 이미 쓰는 3시드 꼴). 없음 = 갈래 판 그대로.
//   DCTL_ARM  — 갈래: 없음 = main · `g` = 갱 전투만 끔(T796 ⓖ · T810 ⓖ 와 같은 갈래 — 도착 · 귀환 전투 자리가 부르면 null · 교역 결정은 원래 값)
//   부른 자리는 호출 스택을 위로 훑어 econ 함수 이름으로 가른다(감싸개가 겹쳐도 같은 답 · 제품 0).
//   ⇒ `<판>-<시드>.dctl.json`:
//     days   — 날마다 마을마다 [인구 · 곳간 식량 환산(`totalFoodEquivalent`)]
//     cars   — 새 캐러밴 [날 · 출발 · 도착]
//     legs   — 먹을 것(식량 환산 > 0 · 식량류 넷 밖) leg [날 · 출발 · 품목 · 단위 · 1단위 식량 값 · 출발 인구 · 싣기 전 곳간 식량 환산] — T825 셈
//     raids  — 날마다 습격 조우 수(전투 자리 · 단 n > 0) · skip — 건너뛴 사건 [날 · 종류 · n · 출발 · 도착]
//     ★[T859] days 칸에 [도구 합 · 무기 · 생산 배율] 을 더하고 · buys — 굶는 날 떠난 캐러밴이 사 온 것
//       [떠난 날 · 출발 · 도착 · 내준 품목 · 양 · 출발 값(pFrom) · 사 온 품목 · 양 · 1단위 식량 값 · 행상 죽음]
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.dctl.json' : '';
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const ARM = process.env.DCTL_ARM || '';
const SK = /^(raid|sight):([0-9]+)$/.exec(process.env.DCTL_SKIP || '');
const SKIP = SK ? { kind: SK[1], n: +SK[2] } : null;
const RAID = new Set(['_caravanArrive', 'tickCaravansV2']), SIGHT = new Set(['tickTradeV2Steps']);
const ECON = new Set(['_caravanArrive', 'tickCaravansV2', 'tickTradeV2Steps', 'netExportValue']);
const FOODR = new Set(['food', 'fish', 'meat', 'cooked_food']);
const rec = { ver: 2, arm: ARM, skip: SKIP, skipped: [], names: null, fw: {}, days: [], cars: [], legs: [], buys: [], raids: {}, hooked: 0, seen: { raid: 0, sight: 0 } };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const _hold = { stack: '' };
function econCaller() {   // 스택을 위로 훑어 처음 만나는 econ 함수 이름
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 12; Error.captureStackTrace(_hold, econCaller); Error.stackTraceLimit = L;
  for (const ln of String(_hold.stack).split('\n').slice(1)) { const m = /at (?:Object\.)?([A-Za-z_$][\w$]*)/.exec(ln); if (m && ECON.has(m[1])) return m[1]; }
  return '?';
}
const FW = new Map();
function fw(v, r) {
  if (FW.has(r)) return FW.get(r);
  let f = 0; try { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; f = +V1.totalFoodEquivalent({ storage: st, npcs: [], _world: v && v._world }) || 0; } catch (e) { f = 0; }
  FW.set(r, f); rec.fw[r] = f; return f;
}
const tfe = (v) => { try { return V1.totalFoodEquivalent(v); } catch (e) { return -1; } };
let today = 0;
function arm(world) {
  if (world.banditGang && !world.banditGang._dctl) {
    const g = world.banditGang;
    const w = function (a, b) {
      const who = econCaller();
      if (ARM === 'g' && RAID.has(who)) {   // ⓖ — 전투 자리는 null · 대조 `raid:n` 이면 n 번째 조우 **하나만** 치른다(ⓐ 의 대조와 거울 — 같은 사건 하나가 다르다)
        const r0 = g(a, b);
        if (!(r0 && r0.n > 0)) return null;
        rec.seen.raid++;
        if (SKIP && SKIP.kind === 'raid' && !rec.skipped.length && rec.seen.raid === SKIP.n) { rec.skipped.push([today, 'raid+', SKIP.n, a && a.name, b && b.name]); rec.raids[today] = (rec.raids[today] || 0) + 1; return r0; }
        return null;
      }
      const r = g(a, b);
      if (r && r.n > 0) {
        if (RAID.has(who)) { rec.seen.raid++; rec.raids[today] = (rec.raids[today] || 0) + 1; }
        if (SIGHT.has(who)) rec.seen.sight++;
        if (SKIP && !rec.skipped.length && ((SKIP.kind === 'raid' && RAID.has(who) && rec.seen.raid === SKIP.n) || (SKIP.kind === 'sight' && SIGHT.has(who) && rec.seen.sight === SKIP.n))) {
          rec.skipped.push([today, SKIP.kind, SKIP.n, a && a.name, b && b.name]); return null;
        }
      }
      return r;
    };
    w._dctl = 1; world.banditGang = w; rec.hooked++;
  }
  if (!world.onTradeLeg || !world.onTradeLeg._dctl) {
    const prev = world.onTradeLeg || null;
    const f = function (o) {
      try {
        const v = world.villages[o.vid];
        if (v && !FOODR.has(o.res)) { const k = fw(v, o.res); if (k > 0) rec.legs.push([o.day | 0, rec.names ? rec.names.indexOf(v.name) : -1, o.res, r2(o.units), k, (v.npcs || []).length, r2(tfe(v) + o.units * k)]); }
      } catch (e) {}
      if (prev) return prev.apply(this, arguments);
    };
    f._dctl = 1; world.onTradeLeg = f;
  }
}
const seenC = new WeakSet();
const TRK = new Map();   // 굶는 날(출발 마을 곳간 식량 환산 < 인구) 떠난 캐러밴 → [날 · 출발 · 도착 · 내준 품목 · 양 · 출발 값]
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      today = (day | 0) + 1;
      arm(world);
      const V = world.villages;
      if (!rec.names) rec.names = V.map((v) => v.name);
      const row = new Array(rec.names.length).fill(null);
      for (const v of V) { const i = rec.names.indexOf(v.name); if (i >= 0) row[i] = [(v.npcs || []).length, r2(tfe(v)), r2((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)), r2(v.storage.weapon), r2(v.lastStats && v.lastStats.production)]; }
      rec.days.push([day | 0, row]);
      for (const c of world.caravans || []) {
        if (!seenC.has(c)) { seenC.add(c); const fi = rec.names.indexOf(c.from && c.from.name), ti = rec.names.indexOf(c.to && c.to.name); if (fi >= 0 && ti >= 0) {
          rec.cars.push([day | 0, fi, ti]);
          const fr = row[fi]; if (fr && fr[1] < fr[0]) TRK.set(c, [day | 0, fi, ti, c.giveRes || null, r2(c.giveAmt), +(+c.pFrom_at_depart || 0).toFixed(4)]); } }
        const t = TRK.get(c);
        if (t && !t.done && (c._done || (c.state === 'inbound' && !c._t707))) {   // 굶는 날 떠난 캐러밴이 사 온 것(도착 매입 — 장마당(T707)이면 정산 뒤 · 없으면 빈손)
          t.done = 1; const rr = c._returningRes || null, ra = +c._returningAmt || 0;
          rec.buys.push([...t, rr, r2(ra), rr ? fw(c.from, rr) : 0, c._done ? 1 : 0]); }
      }
    } catch (e) { console.error('[dctl] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
