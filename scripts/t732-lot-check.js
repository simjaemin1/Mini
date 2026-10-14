#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T732 자 · 제품 무접촉 · 판정 0)
// === scripts/t732-lot-check.js — 로트 합 = 인벤 불변식 전수(판 끝 · 재기동 뒤) · 곳간 장부 크기 · 근사 · 뭉개기 셈 ===
//
// ★왜 [T732 ⑤] 카드: "로트 합 = 인벤 불변식 전수(판 끝 · 재기동 뒤)". 실서버(`node server/zone.js` · 새 세계 · 손님 0 · 빠른 시계)를
//   손잡이 `T732_MOMENT_LOT=1` 로 N 일 돌리고, 그 날 econ 하루 끝(서버 장부 `scanDay` — t577 · 기준선 게이트와 같은 문)에서 **읽기만** 한다:
//     · 곳간 — 감싼 칸마다 장부 합 − 빚 = 곳간 값(`granary-lots.check`)
//     · NPC 몸 — 로트 품목마다 ⌊곁 장부 합⌋ = ⌊인벤⌋(모자람 = 로트를 안 거친 길 · 넘침 = 줄어든 길)
//     · 바닥 · 상자 — 로트 레코드 합 = 개수(있을 때)
//     · 캐러밴 짐 — 실은 단위 = 짐 레코드 합(길 위) · 전쟁 팩 — 실은 단위 = 팩 레코드 합
//     · 셈 — 근사(사람 · NPC 맞추기) · 뭉개기(상한) · 곳간 장부의 씨앗 · 새 로트 · 넘김 · 늦게 감싼 칸 · 어긋남 · 레코드 없이 든 문/줌
//     · 크기 — 곳간 레코드 수(마을 · 칸) · 저장 바이트(econ 줄에 실리는 장부 JSON)
//   그리고 SIGTERM(T728 종료 저장 — 켬 기본) → 같은 DB 로 다시 띄워 **부팅 직후**(장부를 붙인 그 순간) 저장된 장부와 붙은 장부가 같은지 · 불변식.
//
// 쓰는 법: node scripts/t732-lot-check.js [일수=200] [시드=1020] [--out 계측/T732_불변식_<시드>.json]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

// ══ 아이 존 안(이 파일을 --require 로 싣는다) ══════════════════════════════════════
if (process.env.T732C_PHASE) {
  const PH = process.env.T732C_PHASE, OUT = process.env.T732C_OUT, DAYS = parseInt(process.env.T732C_DAYS || '200', 10);
  const GL = require(path.join(ROOT, 'server', 'granary-lots'));
  const Lots = require(path.join(ROOT, 'server', 'lots'));
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  let W = null;
  const cw = V2.createWorldV2;
  V2.createWorldV2 = function () { const w = cw.apply(this, arguments); if (!W) W = w; return w; };
  const write = (o) => { try { fs.writeFileSync(OUT, JSON.stringify(o)); } catch (e) {} };
  const sumU = (recs) => (recs || []).reduce((a, r) => a + (+r.u || 0), 0);
  const sumN = (recs) => (recs || []).reduce((a, r) => a + (+r.n || 0), 0);
  const ledgerSize = (vs) => {
    let recs = 0, bytes = 0, maxV = 0, maxVB = 0, maxCell = 0, maxCellRes = null, cells = 0;
    const byRes = {};
    for (const v of vs) {
      const D = GL.dump(v); if (!D) continue;
      const b = JSON.stringify(D).length; bytes += b; if (b > maxVB) maxVB = b;
      let n = 0;
      for (const [res, a] of Object.entries(D.L)) { n += a.length; cells++; byRes[res] = (byRes[res] || 0) + a.length; if (a.length > maxCell) { maxCell = a.length; maxCellRes = `${v.name}·${res}`; } }
      recs += n; if (n > maxV) maxV = n;
    }
    const top = Object.entries(byRes).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { recs, cells, bytes, maxV, maxVB, maxCell, maxCellRes, top };
  };
  if (PH === '1') {
    const Ev = require(path.join(ROOT, 'server', 'events'));
    const mk = Ev.createLedger;
    let done = false;
    const sizes = [];
    Ev.createLedger = function () {
      const L = mk.apply(this, arguments);
      const sd = L.scanDay;
      L.scanDay = function (world, day) {
        const r = sd.apply(this, arguments);
        try {
          const d = day | 0;
          if (d % 50 === 0 || d === 1) sizes.push([d, ledgerSize(world.villages)]);
          if (!done && d >= DAYS) { done = true; finish(world, d); }
        } catch (e) { console.error('[t732-check] 실패:', e.stack); }
        return r;
      };
      return L;
    };
    const WALL = parseInt(process.env.T732C_WALL_MS || '0', 10);
    if (WALL > 0) setTimeout(() => { if (!done && W) { done = true; try { finish(W, W.day | 0); } catch (e) { console.error('[t732-check] 실패:', e.stack); } } }, WALL);   // 실시간 판 — 벽시계로 끝낸다(몸이 걷고 손에 든다)
    function finish(world, day) {
      const Z = require(path.join(ROOT, 'server', 'zone.js')).__testBind();
      const out = { phase: 1, day, villages: world.villages.length, attachedAll: world.villages.every((v) => GL.attached(v)) };
      out.granary = GL.check(world.villages, 1e-6);
      out.granary.bad = out.granary.bad.slice(0, 10);
      // NPC 몸(곁 장부) · 사람(있으면)
      const npc = { bodies: 0, withLots: 0, items: 0, short: 0, over: 0, shortEx: [], overEx: [], lots: 0, maxPerItem: 0 };
      const ppl = { bodies: 0, items: 0, short: 0, over: 0 };
      for (const p of Z.players.values()) {
        const inv = p.inventory || {}; const isN = !!p.isNpc;
        if (isN) npc.bodies++; else ppl.bodies++;
        let any = false;
        for (const it of Object.keys(inv)) {
          if (!Lots.isLot(it)) continue;
          const have = Math.floor(+inv[it] || 0);
          const L = (Lots.all(p) || {})[it] || [];
          const s = Math.floor(sumN(L) + 1e-6);
          if (!have && !L.length) continue;
          any = true;
          const T = isN ? npc : ppl; T.items++;
          if (isN) { npc.lots += L.length; npc.maxPerItem = Math.max(npc.maxPerItem, L.length); }
          if (s < have) { T.short++; if (isN && npc.shortEx.length < 6) npc.shortEx.push([p.npcJob || p.simJob || '?', it, have, s]); }
          if (s > have) { T.over++; if (isN && npc.overEx.length < 6) npc.overEx.push([p.npcJob || p.simJob || '?', it, have, s]); }
        }
        if (isN && any) npc.withLots++;
      }
      out.npc = npc; out.people = ppl;
      // 바닥 · 상자
      const gnd = { items: 0, lot: 0, withLots: 0, mismatch: 0 };
      for (const gi of Z.groundItems.values()) { gnd.items++; if (!Lots.isLot(gi.item)) continue; gnd.lot++; if (Array.isArray(gi.lots) && gi.lots.length) { gnd.withLots++; if (Math.abs(sumN(gi.lots) - (+gi.count || 0)) > 1e-4) gnd.mismatch++; } }
      out.ground = gnd;
      const chest = { n: 0, cells: 0, mismatch: 0 };
      for (const b of Z.buildings.values()) { if (!b || (b.type !== 'chest' && b.type !== 'guild_granary') || !b.data) continue; chest.n++;
        for (const [k, q] of Object.entries(b.data)) { if (typeof q !== 'number' || !Lots.isLot(k)) continue; chest.cells++; const L = (b.data._lots && b.data._lots[k]) || []; if (Math.abs(sumN(L) - q) > 1e-4) chest.mismatch++; } }
      out.chest = chest;
      // 캐러밴 짐 · 전쟁 팩
      const car = { n: 0, give: 0, giveBad: 0, ret: 0, retBad: 0, ex: [] };
      for (const c of (world.caravans || [])) {
        car.n++;
        const K = GL.cargoDump(c) || {};
        if (c.state === 'outbound' && Lots.isLot(c.giveRes) && GL.attached(c.from)) { car.give++; const u = sumU(K.give); if (Math.abs(u - (+c.giveAmt || 0)) > 1e-4 * Math.max(1, c.giveAmt)) { car.giveBad++; if (car.ex.length < 4) car.ex.push(['give', c.giveRes, c.giveAmt, +u.toFixed(4)]); } }
        if (c.state === 'inbound' && !c._abandoned && c._returningRes && Lots.isLot(c._returningRes) && c._returningAmt > 0) { car.ret++; const u = sumU(K.ret); if (Math.abs(u - (+c._returningAmt || 0)) > 1e-4 * Math.max(1, c._returningAmt)) { car.retBad++; if (car.ex.length < 4) car.ex.push(['ret', c._returningRes, c._returningAmt, +u.toFixed(4)]); } }
      }
      out.caravans = car;
      const war = { packs: 0, bad: 0 };
      //   팩 = 품목별로 뗀 양(`_packItems` — 섭식 정본이 고른 품목 · 곳간 단위) — 레코드 합이 품목마다 그 양이다(`_packLoad` 는 식량등가라 견주지 않는다)
      for (const w of (world._warWars || [])) { if (w && w._packLots && w._packItems) { war.packs++; for (const [res, q] of Object.entries(w._packItems)) { if (!Lots.isLot(res) || !(q > 0)) continue; const u = sumU(w._packLots[res]); if (Math.abs(u - q) > 1e-4 * Math.max(1, q)) war.bad++; } } }
      war.wars = (world._warWars || []).length;
      out.warPacks = war;
      out.lots = Lots.stats();
      out.gl = GL.stats();
      out.size = ledgerSize(world.villages);
      out.sizes = sizes;
      out.econDay = world.day;
      write(out);
      console.log(`[t732-check] 판 끝 ${day} — 곳간 칸 ${out.granary.cells} 어긋남 ${out.granary.bad.length} · NPC 모자람 ${npc.short} 넘침 ${npc.over} · 짐 어긋남 ${car.giveBad + car.retBad} → SIGTERM`);
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
    }
  } else if (PH === '2') {
    const EXP = JSON.parse(fs.readFileSync(process.env.T732C_EXPECT, 'utf8'));
    const N = EXP.n | 0;
    const seen = [];
    const att = GL.attach;
    GL.attach = function (v) {
      const r = att.apply(this, arguments);
      if (r && !seen.includes(v)) seen.push(v);
      if (seen.length === N) check();
      return r;
    };
    let checked = false;
    function check() {
      if (checked) return; checked = true;
      const out = { phase: 2, n: seen.length, same: 0, diff: 0, diffEx: [], missingSaved: 0 };
      for (const v of seen) {
        const want = EXP.L[v.name];
        const got = GL.dump(v);
        if (!want) { out.missingSaved++; continue; }
        const a = JSON.stringify(want.L), b = JSON.stringify(got ? got.L : {});
        if (a === b) out.same++; else { out.diff++; if (out.diffEx.length < 3) out.diffEx.push(v.name); }
      }
      out.granary = GL.check(seen, 1e-6); out.granary.bad = out.granary.bad.slice(0, 10);
      out.gl = GL.stats();
      // 캐러밴 짐(T728 메타가 같은 날이면 길 위 캐러밴이 돌아온다) — `_t728Restore` 는 붙이기보다 먼저 돈다 · 같은 차례에서 본다(틱이 끼면 짐이 움직인다)
      try {
        const car = { n: 0, withCargo: 0, same: 0, diff: 0, ex: [] };
        for (const c of ((W && W.caravans) || [])) {
          car.n++;
          const K = GL.cargoDump(c);
          const want = EXP.cargo && EXP.cargo[String(c.id)];
          if (K) car.withCargo++;
          if (want) { if (JSON.stringify(want) === JSON.stringify(K)) car.same++; else { car.diff++; if (car.ex.length < 3) car.ex.push({ id: c.id, state: c.state, want: JSON.stringify(want).slice(0, 300), got: JSON.stringify(K).slice(0, 300) }); } }
        }
        out.caravans = car;
        out.metaCaravans = EXP.metaCaravans;
      } catch (e) { out.carErr = e.message; }
      write(out);
      console.log(`[t732-check] 재기동 — 마을 ${out.n} · 장부 같음 ${out.same} 다름 ${out.diff} · 불변식 어긋남 ${out.granary.bad.length}`);
      setImmediate(() => {
        setTimeout(() => process.exit(0), 20);
      });
    }
  }
  return;
}

// ══ 바깥(두 판을 띄우고 DB 를 읽는다) ═════════════════════════════════════════════
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const pos = process.argv.slice(2).filter((x, i, a) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
const DAYS = parseInt(pos[0], 10) || 200;
const WALL_MS = parseInt(arg('--wall', '0'), 10) || 0;   // >0 이면 실시간 판(제품 하루 길이 · 몸 상한 기본) — 그 ms 뒤에 본다
const SEED = parseInt(pos[1], 10) || 1020;
const OUTF = path.resolve(arg('--out', path.join(ROOT, '계측', `T732_불변식_${SEED}.json`)));
const DIR = `/tmp/t732-check-${process.pid}`;
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'zone.db');
const base = Object.assign({}, process.env, {
  ZONE_ID: 'hanbando', PORT: String(39800 + (process.pid % 150)), DB_PATH: DB, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  T640_BOOT_SLICE: '0',
  T577_SEED: String(SEED), T577_DAYS: '999999', T732_MOMENT_LOT: '1',
}, WALL_MS > 0 ? { T732C_WALL_MS: String(WALL_MS), T732C_DAYS: '999999' } : {
  VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || '250', T315_MAPBEDS: process.env.T315_MAPBEDS != null ? process.env.T315_MAPBEDS : '0',
  VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP || '1',
});
function run(phase, extra, upRe, capMs) {
  return new Promise((resolve) => {
    const out = path.join(DIR, `p${phase}.json`), logf = path.join(DIR, `p${phase}.log`);
    try { fs.unlinkSync(out); } catch (e) {}
    const env = Object.assign({}, base, extra, { T732C_PHASE: String(phase), T732C_OUT: out });
    if (!env.T732C_DAYS) env.T732C_DAYS = String(DAYS);
    const ch = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), '-r', __filename, path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(logf); ch.stdout.pipe(lf); ch.stderr.pipe(lf);
    const t0 = Date.now();
    const kill = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, capMs);
    ch.on('exit', (code) => { clearTimeout(kill); let o = null; try { o = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { o = null; } resolve({ o, code, sec: ((Date.now() - t0) / 1000) | 0, logf }); });
    void upRe; void FB;
  });
}
(async () => {
  console.log(`\n=== T732 불변식 · 재기동 — ${WALL_MS > 0 ? `실시간 ${WALL_MS / 1000}초` : `${DAYS}일`} · 시드 ${SEED} · ${DIR} ===`);
  const r1 = await run(1, {}, null, 60 * 60 * 1000);
  if (!r1.o) { console.log(`  ✗ 판 1 결과 없음 — 로그 ${r1.logf}`); process.exit(2); }
  console.log(`  판 1: ${r1.sec}초 · 종료 코드 ${r1.code}`);
  // 저장된 장부(econ 줄) · 메타(캐러밴 짐)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB);
  const rows = db.prepare('SELECT name, econ_state FROM villages').all();
  const EXP = { n: 0, L: {}, cargo: {}, metaCaravans: 0 };
  for (const r of rows) { if (!r.econ_state) continue; const e = JSON.parse(r.econ_state); EXP.n++; if (e._t732Lots) EXP.L[e.name || r.name] = e._t732Lots; }
  const meta = db.prepare('SELECT data FROM world_meta').all();
  for (const m of meta) { const M = JSON.parse(m.data); for (const c of (M.caravans || [])) { EXP.metaCaravans++; if (c._t732Cargo) EXP.cargo[String(c.id)] = c._t732Cargo; } }
  db.close();
  const expf = path.join(DIR, 'expect.json');
  fs.writeFileSync(expf, JSON.stringify(EXP));
  console.log(`  저장: 마을 줄 ${EXP.n} · 장부 실린 줄 ${Object.keys(EXP.L).length} · 메타 캐러밴 ${EXP.metaCaravans}(짐 레코드 ${Object.keys(EXP.cargo).length})`);
  const r2 = await run(2, { T732C_EXPECT: expf }, null, 15 * 60 * 1000);
  const res = { days: DAYS, wallMs: WALL_MS, seed: SEED, p1: r1.o, p2: r2.o, saved: { rows: EXP.n, ledgers: Object.keys(EXP.L).length, metaCaravans: EXP.metaCaravans, cargo: Object.keys(EXP.cargo).length } };
  fs.mkdirSync(path.dirname(OUTF), { recursive: true });
  fs.writeFileSync(OUTF, JSON.stringify(res, null, 1));
  const p1 = r1.o, p2 = r2.o || {};
  console.log(`\n  판 끝(${p1.day}일 · econ ${p1.econDay}일): 곳간 칸 ${p1.granary.cells} · 어긋남 ${p1.granary.bad.length}`);
  console.log(`  NPC 몸 ${p1.npc.bodies}(로트 든 몸 ${p1.npc.withLots} · 품목 ${p1.npc.items}) · 모자람 ${p1.npc.short} · 넘침 ${p1.npc.over} · 로트 ${p1.npc.lots}(품목당 최대 ${p1.npc.maxPerItem})`);
  console.log(`  바닥 ${p1.ground.items}(로트 품목 ${p1.ground.lot} · 레코드 실린 ${p1.ground.withLots} · 어긋남 ${p1.ground.mismatch}) · 상자 ${p1.chest.n} 칸 ${p1.chest.cells} 어긋남 ${p1.chest.mismatch}`);
  console.log(`  캐러밴 ${p1.caravans.n}(가는 짐 ${p1.caravans.give} 어긋남 ${p1.caravans.giveBad} · 오는 짐 ${p1.caravans.ret} 어긋남 ${p1.caravans.retBad}) · 전쟁 팩 ${p1.warPacks.packs} 어긋남 ${p1.warPacks.bad}`);
  console.log(`  셈: 근사 ${p1.lots.approx} ${JSON.stringify(p1.lots.approxBy)} · 뭉개기 ${p1.lots.coalesced}`);
  console.log(`  곳간 장부: ${JSON.stringify(p1.gl)}`);
  console.log(`  크기: 레코드 ${p1.size.recs} · 칸 ${p1.size.cells} · 저장 ${(p1.size.bytes / 1024).toFixed(1)}KB · 마을 최대 ${p1.size.maxV}개 ${(p1.size.maxVB / 1024).toFixed(1)}KB · 칸 최대 ${p1.size.maxCell}(${p1.size.maxCellRes})`);
  console.log(`  재기동: 마을 ${p2.n} · 장부 같음 ${p2.same} 다름 ${p2.diff} · 불변식 어긋남 ${p2.granary ? p2.granary.bad.length : '—'} · 캐러밴 ${JSON.stringify(p2.caravans || null)}`);
  console.log(`\n  → ${OUTF}`);
})().catch((e) => { console.error(e); process.exit(1); });
