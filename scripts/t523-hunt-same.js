#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T523 ② 결과 동일 게이트)
// =============================================================================
// T523 ② — **생활층 쉼표(`T523_LIFE_SLICE=1`)가 사냥 장부를 바꾸나.** `test-tick-slicer ⑩` 은 econ 행(곳간·인구)만 본다 —
//   사냥꾼 하루 정산(`huntHunters`)의 결과는 econ 밖(마을의 사냥터 `_gameRich` · 사냥꾼 몸의 `_huntWk`·`_huntBud`·`_workSite`)에 산다.
//   ⇒ 같은 씨앗 스냅샷에서 끔 · 켬 두 판을 띄워 **날마다 마감이 끝난 순간** 그 칸들의 지문(sha256)을 마을마다 적고 짝으로 견준다.
//   존 안의 상태는 preload 가 읽는다(`t491-probe` 문법 — `server/villages.js` 가 실릴 때 끝에 한 줄을 붙여 `state` 를 내준다 · 제품 0).
//
// 쓰는 법: node scripts/t523-hunt-same.js [out.json]      env: T523_DAYS(6) · T523_DAY_MS(5000) · T523_FROM / T523_FROM_C(씨앗 DB · 기본 slicer-seed)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

if (process.env.T523_HUNT_CHILD) {
  // ── 존 안(preload) — 마감이 끝날 때마다 지문을 파일에 한 줄
  const Module = require('module');
  const VJS = path.join('server', 'villages.js');
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VJS)) content += '\n;globalThis.__t523 = { state };\n';
    return _c.call(this, content, filename);
  };
  const OUT = process.env.T523_HUNT_CHILD;
  let lastDay = null;
  setInterval(() => {
    try {
      const F = globalThis.__t523; const st = F && F.state; if (!st || !st.world || st.tickJobs) return;   // 마감 중이면 기다린다
      const d = st.world.day; if (d === lastDay) return; lastDay = d;
      const pl = st.deps && st.deps.players; const rows = {};
      for (const v of st.villages || []) {
        const h = crypto.createHash('sha256');
        if (v._gameRich) for (const [k, g] of v._gameRich) h.update(k + '=' + g + ';');
        const hs = [];
        for (const pid of v.npcPids || []) { const p = pl && pl.get(pid); if (!p || p.simJob !== 'hunter') continue;
          hs.push([pid, p._huntWk ? p._huntWk.cx + ',' + p._huntWk.cy : '-', p._huntBud || 0, p._huntKil || 0, p._workSite ? Math.round(p._workSite.x) + ',' + Math.round(p._workSite.y) : '-']); }
        h.update(JSON.stringify(hs));
        rows[v.name] = { h: h.digest('hex').slice(0, 16), hunters: hs.length, cells: v._gameRich ? v._gameRich.size : 0, game: v.econ && v.econ.land ? v.econ.land.game : null };
      }
      fs.appendFileSync(OUT, JSON.stringify({ day: d, rows }) + '\n');
    } catch (e) { /* 계측기 — 존을 안 멈춘다 */ }
  }, 200).unref();
  return;
}

const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t523/hunt-same.json';
const DAYS = parseInt(process.env.T523_DAYS || '6', 10), DAY_MS = parseInt(process.env.T523_DAY_MS || '5000', 10);
const FROM = process.env.T523_FROM || '/tmp/slicer-seed-zone.db', FROM_C = process.env.T523_FROM_C || '/tmp/slicer-seed-central.db';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cp = (a, b) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(b + s); } catch (e) {} try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
const rm = (b) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(b + s); } catch (e) {} } };

async function arm(tag, on, port) {
  const TMP = path.dirname(OUT); fs.mkdirSync(TMP, { recursive: true });
  const zdb = `${TMP}/hs-${tag}-z.db`, cdb = `${TMP}/hs-${tag}-c.db`, rec = `${TMP}/hs-${tag}.jsonl`, SECRET = 't523h-' + tag;
  cp(FROM, zdb); cp(FROM_C, cdb); try { fs.unlinkSync(rec); } catch (e) {}
  const env = Object.assign({}, process.env, { T523_LIFE_SLICE: on ? '1' : '0' });
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, env, { PORT: String(port), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, ['-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, env, { T523_HUNT_CHILD: rec, PORT: String(port + 10), ZONE_ID: 'hanbando', DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(port), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), VILLAGE_WAR_LOG: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_ROUTE_WARM: '0' }) });
  try {
    for (let i = 0; i < 900; i++) { try { if ((await fetch(`http://localhost:${port + 10}/health`)).ok) break; } catch (e) {} await sleep(1000); }
    const t0 = Date.now();
    for (;;) { await sleep(1000); let n = 0; try { n = fs.readFileSync(rec, 'utf8').trim().split('\n').filter(Boolean).length; } catch (e) {} if (n > DAYS || Date.now() - t0 > (DAYS + 4) * DAY_MS + 120000) break; }
  } finally { try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(1000); rm(zdb); rm(cdb); }
  const byDay = new Map(); for (const l of fs.readFileSync(rec, 'utf8').trim().split('\n').filter(Boolean)) { const o = JSON.parse(l); byDay.set(o.day, o.rows); }
  return byDay;
}

(async () => {
  //   ★A/A(끔 두 판)가 이 층의 잡음 바닥이다 — 같은 설정 두 판이 갈리면 켬의 다름은 그만큼 에누리한다(test-tick-slicer ⑧ 문법).
  const off = await arm('off', false, 4700), off2 = await arm('off2', false, 4740), on = await arm('on', true, 4720);
  const cmp = (A, Bm) => { let same = 0, diff = 0, hunters = 0; const days = [], diffs = [];
    for (const [d, ro] of A) { const rn = Bm.get(d); if (!rn) continue; let s = 0, df = 0;
      for (const v in ro) { if (!rn[v]) continue; hunters += ro[v].hunters; if (ro[v].h === rn[v].h) s++; else { df++; if (diffs.length < 10) diffs.push({ day: d, v, a: ro[v], b: rn[v] }); } }
      same += s; diff += df; days.push({ day: d, same: s, diff: df }); }
    return { same, diff, hunters, days, diffs }; };
  const res = { DAYS, DAY_MS, AA: cmp(off, off2), AB: cmp(off, on) };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  const line = (x) => `동일 ${x.same} · 다름 ${x.diff} · 날 ${x.days.map((y) => `${y.day}:${y.same}/${y.same + y.diff}`).join(' ')} · 사냥꾼 표본 ${x.hunters}`;
  console.log(`[T523 ②] 사냥 장부 지문(마을 · 날)\n  A/A 끔 ↔ 끔  ${line(res.AA)}\n  A/B 끔 ↔ 켬  ${line(res.AB)}`);
  process.exit(0);
})();
