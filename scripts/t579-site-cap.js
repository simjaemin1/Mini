#!/usr/bin/env node
// === scripts/t579-site-cap.js — 새 세계 실서버 판: 영토 상한이 집터를 막나 [T579 ② · 2026-10-03] ======================
//
// ★묻는 것: 새 세계(손님 0)를 N일 돌리면 집터 탐색이 몇 번 **빈손**이고 그중 몇 번이 **상한 탓**(영토가 상한에 묶인 채 빈손)인가 ·
//   거부 사유(후보 셀 단위 · `_lifeSiteFilters` 의 그 문자열)는 무엇인가 · 집 수 · 영토 셀 · 마을당 영토/인구.
//   끔(`T579_CAP_HOUSE=0` · 인당 12) / 켬(인당 12 + 집 부지 20.67) 두 판을 같은 문법으로.
// ★재기만 한다 — 수는 전부 존 `/perf`(`probe` 누계) · `/lifedbg`(마을별) 가 낸 값이다(T562 자 문법 · 관측자 0).
//   하루 = `VILLAGE_DAY_MS`(테스트 전용 손잡이). 새 DB(시딩부터) · 원본 무접촉.
// ★제품 코드 0 · 러너 밖. 실행: node scripts/t579-site-cap.js [--days 300] [--day-ms 1500] [--env K=V] [--out f.json] [--cport] [--zport]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DAYS = +val('--days', '300'), DAYMS = val('--day-ms', '1500');
const CPORT = +val('--cport', '3738'), ZPORT = +val('--zport', '3748');
const OUT = val('--out', '/tmp/t579-site-cap.json');
const BIN = +val('--bin', '25');
const ZENV = {};
argv.forEach((a, i) => { if (a === '--env' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); ZENV[k] = v.join('='); } });
const ZDB = `/tmp/t579-zone-${process.pid}.db`, CDB = `/tmp/t579-central-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, ['--max-old-space-size=1500', path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
const clean = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
process.on('exit', clean);
const jget = async (u) => { try { return await (await fetch(u, { signal: AbortSignal.timeout(60000) })).json(); } catch (e) { return null; } };

(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const t0 = Date.now();
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_DAY_MS: DAYMS, ENABLE_WILDLIFE: '0', ...ZENV });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 900000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  console.log(`up ${((Date.now() - t0) / 1000).toFixed(0)}초 · 손잡이 ${JSON.stringify(ZENV)}`);
  const pick = (pr) => ({ call: pr.siteCall, hit: pr.siteHit, missCap: pr.siteMissCap || 0, missFree: pr.siteMissFree || 0, reason: { ...(pr.siteReason || {}) }, grow: pr.terrGrowCells || 0 });
  const snapVil = async () => { const L = await jget(`http://localhost:${ZPORT}/lifedbg`); if (!L || !L.villages) return null;
    return L.villages.map((v) => ({ name: v.name, pop: v.econPop, terr: v.terr, houses: v.houses, cap: v.terrCap, capBound: v.capBound })); };
  let day0 = null, lastDay = null; const bins = []; let prev = null, binStart = null;
  const snaps = {};
  const tEnd = Date.now() + (DAYS + 5) * (+DAYMS) * 6 + 600000;   // 표의 상한(판정 아님)
  while (Date.now() < tEnd) {
    await sleep(Math.min(1000, +DAYMS / 2));
    const p = await jget(`http://localhost:${ZPORT}/perf`);
    const L = p && p.econTick && p.econTick.last; const PR = L && p.econTick.probe; if (!L || L.day == null || !PR) continue;
    if (day0 == null) { day0 = L.day; prev = pick(PR); binStart = 0; console.log(`  첫 하루 ${day0}`); continue; }
    if (L.day === lastDay) continue; lastDay = L.day;
    const d = L.day - day0;
    if (d - binStart >= BIN || d >= DAYS) {
      const cur = pick(PR), rs = {};
      for (const k of new Set([...Object.keys(cur.reason), ...Object.keys(prev.reason)])) { const v = (cur.reason[k] || 0) - (prev.reason[k] || 0); if (v) rs[k] = v; }
      const vs = await snapVil();
      const row = { from: binStart, to: d, call: cur.call - prev.call, hit: cur.hit - prev.hit, missCap: cur.missCap - prev.missCap, missFree: cur.missFree - prev.missFree, grow: cur.grow - prev.grow, reason: rs,
        houses: vs ? vs.reduce((s, v) => s + v.houses, 0) : null, terr: vs ? vs.reduce((s, v) => s + v.terr, 0) : null, pop: vs ? vs.reduce((s, v) => s + (v.pop || 0), 0) : null,
        capBound: vs ? vs.filter((v) => v.capBound).length : null, vils: vs ? vs.length : null };
      bins.push(row); snaps[d] = vs; prev = cur; binStart = d;
      console.log(`  ${row.from}~${row.to}일: 탐색 ${row.call} · 찾음 ${row.hit} · 빈손 상한 ${row.missCap} / 그 밖 ${row.missFree} · 영토 +${row.grow} · 집 ${row.houses} · 영토 ${row.terr} · 인구 ${row.pop} · 상한에 묶인 마을 ${row.capBound}/${row.vils} · 사유 ${JSON.stringify(rs)}`);
      if (d >= DAYS) break;
    }
  }
  const last = snaps[Math.max(...Object.keys(snaps).map(Number))] || [];
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), dayMs: +DAYMS, env: ZENV, day0, days: DAYS, bins, last }, null, 1));
  console.log('→', OUT);
  process.exit(0);
})();
