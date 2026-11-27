// [T1496 관찰기 덧붙임 — 읽기만 · 세계 0] t1460hook.js 뒤에 싣는다(NODE_OPTIONS --require).
//   ① 단원이 되는 순간 그 몸의 짐(호스트 t1039Depart 를 감싼다 — 고른 몸의 inventory · toolItems · equipment · simJob)
//   ② 마을 몸 전수(날 1 · 60 · 365 · 730 — 도구 · 무기 짐을 쥔 몸 수 · 직업별)
//   ③ 약탈 품목(무기 짐 다섯 — 품목 · 양 · 싸운 단)
//   ④ 단마다 날마다 도구 수(더미 g.arms) — 처음 > 0 · 마지막 > 0 · 가장 많음 · 0 인 날
//   ⑤ 장부 사냥(T1404 셈 fgHunt 날마다) · 30날마다 단 둘레 140칸 짐승 몸(wildlife S.mobs) 수
//   ⑥ 날마다 CPU 초(process.cpuUsage — 가상 시계가 안 덮는다) · RSS · 힙
//   ⑦ T1496_PROF="a-b[,c-d]" 이면 그 날 사이 CPU 프로필(inspector) → <out>.prof<a>.cpuprofile
//   ⑧ 단 몸 걸음(T1469 옮김 · 길목) — 30틱마다 단 몸 자리 · 하루 걸음 합(몸마다) → 하루 가장 먼 몸 걸음(칸)
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1404_ROOT || process.cwd(), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const VS = () => { const m = require.cache[path.join(ROOT, 'server', 'villages.js')]; return m && m.exports; };
  const BS = () => { const m = require.cache[path.join(ROOT, 'server', 'bandits.js')]; return m && m.exports; };
  const WS = () => { const m = require.cache[path.join(ROOT, 'server', 'wildlife.js')]; return m && m.exports; };
  const ARMS = ['weapon', 'armor', 'tool', 'iron_tool', 'bronze_tool'], TOOLS = ['tool', 'iron_tool', 'bronze_tool'];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  const X = { joins: [], joinSum: { calls: 0, n: 0, bodies: 0, withArms: 0, withTool: 0, withToolItems: 0, inv: {} }, census: {}, loot: {}, lootByGang: {}, gangTools: {}, hunt: [], mobs: [], cpu: [], walk: {}, npcKeys: null, prof: [] };
  let H = null, lastDay = -1, cpu0 = process.cpuUsage(), lastTickDay = -1;
  const getHost = () => {
    try { const B = BS(); const P = B && B._t765Probe; if (!P || !P.setHost) return H; const k = P.setHost(null); P.setHost(k.host); if (k.host && k.host !== H) { H = k.host; X.hostSeen = (X.hostSeen || 0) + 1; } } catch (e) {}
    if (H && typeof H.t1039Depart === 'function' && !H.t1039Depart.__t1496) {
      const o = H.t1039Depart;
      const f = function (vil, camp, n) {
        const L = o.apply(this, arguments);
        try {
          const row = { day: lastDay, v: vil && vil.name, n: n | 0, bodies: 0, inv: {}, toolItems: 0, equip: 0, jobs: {} };
          for (const pid of (L && L.pids) || []) {
            const p = H.players.get(pid); if (!p) continue; row.bodies++;
            let arms = 0, tool = 0;
            for (const k of Object.keys(p.inventory || {})) { const q = +p.inventory[k] || 0; if (q > 0) { row.inv[k] = r3((row.inv[k] || 0) + q); X.joinSum.inv[k] = r3((X.joinSum.inv[k] || 0) + q); if (ARMS.includes(k)) arms += q; if (TOOLS.includes(k)) tool += q; } }
            const ti = (p.toolItems || []).length; row.toolItems += ti; row.equip += (p.equipment || []).length + (p.equipped ? 1 : 0);
            row.jobs[p.simJob || '-'] = (row.jobs[p.simJob || '-'] || 0) + 1;
            if (arms > 0) X.joinSum.withArms++; if (tool > 0) X.joinSum.withTool++; if (ti > 0) X.joinSum.withToolItems++;
          }
          X.joinSum.calls++; X.joinSum.n += n | 0; X.joinSum.bodies += row.bodies;
          if (X.joins.length < 400) X.joins.push(row);
        } catch (e) { X.joinErr = String(e && e.message); }
        return L;
      };
      f.__t1496 = true; H.t1039Depart = f;
    }
    return H;
  };
  const census = (day) => {
    const h = getHost(); if (!h || !h.players) return;
    const c = { day, npc: 0, vilNpc: 0, arms: {}, withArms: 0, withTool: 0, toolItems: 0, warrior: 0, warriorArms: 0, gangBodies: 0, gangArms: {} };
    for (const p of h.players.values()) {
      if (!p || !p.isNpc) continue; c.npc++;
      const inV = p.simVillageId != null, inG = p._bdtGid != null;
      if (inV) c.vilNpc++; if (inG) c.gangBodies++;
      let a = 0, t = 0;
      for (const k of ARMS) { const q = +((p.inventory || {})[k]) || 0; if (q > 0) { a += q; if (TOOLS.includes(k)) t += q; const T = inG ? c.gangArms : c.arms; T[k] = r3((T[k] || 0) + q); } }
      if (inV && a > 0) c.withArms++; if (inV && t > 0) c.withTool++; if (inV && (p.toolItems || []).length) c.toolItems++;
      if (inV && p.simJob === 'warrior') { c.warrior++; if (a > 0) c.warriorArms++; }
    }
    X.census[day] = c;
    if (!X.npcKeys) { try { const V = VS(); const vs = V.__labProbe._t569Probe.setup().villages || []; for (const v of vs) if (v.econ && v.econ.npcs && v.econ.npcs.length) { X.npcKeys = Object.keys(v.econ.npcs[0]); break; } } catch (e) {} }
  };
  const wrapLoot = (W) => {
    if (!W || typeof W.onBanditLoot !== 'function' || W.onBanditLoot.__t1496) return;
    const orig = W.onBanditLoot;
    const f = function (victim, other, res, amt, day, gang) {
      try { if (amt > 0) { const o = X.loot[res] || (X.loot[res] = { n: 0, amt: 0 }); o.n++; o.amt = r3(o.amt + amt); if (ARMS.includes(res) && gang) { const q = X.lootByGang[gang.id] || (X.lootByGang[gang.id] = {}); q[res] = r3((q[res] || 0) + amt); } } } catch (e) {}
      return orig.apply(this, arguments);
    };
    f.__t1496 = true; W.onBanditLoot = f;
  };
  const toolsOf = (g) => { const a = g.arms || {}; let t = 0; for (const k of TOOLS) t += +a[k] || 0; return t; };
  let prevHunt = null;
  const prof = { sess: null, spec: (process.env.T1496_PROF || '').split(',').filter(Boolean).map((s) => s.split('-').map(Number)), cur: null };
  const profDay = (day) => {
    if (!prof.spec.length) return;
    try {
      if (prof.cur && day >= prof.cur[1]) { const a = prof.cur[0]; prof.sess.post('Profiler.stop', (err, r) => { if (!err && r) fs.writeFileSync(OUT + '.prof' + a + '.cpuprofile', JSON.stringify(r.profile)); X.prof.push({ a, b: day, err: err ? String(err) : null }); }); prof.cur = null; }
      const s = prof.spec.find((q) => q[0] === day);
      if (s && !prof.cur) { if (!prof.sess) { const I = require('inspector'); prof.sess = new I.Session(); prof.sess.connect(); } prof.sess.post('Profiler.enable'); prof.sess.post('Profiler.setSamplingInterval', { interval: 2000 }); prof.sess.post('Profiler.start'); prof.cur = s; }
    } catch (e) { X.profErr = String(e && e.message); }
  };
  const dayX = (day, world) => {
    getHost(); wrapLoot(world);
    const u = process.cpuUsage(cpu0); cpu0 = process.cpuUsage(); const m = process.memoryUsage();
    X.cpu.push([day, r3((u.user + u.system) / 1e6), Math.round(m.rss / 1048576), Math.round(m.heapUsed / 1048576)]);
    profDay(day);
    if (day === 1 || day === 60 || day === 365 || day === 400 || day === 730) census(day);
    const B = BS(); if (!B) return;
    const T = B.t1404 ? B.t1404() : null, ts = (T && T.st) || {};
    const cur = { h: +ts.fgHunt || 0, f: +ts.fgForage || 0, d: +ts.fgDays || 0 }, p = prevHunt || cur;
    const s6 = B._t1460Probe ? B._t1460Probe.stat() : null;
    X.hunt.push([day, r3(cur.h - p.h), r3(cur.f - p.f), cur.d - p.d, s6 ? s6.here : null]); prevHunt = cur;
    const G = B.gangs ? B.gangs() : [];
    for (const g of G) {
      const t = toolsOf(g), r = X.gangTools[g.id] || (X.gangTools[g.id] = { first: null, last: null, max: 0, zeroDays: 0, days: 0, end: null, born: g.born, nMax: 0 });
      r.days++; r.nMax = Math.max(r.nMax, g.n | 0); if (t > 0) { if (r.first == null) r.first = day; r.last = day; } else r.zeroDays++; r.max = Math.max(r.max, r3(t)); r.end = r3(t); r.lastSeen = day;
    }
    if (day % 30 === 0) {
      const W = WS(), mobs = (W && W._debug && W._debug.S && W._debug.S.mobs) || [];
      let big = 0; for (const mb of mobs) if (mb && mb.px > 4000) { big = 1; break; }
      const sc = big ? 1 / 32 : 1, rows = [];
      for (const g of G) {
        let k = 0; const ty = {};
        for (const mb of mobs) { if (!mb) continue; const dx = mb.px * sc - g.camp.cx, dy = mb.py * sc - g.camp.cy; if (dx * dx + dy * dy <= 19600) { k++; ty[mb.type] = (ty[mb.type] || 0) + 1; } }
        rows.push({ id: g.id, n: g.n | 0, camp: [g.camp.cx, g.camp.cy], mobs: k, ty, tools: r3(toolsOf(g)) });
      }
      X.mobs.push({ day, all: mobs.length, scale: big ? 'px' : 'cell', rows });
    }
  };
  // ⑧ 단 몸 걸음 — 존 틱마다는 무겁다: 이 관찰기는 econ 하루 경계에서 몸 자리만 본다(하루 걸음 = 어제 자리 → 오늘 자리 곧은 거리 · 칸)
  const prevPos = new Map();
  const walkDay = (day) => {
    const B = BS(), h = getHost(); if (!B || !h || !B.t1039) return;
    const bod = B.t1039().bodies || [];
    let mx = 0, sum = 0, nb = 0;
    const st = X.walk[day] = { max: 0, mean: 0, n: 0, gang: {} };
    for (const [gid, pids] of bod) {
      for (const pid of pids) {
        const p = h.players.get(pid); if (!p) continue;
        const q = prevPos.get(pid), x = p.x / 32, y = p.y / 32;
        if (q) { const d = Math.hypot(x - q[0], y - q[1]); sum += d; nb++; if (d > mx) mx = d; const G = st.gang[gid] || (st.gang[gid] = 0); if (d > G) st.gang[gid] = r3(d); }
        prevPos.set(pid, [x, y]);
      }
    }
    st.max = r3(mx); st.mean = nb ? r3(sum / nb) : 0; st.n = nb;
    if (Object.keys(st.gang).length === 0) delete st.gang;
  };
  const dump = () => { try { X.lastDay = lastDay; fs.writeFileSync(OUT + '.t1496.json', JSON.stringify(X)); } catch (e) {} };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { if ((day | 0) !== lastDay) { lastDay = day | 0; dayX(lastDay, world); walkDay(lastDay); if (lastDay % 30 === 0) dump(); } } catch (e) { X.err = String(e && e.message); }
      return r;
    };
    return Lg;
  };
  process.on('exit', () => dump());
}
