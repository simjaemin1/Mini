// 서버 판 계측(세계 0 · 읽기만) — T1391: 불행한 사람이 이주하나 · 남나 · 도적이 되나 · 도적 세계의 되먹임 고리(도적 → 약탈 → 교역 줄음 → 굶음 · 불행 → 도적)
//   싣는 법: 아이 존 프리로드(`NODE_OPTIONS=--require <이 파일>`) · `T577_OUT` 이 있을 때만 깬다(판 자 `t577-server-run` 이 아이에 준다) · 레포 뿌리 = `T1391_ROOT`.
//   날마다(econ 하루 끝 — 장부 `scanDay` 뒤 · T1345 훅과 같은 자리):
//     세계-날 줄 `w`(아래 `WCOLS`) · 마을-달 줄 `vm`(달 = 30날 · 아래 `VCOLS` — 날 셈을 더하고 끝 값을 적는다) ·
//     단 줄 `gangs`(처음 · 마지막 본 날 · 집 · 까닭 · 은거지 · 은거지에서 가장 가까운 마을 · 가장 컸던 n · 약탈 수) · 토벌 출정 `sorties`(단마다 새 `_sup` 이 선 날) ·
//     도적이 된 사람 줄 `conv`(bandits `t1391().log` — 마을 · 갈래 · 단 · 나이) · 약탈을 당한 마을(econ `onBanditLoot` 을 같은 인자로 그대로 부르는 겉싸개 — 값 · 차례 무변).
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산)만 부른다. 30날마다 · 끝에 `<T577_OUT>.t1391.json`.
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1391_ROOT || process.cwd(), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const VS = () => { const m = require.cache[path.join(ROOT, 'server', 'villages.js')]; return m && m.exports; };
  const BS = () => { const m = require.cache[path.join(ROOT, 'server', 'bandits.js')]; return m && m.exports; };
  const sv = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t569Probe ? (V.__labProbe._t569Probe.setup().villages || []) : []; };
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  const FOODY = { food: 1, fish: 1, meat: 1, cooked_food: 1, vegetable: 1 };
  const VCOLS = ['m', 'v', 'days', 'Nend', 'Nmin', 'hSum', 'u25', 'u32', 'emig', 'dead', 'fd', 'sent', 'cargo', 'foodImp', 'killed', 'raided', 'lost',
    'lootN', 'lootAmt', 'lootFood', 'hBSum', 'feSum', 'warEnd', 'riskMax', 'palEnd', 'conv', 'convJoin', 'convFound', 'car', 'esc', 'uG', 'uE', 'uB', 'uS', 'uStv', 'emTry', 'emMove', 'emBandit', 'emStay'];
  const WCOLS = ['day', 'pop', 'alive', 'dead', 'fd', 'emig', 'u25', 'u32', 'hMean', 'gangs', 'members', 'waitN', 'waitMem', 'roadN', 'sent', 'cargo', 'foodImp', 'killed', 'raided', 'lost',
    'lootN', 'lootAmt', 'lootFood', 'esc', 'newCar', 'sup', 'supDead', 'starve', 'disband', 'exo', 'convB', 'denForm', 'conv', 'leave', 'arrive', 'none', 'emTry', 'emMove', 'emBandit', 'emStay'];
  const names = [], nameIdx = new Map();
  const vi = (name) => { let i = nameIdx.get(name); if (i === undefined) { i = names.length; names.push(name); nameIdx.set(name, i); } return i; };
  const vm = new Map(), w = [], gangs = new Map(), sorties = [], conv = [];
  const prev = new Map(); let prevB = null, prevNone = null, convAt = 0, lastDay = -1;
  const supSeen = new WeakSet(), carSeen = new Set();
  const lootToday = new Map(); let lootDay = { n: 0, amt: 0, food: 0 };
  const wrapLoot = (W) => {
    if (!W || typeof W.onBanditLoot !== 'function' || W.onBanditLoot.__t1391) return;
    const orig = W.onBanditLoot;
    const f = function (victim, other, res, amt) {
      try { if (amt > 0) { const o = lootToday.get(victim) || { n: 0, amt: 0, food: 0 }; o.n++; o.amt += amt; if (FOODY[res]) o.food += amt; lootToday.set(victim, o); lootDay.n++; lootDay.amt += amt; if (FOODY[res]) lootDay.food += amt; } } catch (e) {}
      return orig.apply(this, arguments);
    };
    f.__t1391 = true; W.onBanditLoot = f;
  };
  //   불행 이탈 문(`world.t1075Emigrate` = 도적 층 `_t1075Leave`)을 같은 인자로 그대로 부르는 겉싸개 — 부른 수 · 참 · 갈래(이주 · 도적 · 남음) · 나이 칸(값 · 차례 무변)
  const emToday = new Map(); let emDay = { n: 0, move: 0, bandit: 0, stay: 0 };
  const ageB = (a) => (a == null || !isFinite(a)) ? 'na' : a < 10 ? '0-9' : a < 16 ? '10-15' : a < 20 ? '16-19' : a < 40 ? '20-39' : '40+';
  const ages = { move: {}, bandit: {}, stay: {} };
  const wrapEmig = (W) => {
    if (!W || typeof W.t1075Emigrate !== 'function' || W.t1075Emigrate.__t1391) return;
    const og = W.t1075Emigrate;
    const f = function (v, p) {
      let n0 = 0; try { const B = BS(); n0 = B && typeof B.t1391 === 'function' ? (B.t1391().logN || 0) : 0; } catch (_) {}
      const r = og.apply(this, arguments);
      try {
        let n1 = n0; try { const B = BS(); n1 = B && typeof B.t1391 === 'function' ? (B.t1391().logN || 0) : 0; } catch (_) {}
        const k = r ? (n1 > n0 ? 'bandit' : 'move') : 'stay';
        const o = emToday.get(v) || { n: 0, move: 0, bandit: 0, stay: 0 }; o.n++; o[k]++; emToday.set(v, o); emDay.n++; emDay[k]++;
        const b = ageB(p && p.age); ages[k][b] = (ages[k][b] || 0) + 1;
      } catch (_) {}
      return r;
    };
    f.__t1391 = true; W.t1075Emigrate = f;
  };
  const bst = () => { try { const B = BS(); return B && typeof B.stats === 'function' ? B.stats() : null; } catch (e) { return null; } };
  const tst = () => { try { const B = BS(); return B && typeof B.t1391 === 'function' ? B.t1391() : null; } catch (e) { return null; } };
  const none = () => { try { const V = VS(); const s = V && typeof V.t1147Stat === 'function' ? V.t1147Stat() : null; return s ? s.none | 0 : 0; } catch (e) { return 0; } };
  const dayRows = (day, world) => {
    const m = Math.floor(Math.max(0, day - 1) / 30), vils = sv();
    let pop = 0, alive = 0, dD = 0, dF = 0, dE = 0, u25 = 0, u32 = 0, hS = 0, hN = 0, sent = 0, cargo = 0, fImp = 0, kil = 0, rai = 0, lost = 0;
    const T = tst(), convToday = new Map(), carToday = new Map();
    let esc = 0, newCar = 0;
    for (const c of (world && world.caravans) || []) { if (c && c.id != null && !carSeen.has(c.id)) { carSeen.add(c.id); newCar++; esc += +c.escort || 0; if (c.from) { const q = carToday.get(c.from) || { n: 0, esc: 0 }; q.n++; q.esc += +c.escort || 0; carToday.set(c.from, q); } } }   // 그날 새 캐러밴(떠난 마을 · 호위)
    if (T && T.log) { const _n = T.logN != null ? T.logN : T.log.length, _k0 = Math.max(0, T.log.length - Math.max(0, _n - convAt)); for (let k = _k0; k < T.log.length; k++) { const r = T.log[k]; if (r.k === 'join' || r.k === 'joinWait' || r.k === 'found') { conv.push(r); const c = convToday.get(r.v) || { n: 0, join: 0, found: 0 }; c.n++; if (r.k === 'found') c.found++; else c.join++; convToday.set(r.v, c); } else conv.push(r); } convAt = _n; }
    for (const vil of vils) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      const N = (e.npcs || []).length, i = vi(vil.name), ts = e.tradeStats || {};
      const p = prev.get(vil.name) || { dead: e._deadTot || 0, fd: e._fdDeadTot || 0, emig: e._emigTot || 0, sent: ts.caravansSent || 0, cargo: ts.cargoSent || 0, fImp: ts.foodImported || 0, kil: ts.tradersKilled || 0, rai: ts.caravansRaided || 0, lost: ts.cargoLost || 0 };
      const cur = { dead: e._deadTot || 0, fd: e._fdDeadTot || 0, emig: e._emigTot || 0, sent: ts.caravansSent || 0, cargo: ts.cargoSent || 0, fImp: ts.foodImported || 0, kil: ts.tradersKilled || 0, rai: ts.caravansRaided || 0, lost: ts.cargoLost || 0 };
      const d = (k) => cur[k] - p[k];
      prev.set(vil.name, cur);
      const ls = e.lastStats || null, h = ls && typeof ls.happiness === 'number' ? ls.happiness : null, hB = ls && typeof ls.happinessBurden === 'number' ? ls.happinessBurden : null;
      let fe = null; try { fe = N ? E.totalFoodEquivalent(e) / N : null; } catch (_) {}
      const key = m + ':' + i;
      let o = vm.get(key); if (!o) { o = { m, v: i, days: 0, Nend: 0, Nmin: Infinity, hSum: 0, u25: 0, u32: 0, emig: 0, dead: 0, fd: 0, sent: 0, cargo: 0, foodImp: 0, killed: 0, raided: 0, lost: 0, lootN: 0, lootAmt: 0, lootFood: 0, hBSum: 0, feSum: 0, warEnd: 0, riskMax: 0, palEnd: null, conv: 0, convJoin: 0, convFound: 0, car: 0, esc: 0, uG: 0, uE: 0, uB: 0, uS: 0, uStv: 0, emTry: 0, emMove: 0, emBandit: 0, emStay: 0 }; vm.set(key, o); }
      o.days++; o.Nend = N; o.Nmin = Math.min(o.Nmin, N);
      if (h != null) { o.hSum += h; if (N > 0 && h < 0.25) { o.u25++; u25++; } if (N > 0 && h < 0.32) { o.u32++; u32++; } if (N > 0) { hS += h; hN++; } }
      if (h != null && N > 0 && h < 0.25) { o.uG += +ls.happinessGoods || 0; o.uE += +e._t1134E || 0; o.uB += +ls.happinessBurden || 0; o.uS += +ls.happinessSlow || 0; try { const f = E.foodDebtOf(e); o.uStv += f.n ? f.starving / f.n : 0; } catch (_) {} }   // 불행한 날의 까닭(좋은 것 G · 겪은 일 E · 인구 부담 B · 느린 S · 굶는 몫)
      if (hB != null) o.hBSum += hB; if (fe != null) o.feSum += fe;
      o.emig += d('emig'); o.dead += d('dead'); o.fd += d('fd'); o.sent += d('sent'); o.cargo += d('cargo'); o.foodImp += d('fImp'); o.killed += d('kil'); o.raided += d('rai'); o.lost += d('lost');
      const lt = lootToday.get(e); if (lt) { o.lootN += lt.n; o.lootAmt += lt.amt; o.lootFood += lt.food; }
      o.warEnd = (e.counts && e.counts.warrior) || 0; o.riskMax = Math.max(o.riskMax, e._banditRisk || 0); o.palEnd = e._palisade != null ? r3(+e._palisade || 0) : null;
      const cv = convToday.get(vil.name); if (cv) { o.conv += cv.n; o.convJoin += cv.join; o.convFound += cv.found; }
      const cq = carToday.get(e); if (cq) { o.car += cq.n; o.esc += cq.esc; }
      const eq = emToday.get(e); if (eq) { o.emTry += eq.n; o.emMove += eq.move; o.emBandit += eq.bandit; o.emStay += eq.stay; }
      pop += N; if (N > 0) alive++; dD += d('dead'); dF += d('fd'); dE += d('emig'); sent += d('sent'); cargo += d('cargo'); fImp += d('fImp'); kil += d('kil'); rai += d('rai'); lost += d('lost');
    }
    lootToday.clear();
    const B = BS(), st = bst() || {}, q = prevB || st, dq = (k) => (st[k] || 0) - (q[k] || 0);
    let gN = 0, mem = 0;
    if (B && typeof B.gangs === 'function') {
      const G = B.gangs(); gN = G.length;
      for (const g of G) {
        mem += g.n | 0;
        let r = gangs.get(g.id);
        if (!r) {
          let near = null, nd = Infinity; for (const v of vils) { if (!v.econ || !(v.econ.npcs || []).length) continue; const dd = Math.hypot(v.ccx - g.camp.cx, v.ccy - g.camp.cy); if (dd < nd) { nd = dd; near = v.name; } }
          r = { id: g.id, home: g.home, why: g.why, born: g.born, first: day, last: day, nMax: g.n | 0, camp: [g.camp.cx, g.camp.cy], near, nearD: isFinite(nd) ? Math.round(nd) : null, lootN: 0, den: g.den != null ? g.den : null, endN: null };
          gangs.set(g.id, r);
        }
        r.last = day; r.nMax = Math.max(r.nMax, g.n | 0); r.lootN = g.lootN | 0; r.endN = g.n | 0;
        if (g._sup && !supSeen.has(g._sup)) { supSeen.add(g._sup); const fv = vils.find((v) => v.dbId === g._sup.vilDbId); sorties.push({ day, gid: g.id, vil: fv ? fv.name : null, force: g._sup.force != null ? g._sup.force : null }); }
      }
    }
    const wait = T && T.wait ? T.wait : [], road = (B && typeof B.t1039 === 'function') ? (B.t1039().road || []).length : 0;
    const nn = none();
    w.push([day, pop, alive, dD, dF, dE, u25, u32, hN ? r3(hS / hN) : null, gN, mem, wait.length, wait.reduce((a, x) => a + (x.n | 0), 0), road, sent, r3(cargo), r3(fImp), kil, rai, r3(lost),
      lootDay.n, r3(lootDay.amt), r3(lootDay.food), esc, newCar, dq('sup'), dq('supDead'), dq('starve'), dq('disband'), dq('exo'), dq('conv'), dq('denForm'),
      [...convToday.values()].reduce((a, c) => a + c.n, 0), dq('t1075Leave'), dq('t765Arrive'), prevNone == null ? 0 : nn - prevNone, emDay.n, emDay.move, emDay.bandit, emDay.stay]);
    emToday.clear(); emDay = { n: 0, move: 0, bandit: 0, stay: 0 };
    prevNone = nn;
    lootDay = { n: 0, amt: 0, food: 0 };
    prevB = Object.assign({}, st);
    wrapLoot(world); wrapEmig(world);
  };
  const dump = () => {
    try {
      const vmRows = [...vm.values()].map((o) => VCOLS.map((k) => (k === 'hSum' || k === 'hBSum' || k === 'feSum' || k === 'uG' || k === 'uE' || k === 'uB' || k === 'uS' || k === 'uStv' || k === 'cargo' || k === 'foodImp' || k === 'lost' || k === 'lootAmt' || k === 'lootFood') ? r3(o[k]) : (k === 'Nmin' && !isFinite(o[k]) ? null : o[k])));
      fs.writeFileSync(OUT + '.t1391.json', JSON.stringify({ env: { UB: process.env.T1391_UNHAPPY_BANDIT || null, RICH: process.env.T1391_DEN_RICH || null, CAP: process.env.VILLAGE_NPC_CAP || null,
        DAY_MS: process.env.VILLAGE_DAY_MS || null, BUILD: process.env.T400_BUILD_ACT || null, CARAVAN: process.env.VILLAGE_CARAVAN_MAX || null, BODY: process.env.T577_BODY || null, SEED: process.env.T577_SEED || null },
        names, vcols: VCOLS, vm: vmRows, wcols: WCOLS, w, gangs: [...gangs.values()], sorties, conv, ages, t1391: (tst() || {}).st || null, bandit: Object.assign({}, bst() || {}, { log: undefined }) }));
    } catch (e) {}
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { if ((day | 0) !== lastDay) { lastDay = day | 0; dayRows(lastDay, world); if (lastDay % 30 === 0) dump(); } } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', dump);
}
