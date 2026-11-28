#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1471 덧붙임 셋 라이브 사본 날 판 · 제품 무변)
// === scripts/t1471-live-days.js — 라이브 존 DB 사본을 띄워 N날 돌리며 한 마을의 몸 · 인구 · 굶음을 날마다 적는다 ==========
//   node scripts/t1471-live-days.js <존 DB 사본> <존> <0|1> <날 수> <마을 이름> <out.json>
//   판 조건: 판 자(t577)와 같은 빠른 시계(`VILLAGE_DAY_MS=250`) · 가상 시계(`t745-vclock` — 결정론) · 손잡이 `T1471_LAND_FIT` 0 · 1 만 다르다.
//   날마다(econ 날이 바뀔 때) — 그 마을: 인구 · 굶는 사람(`foodDebtOf().starving`) · 몸 수 · 산 · 물 칸에 선 몸 · 일터가 산 · 물 칸인 몸 ·
//     집에서 일터로 걸어 닿지 못하는 몸(`npcCanReach` — 일터 닿음 T427 과 같은 술어) · 존 전체 인구 · 빈 마을 수.
//   ⚠빠른 시계에선 몸이 하루에 몇 걸음 못 간다 — "닿는가"는 걸음 술어로 잰다(실제로 걸어 닿은 몫이 아니다).
'use strict';
const path = require('path'), fs = require('fs');
if (process.env.T1471_DAYS_CHILD) {   // ── 존 안(프리로드) ──
  const _main = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
  if (!_main) return;
  const OUT = process.env.T1471_DAYS_CHILD, N = +process.env.T1471_DAYS_N, NAME = process.env.T1471_DAYS_VIL;
  const rec = { days: [], start: null, err: null, lines: [] };
  const flush = () => { try { fs.writeFileSync(OUT + '.tmp', JSON.stringify(rec)); fs.renameSync(OUT + '.tmp', OUT); } catch (e) {} };
  const Module = require('module'); const _c = Module.prototype._compile; const VJS = path.join('server', 'villages.js');
  Module.prototype._compile = function (content, filename) { if (filename.endsWith(VJS)) content += '\n;module.exports.__t1471d = function () { return state; };\n'; return _c.call(this, content, filename); };
  const _l = console.log; console.log = function (...a) { try { const s = a.map((x) => (typeof x === 'string' ? x : '')).join(' '); if (/\[T1471\]/.test(s)) rec.lines.push(s.slice(0, 300)); } catch (e) {} return _l.apply(this, a); };
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    const r = _p(m, filename);
    if (filename.endsWith(VJS)) {
      const g = m.exports.onGameTick; let last = -1;
      m.exports.onGameTick = function () {
        const out = g.apply(this, arguments);
        try {
          const st = m.exports.__t1471d(), d = (st.world && st.world.day) | 0;
          if (d !== last) { last = d; if (rec.start == null) rec.start = d; rec.days.push(snap(st, d)); flush(); if (d - rec.start >= N) { flush(); process.exit(0); } }
        } catch (e) { rec.err = String(e && e.stack).slice(0, 600); flush(); }
        return out;
      };
    }
    return r;
  };
  function snap(st, d) {
    const ta = st.ta, E = require(path.join(path.dirname(path.dirname(path.resolve(process.argv[1]))), 'sim', 'economy-sim'));
    const bad = (px, py) => { if (!Number.isFinite(px)) return false; const x = Math.floor(px / 32), y = Math.floor(py / 32); return ta.isRock(x, y) || (ta.isWater(x, y) && ta.isBlocked(x, y)); };
    const v = st.villages.find((q) => q.name === NAME), P = st.deps.players, R = st.deps.npcCanReach;
    let pop = 0, empty = 0; for (const q of st.villages) { const n = q.econ && q.econ.npcs ? q.econ.npcs.length : 0; pop += n; if (!n) empty++; }
    const o = { d, zonePop: pop, empty };
    if (v) {
      const fd = E.foodDebtOf ? E.foodDebtOf(v.econ) : null;
      o.pop = v.econ.npcs.length; o.starving = fd ? fd.starving : null; o.houses = v._houseCells.length;
      let n = 0, inBad = 0, workBad = 0, noReach = 0, withWork = 0;
      for (const pid of v.npcPids) {
        const p = P.get(pid); if (!p) continue; n++;
        if (bad(p.x, p.y)) inBad++;
        if (Number.isFinite(p.npcWorkX)) { withWork++; if (bad(p.npcWorkX, p.npcWorkY)) workBad++; else if (typeof R === 'function') { try { if (!R(p.x, p.y, p.npcWorkX, p.npcWorkY)) noReach++; } catch (e) {} } }
      }
      Object.assign(o, { bodies: n, inBad, withWork, workBad, noReach });
    }
    return o;
  }
  return;
}
// ── 부르는 쪽 ──
const { spawn } = require('child_process');
const [SRC, ZONE, ON, DAYS, NAME, OUT] = process.argv.slice(2);
if (!OUT) { console.log('쓰는 법: node scripts/t1471-live-days.js <존 DB 사본> <존> <0|1> <날 수> <마을 이름> <out.json>'); process.exit(2); }
const ROOT = path.join(__dirname, '..'), WD = fs.mkdtempSync('/tmp/t1471days-'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const zdb = path.join(WD, 'z.db'), cdb = path.join(WD, 'c.db'), rec = path.join(WD, 'rec.json'), logf = path.join(WD, 'zone.log');
  for (const s of ['', '-wal']) { try { fs.copyFileSync(SRC + s, zdb + s); fs.chmodSync(zdb + s, 0o644); } catch (e) {} }
  const port = require('./lib-port').ports(20, 26100), SECRET = 't1471d-' + process.pid;
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZONE, CENTRAL_SECRET: SECRET, NODE_OPTIONS: '' }) });
  const lf = fs.openSync(logf, 'w'); const t0 = Date.now();
  const z = spawn(process.execPath, ['--max-old-space-size=3000', '-r', path.join(__dirname, 't745-vclock.js'), '-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', lf, lf],
    env: Object.assign({}, process.env, { T1471_DAYS_CHILD: rec, T1471_DAYS_N: String(DAYS), T1471_DAYS_VIL: NAME, PORT: String(port + 10), ZONE_ID: ZONE, DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(port), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', NODE_OPTIONS: '', T1471_LAND_FIT: ON, VILLAGE_DAY_MS: '250', T640_BOOT_SLICE: '0', T941_BATTLE_DAY: '1', T1013_BAND_DAY: '1', T990_ECON_DAY: '1', T696_WAL: '0' }) });
  let exit = null; z.on('exit', (code, sig) => { exit = { code, sig }; });
  while (!exit && Date.now() - t0 < 3 * 3600 * 1000) await sleep(2000);
  try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} await sleep(500);
  let R = {}; try { R = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch (e) {}
  const tail = fs.readFileSync(logf, 'utf8').split('\n').filter((l) => /FATAL|Error|T1471/.test(l)).slice(0, 30);
  fs.writeFileSync(OUT, JSON.stringify({ src: SRC, zone: ZONE, on: ON, days: +DAYS, vil: NAME, exit, sec: Math.round((Date.now() - t0) / 1000), R, tail }, null, 1));
  const D = R.days || [];
  console.log(`[T1471 날 판] ${ZONE} 켬=${ON} · ${D.length}날 · ${Math.round((Date.now() - t0) / 1000)}초 · 끝 ${JSON.stringify(D[D.length - 1] || null)}`);
  for (const f of fs.readdirSync(WD)) { try { fs.unlinkSync(path.join(WD, f)); } catch (e) {} } try { fs.rmdirSync(WD); } catch (e) {}
  process.exit(0);
})();
