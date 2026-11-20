'use strict';
// T1376 진단 픽스처(러너 밖 · 제품 무변) — 캐러밴 몸의 머묾 때를 프레임마다 적는다(같은 존 · 이웃 존 상인 견줌).
//   env LG_DIAG_DIR 가 있고 존 프로세스(ZONE_ID) 본 스레드일 때만 깬다. villages.js 글자에 기록 줄 셋을 끼운다(동작 0 — 읽기만).
const fs = require('fs'), path = require('path');
let main = true; try { main = require('worker_threads').isMainThread; } catch (e) {}
const DIR = process.env.LG_DIAG_DIR, Z = process.env.ZONE_ID;
if (DIR && Z && main) {
  const Module = require('module'); const _c = Module.prototype._compile;
  const REP = [
    ['function tickCaravanBodies(now) {', 'function tickCaravanBodies(now) { if (globalThis.__lgF) globalThis.__lgF(state, now);'],
    ['function startReturnLeg(body, now) {', 'function startReturnLeg(body, now) { if (globalThis.__lgR) globalThis.__lgR(state, body, now);'],
    ['      S.arrived++;', '      S.arrived++; if (globalThis.__lgA) globalThis.__lgA(state, body, c, now);'],
  ];
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('server', 'villages.js'))) {
      for (const [a, b] of REP) { if (content.split(a).length !== 2) throw new Error('diag-linger: 글자 ' + a); content = content.replace(a, b); }
      content += '\n;globalThis.__lgNow = function () { return _t1253Now(); };\n';
    }
    return _c.call(this, content, filename);
  };
  fs.mkdirSync(DIR, { recursive: true });
  const FILE = path.join(DIR, `lg-${Z}-${process.pid}.jsonl`);
  let buf = [];
  const ev = (o) => { buf.push(JSON.stringify(o)); if (buf.length > 2000) flush(); };
  const flush = () => { if (!buf.length) return; try { fs.appendFileSync(FILE, buf.join('\n') + '\n'); } catch (e) {} buf = []; };
  process.on('exit', flush);
  const R3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
  const ctx = (st) => ({ V: Date.now(), E: R3(globalThis.__lgNow ? globalThis.__lgNow() : null), win: st._t731 ? 1 : 0, tj: st.tickJobs ? 1 : 0, edge: st._t1253Edge ? 1 : 0, day: st.world ? st.world.day : null });
  const mk = (st, c) => { try { const v = st.byEcon && c && st.byEcon.get(c.to); const r = v && v._mkt; return r ? { d: r.d, end: R3(r.end), in: r.cars.has(c.id) ? 1 : 0 } : null; } catch (e) { return null; } };
  const seen = new Map();
  let nf = 0;
  globalThis.__lgF = (st, now) => {
    nf++;
    const B = st.caravanBodies; if (!B) return;
    const C = ctx(st);
    const live = new Set();
    for (const [k, b] of B) {
      const key = String(k); live.add(key);
      const atEnd = (b.phase === 'outbound' && b.len > 0 && b.prog >= b.len - 0.5) ? 1 : 0;
      const p = seen.get(key);
      if (!p || p.ph !== b.phase || p.atEnd !== atEnd) {
        ev(Object.assign({ op: p ? 'ph' : 'new', k: key, xz: key.startsWith('xz:') ? 1 : 0, ph: b.phase, atEnd, prog: R3(b.prog), len: R3(b.len), lu: R3(b.lingerUntil), hx: (b.c && b.c._xzHome) ? 1 : 0, f: nf }, C));
        seen.set(key, { ph: b.phase, atEnd });
      }
    }
    for (const key of [...seen.keys()]) if (!live.has(key)) { ev(Object.assign({ op: 'gone', k: key, f: nf }, C)); seen.delete(key); }
    if (nf % 300 === 0) flush();
  };
  globalThis.__lgA = (st, body, c, now) => {
    let key = null; try { for (const [k, b] of st.caravanBodies) if (b === body) { key = String(k); break; } } catch (e) {}
    ev(Object.assign({ op: 'arr', k: key, cid: c.id != null ? String(c.id) : null, xz: (c._xzHome ? 1 : 0), res: c.giveRes || null, ab: c._abandoned ? 1 : 0, mkD: c._mktD != null ? c._mktD : null, lu: R3(body.lingerUntil), t952: body._t952 ? 1 : 0, mk: mk(st, c), f: nf }, ctx(st)));
  };
  globalThis.__lgR = (st, body, now) => {
    let key = null; try { for (const [k, b] of st.caravanBodies) if (b === body) { key = String(k); break; } } catch (e) {}
    ev(Object.assign({ op: 'ret', k: key, ph: body.phase, lu: R3(body.lingerUntil), f: nf }, ctx(st)));
  };
}
