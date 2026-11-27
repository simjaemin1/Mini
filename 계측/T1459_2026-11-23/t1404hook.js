// 서버 판 계측(세계 0 · 읽기만) — T1404: 도적은 길목에서 사나 · 굶나 · 터나(소굴 → 길목 걸음 · 약탈 0 까닭 · 단 살림)
//   싣는 법: 아이 존 프리로드(`NODE_OPTIONS=--require <이 파일>`) · `T577_OUT` 이 있을 때만 깬다(판 자 `t577-server-run` 이 아이에 준다) · 레포 뿌리 = `T1404_ROOT`.
//   날마다(econ 하루 끝 — 장부 `scanDay` 뒤 · T1391 관찰기와 같은 자리):
//     세계-날 줄 `w`(아래 `WCOLS`) · 마을-달 줄 `vm`(달 = 30날) · 단 줄 `gangs`(처음 · 마지막 본 날 · 집 · 까닭 · 은거지 · 가장 컸던 n · 약탈 · 굶음 · 끝 n) ·
//     쓰인 교역 쌍(그날 길 위 캐러밴의 마을 쌍 → 날) · 끝에 은거지 · 소굴 → 지난 한 해 쓰인 교역로까지 걸음 거리(호스트 `t1079Len` — 코스 A*).
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다(끝 걸음 거리만 길 캐시를 읽는다 — 판이 끝난 뒤). 30날마다 · 끝에 `<T577_OUT>.t1404.json`.
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1404_ROOT || process.cwd(), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const VS = () => { const m = require.cache[path.join(ROOT, 'server', 'villages.js')]; return m && m.exports; };
  const BS = () => { const m = require.cache[path.join(ROOT, 'server', 'bandits.js')]; return m && m.exports; };
  const sv = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t569Probe ? (V.__labProbe._t569Probe.setup().villages || []) : []; };
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  const FOODY = { food: 1, fish: 1, meat: 1, cooked_food: 1, vegetable: 1 };
  const WCOLS = ['day', 'pop', 'alive', 'dead', 'fd', 'gangs', 'members', 'gFood', 'gBodies', 'starve', 'disband', 'denForm', 'exo', 'sup', 'supDead',
    'lootN', 'lootAmt', 'lootFood', 'sent', 'raided', 'killed', 'lost', 'foodImp', 'newCar', 'esc', 'war', 'pal', 'risk',
    'fg', 'fgFood', 'split', 'home', 'move', 'meet', 'out', 'miss', 'far', 'heapMB'];   // heapMB = 그날 끝 V8 힙(`process.memoryUsage().heapUsed` · 읽기만 — T1404 판 42 힙 한도 회부)
  const VCOLS = ['m', 'v', 'days', 'Nend', 'Nmin', 'dead', 'fd', 'sent', 'raided', 'killed', 'lost', 'foodImp', 'lootN', 'lootFood', 'car', 'esc', 'warEnd', 'palEnd', 'riskMax', 'feSum'];
  const names = [], nameIdx = new Map();
  const vi = (name) => { let i = nameIdx.get(name); if (i === undefined) { i = names.length; names.push(name); nameIdx.set(name, i); } return i; };
  const vm = new Map(), w = [], gangs = new Map(), pairDays = new Map();
  const prev = new Map(); let prevB = null, prevT = null, lastDay = -1;
  const carSeen = new Set();
  const lootToday = new Map(); let lootDay = { n: 0, amt: 0, food: 0 };
  const wrapLoot = (W) => {
    if (!W || typeof W.onBanditLoot !== 'function' || W.onBanditLoot.__t1404) return;
    const orig = W.onBanditLoot;
    const f = function (victim, other, res, amt) {
      try { if (amt > 0) { const o = lootToday.get(victim) || { n: 0, amt: 0, food: 0 }; o.n++; o.amt += amt; if (FOODY[res]) o.food += amt; lootToday.set(victim, o); lootDay.n++; lootDay.amt += amt; if (FOODY[res]) lootDay.food += amt; } } catch (e) {}
      return orig.apply(this, arguments);
    };
    f.__t1404 = true; W.onBanditLoot = f;
  };
  const bst = () => { try { const B = BS(); return B && typeof B.stats === 'function' ? B.stats() : null; } catch (e) { return null; } };
  const t4 = () => { try { const B = BS(); return B && typeof B.t1404 === 'function' ? B.t1404() : null; } catch (e) { return null; } };
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const dayRows = (day, world) => {
    const m = Math.floor(Math.max(0, day - 1) / 30), vils = sv();
    let pop = 0, alive = 0, dD = 0, dF = 0, sent = 0, rai = 0, kil = 0, lost = 0, fImp = 0, war = 0, pal = 0, risk = 0;
    let esc = 0, newCar = 0;
    const carToday = new Map();
    for (const c of (world && world.caravans) || []) {
      if (!c || c.id == null) continue;
      if (!carSeen.has(c.id)) { carSeen.add(c.id); newCar++; esc += +c.escort || 0; if (c.from) { const q = carToday.get(c.from) || { n: 0, esc: 0 }; q.n++; q.esc += +c.escort || 0; carToday.set(c.from, q); } }
      if (!c._done && c.from && c.to && (c.state === 'outbound' || c.state === 'inbound')) pairDays.set(pairKey(c.from.name, c.to.name), day);   // 그날 길 위 — 그 쌍의 길은 쓰였다
    }
    for (const vil of vils) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      const N = (e.npcs || []).length, i = vi(vil.name), ts = e.tradeStats || {};
      const cur = { dead: e._deadTot || 0, fd: e._fdDeadTot || 0, sent: ts.caravansSent || 0, fImp: ts.foodImported || 0, kil: ts.tradersKilled || 0, rai: ts.caravansRaided || 0, lost: ts.cargoLost || 0 };
      const p = prev.get(vil.name) || cur;
      const d = (k) => cur[k] - p[k];
      prev.set(vil.name, cur);
      let fe = null; try { fe = N ? E.totalFoodEquivalent(e) / N : null; } catch (_) {}
      const key = m + ':' + i;
      let o = vm.get(key); if (!o) { o = { m, v: i, days: 0, Nend: 0, Nmin: Infinity, dead: 0, fd: 0, sent: 0, raided: 0, killed: 0, lost: 0, foodImp: 0, lootN: 0, lootFood: 0, car: 0, esc: 0, warEnd: 0, palEnd: null, riskMax: 0, feSum: 0 }; vm.set(key, o); }
      o.days++; o.Nend = N; o.Nmin = Math.min(o.Nmin, N);
      o.dead += d('dead'); o.fd += d('fd'); o.sent += d('sent'); o.raided += d('rai'); o.killed += d('kil'); o.lost += d('lost'); o.foodImp += d('fImp');
      if (fe != null) o.feSum += fe;
      const lt = lootToday.get(e); if (lt) { o.lootN += lt.n; o.lootFood += lt.food; }
      const cq = carToday.get(e); if (cq) { o.car += cq.n; o.esc += cq.esc; }
      o.warEnd = (e.counts && e.counts.warrior) || 0; o.palEnd = e._palisade != null ? r3(+e._palisade || 0) : null; o.riskMax = Math.max(o.riskMax, e._banditRisk || 0);
      pop += N; if (N > 0) alive++; dD += d('dead'); dF += d('fd'); sent += d('sent'); rai += d('rai'); kil += d('kil'); lost += d('lost'); fImp += d('fImp');
      war += (e.counts && e.counts.warrior) || 0; pal += +e._palisade || 0; risk += e._banditRisk || 0;
    }
    lootToday.clear();
    const B = BS(), st = bst() || {}, q = prevB || st, dq = (k) => (st[k] || 0) - (q[k] || 0);
    const t1104 = (st.t1104) || {}, q4 = (prevB && prevB.t1104) || t1104, dq4 = (k) => (t1104[k] || 0) - (q4[k] || 0);
    const T = t4(), ts = (T && T.st) || {}, qt = prevT || ts, dqt = (k) => (ts[k] || 0) - (qt[k] || 0);
    let gN = 0, mem = 0, gFood = 0, gBod = 0;
    if (B && typeof B.gangs === 'function') {
      const G = B.gangs(); gN = G.length;
      let bodyOf = null; try { const t8 = B.t1078 ? B.t1078() : null; if (t8 && t8.gangs) { bodyOf = new Map(); for (const x of t8.gangs) bodyOf.set(x.id, x.bodies); } } catch (_) {}
      for (const g of G) {
        mem += g.n | 0; gFood += +g.food || 0; const nb = bodyOf ? (bodyOf.get(g.id) | 0) : 0; gBod += nb;
        let r = gangs.get(g.id);
        if (!r) {
          let near = null, nd = Infinity; for (const v of vils) { if (!v.econ || !(v.econ.npcs || []).length) continue; const dd = Math.hypot(v.ccx - g.camp.cx, v.ccy - g.camp.cy); if (dd < nd) { nd = dd; near = v.name; } }
          r = { id: g.id, home: g.home, why: g.why, born: g.born, first: day, last: day, nMax: g.n | 0, n0: g.n | 0, camp: [g.camp.cx, g.camp.cy], near, nearD: isFinite(nd) ? Math.round(nd) : null, den: g.den != null ? g.den : null, lootN: 0, endN: null, foodMin: +g.food || 0, bodiesMax: nb, camps: 1 };
          gangs.set(g.id, r);
        }
        if (r.camp[0] !== g.camp.cx || r.camp[1] !== g.camp.cy) { r.camps++; r.camp = [g.camp.cx, g.camp.cy]; }
        r.last = day; r.nMax = Math.max(r.nMax, g.n | 0); r.lootN = g.lootN | 0; r.endN = g.n | 0; r.foodMin = Math.min(r.foodMin, +g.food || 0); r.bodiesMax = Math.max(r.bodiesMax, nb);
      }
    }
    w.push([day, pop, alive, dD, dF, gN, mem, r3(gFood), gBod, dq('starve'), dq('disband'), dq('denForm'), dq('exo'), dq('sup'), dq('supDead'),
      lootDay.n, r3(lootDay.amt), r3(lootDay.food), sent, rai, kil, r3(lost), r3(fImp), newCar, esc, war, r3(pal), r3(risk),
      dqt('fgDays'), r3(dqt('fgFood')), dqt('split'), dqt('home'), dqt('move'), dq4('met'), dq4('out'), dq4('miss'), dq4('far'), Math.round(process.memoryUsage().heapUsed / 1048576)]);
    lootDay = { n: 0, amt: 0, food: 0 };
    prevB = JSON.parse(JSON.stringify(st, (k, v) => (k === 'log' ? undefined : v)));
    prevT = Object.assign({}, ts);
    wrapLoot(world);
  };
  //   끝 — 소굴 · 은거지 → 지난 한 해(끝 날 − 365 뒤) 길 위 캐러밴이 있었던 쌍의 교역로까지 걸음 거리(코스 A* `t1079Len` · 곧은 거리 가장 가까운 정점 다섯 중 가장 짧은 길)
  const walkDist = (endDay) => {
    try {
      const V = VS(), H = V && V.banditHost ? V.banditHost() : null; if (!H || !H.getRoute) return null;
      const byName = new Map(); for (const v of H.villages) byName.set(v.name, v);
      const pts = [];
      for (const [k, d] of pairDays) {
        if (d < endDay - 365) continue;
        const [a, b] = k.split('|'); const A = byName.get(a), Bv = byName.get(b); if (!A || !Bv) continue;
        let p = null; try { p = H.getRoute(A, Bv); } catch (_) { p = null; }
        if (p) for (let i = 0; i < p.length; i += 2) pts.push([p[i].x / 32, p[i].y / 32]);
      }
      if (!pts.length) return { used: 0, rows: [] };
      const B = BS(), rows = [];
      const spots = [];
      try { const dens = B._t1078Probe && B._t1078Probe.dens ? B._t1078Probe.dens() : []; for (const d of dens) spots.push({ kind: 'den', id: d.id, cx: d.cx, cy: d.cy }); } catch (_) {}
      for (const r of gangs.values()) spots.push({ kind: 'gang', id: r.id, cx: r.camp[0], cy: r.camp[1], den: r.den });
      for (const s of spots) {
        const near = pts.map((q) => [Math.hypot(q[0] - s.cx, q[1] - s.cy), q]).sort((x, y) => x[0] - y[0]).slice(0, 5);
        let best = null;
        for (const [sd, q] of near) {
          let L = null; try { L = H.t1079Len ? H.t1079Len({ cx: s.cx, cy: s.cy }, { ccx: Math.floor(q[0]), ccy: Math.floor(q[1]) }) : null; } catch (_) { L = null; }
          const cells = L && L.len != null ? L.len / 32 : null;
          if (cells != null && (best == null || cells < best.walk)) best = { walk: Math.round(cells), straight: Math.round(sd) };
        }
        rows.push(Object.assign({}, s, { walk: best ? best.walk : null, straight: near.length ? Math.round(near[0][0]) : null }));
      }
      return { used: pairDays.size, usedLastYear: [...pairDays.values()].filter((d) => d >= endDay - 365).length, pts: pts.length, rows };
    } catch (e) { return { err: String(e && e.message) }; }
  };
  const dump = (final) => {
    try {
      const vmRows = [...vm.values()].map((o) => VCOLS.map((k) => (k === 'lost' || k === 'foodImp' || k === 'lootFood' || k === 'feSum') ? r3(o[k]) : (k === 'Nmin' && !isFinite(o[k]) ? null : o[k])));
      const st = bst() || {};
      fs.writeFileSync(OUT + '.t1404.json', JSON.stringify({ env: { KNOBS: Object.keys(process.env).filter((k) => /^T1404_|^T1391_|^T1431_|^T1462_|^T1459_/.test(k)).reduce((a, k) => (a[k] = process.env[k], a), {}), CAP: process.env.VILLAGE_NPC_CAP || null,
        DAY_MS: process.env.VILLAGE_DAY_MS || null, BUILD: process.env.T400_BUILD_ACT || null, CARAVAN: process.env.VILLAGE_CARAVAN_MAX || null, BODY: process.env.T577_BODY || null, SEED: process.env.T577_SEED || null },
        names, vcols: VCOLS, vm: vmRows, wcols: WCOLS, w, gangs: [...gangs.values()], pairs: [...pairDays.entries()],
        walk: final ? walkDist(lastDay) : null, t1404: t4(), warEcon: (() => { try { const W = globalThis.__t1462W; return W && W._warStats ? Object.assign({}, W._warStats) : null; } catch (e) { return null; } })(), t1459: (() => { try { const B = BS(); return B && typeof B.t1459 === 'function' ? B.t1459() : null; } catch (e) { return null; } })(), t1431: (() => { try { const B = BS(); return B && typeof B.t1431 === 'function' ? B.t1431() : null; } catch (e) { return null; } })(), war: (() => { try { const V = VS(); const st = V && V.__p3Bind ? V.__p3Bind({}).state : null; return st ? { stat: Object.assign({}, st._warStat || {}), seq: st.world ? st.world._warSeq : null, active: st.war && st.war.WARS ? st.war.WARS.length : null, ledger: st.world && st.world._warWars ? st.world._warWars.length : null } : null; } catch (e) { return { err: String(e && e.message) }; } })(), bandit: JSON.parse(JSON.stringify(st, (k, v) => (k === 'log' ? undefined : v))) }));
    } catch (e) {}
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { globalThis.__t1462W = world; } catch (e) {}
      try { if ((day | 0) !== lastDay) { lastDay = day | 0; dayRows(lastDay, world); if (lastDay % 30 === 0) dump(false); } } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', () => dump(true));
}
