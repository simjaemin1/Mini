#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T728 ⑥ 계측기 · 제품 무변)
// === scripts/t728-jump.js — "날 = 시계에서 계산": 멈춤 N 분 뒤 다시 뜨면 econ 날이 지금 시각의 날로 뛰나 ===================
//   node scripts/t728-jump.js [--n 10,60,600] [--wait 600]
//   ① 빠른 시계(250 ms)로 30 날 세계를 만든다(손잡이 켬 · 30 날 경계에서 얼림 → 드레인 → SIGTERM = 경계 종료 저장) — 길 위 캐러밴이 있는 세계.
//   ② 메타 행의 앵커를 **실제 시계 단위**로 다시 찍는다(픽스처 — 하루 24분 · epoch 0 · "지금 이 순간 멈췄다"): g = 지금 벽시계 날.
//   ③ N 마다 DB 사본으로 실제 시계 존을 띄운다 — Date.now 에 N 분을 더해(멈춘 N 분 흉내) — 준비 순간 econ 날 · 벽시계 날 · 밀린 캐러밴 · 다음 날짜 경계.
//   ④ --wait 의 N 은 첫 econ 틱까지 기다려 밀린 캐러밴이 도착했나 본다(다음 경계가 1분쯤 뒤에 오도록 시계 흉내에 δ 를 더한다 — 보고에 적는다).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const NS = String(opt('n', '10,60,600')).split(',').map(Number);
const WAIT = +opt('wait', '600');
const DIR = '/tmp/t728/jump'; fs.mkdirSync(DIR, { recursive: true });
const DB0 = path.join(DIR, 'w0.db');
const DAY = 24 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function run(tag, env, pre) {
  return new Promise((resolve) => {
    const e = Object.assign({}, process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1', VILLAGE_NPC_CAP: '1', T400_BUILD_ACT: '0',
      T640_BOOT_SLICE: '0', T728_RESTART_KEEP: '1', PORT: String(39500 + Math.floor(Math.random() * 400)), NODE_OPTIONS: pre.map((p) => `--require ${p}`).join(' ') }, env);
    const ch = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(path.join(DIR, tag + '.log')); ch.stdout.pipe(lf); ch.stderr.pipe(lf);
    ch.on('exit', (code) => resolve(code));
  });
}
(async () => {
  // ① 30 날 세계
  const SKIP = args.includes('--skip-p1');
  if (!SKIP) for (const f of [DB0, DB0 + '-wal', DB0 + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  const c1 = SKIP ? 'skip' : await run('p1', { DB_PATH: DB0, VILLAGE_DAY_MS: '250', T722_STOP_DAY: '30', T722_DUMP: path.join(DIR, 'stop.json') }, [path.join(__dirname, 't722-stop-hook.js')]);
  console.log(`① 30 날 세계 — 끝 코드 ${c1}`);
  // ② 앵커를 실제 시계로 다시 찍는다
  const { DatabaseSync } = require('node:sqlite');
  const T0 = Date.now();
  { const db = new DatabaseSync(DB0); const row = db.prepare('SELECT data FROM world_meta WHERE zone = ?').get('hanbando');
    const M = JSON.parse(row.data); const D = M.anchor.day;
    M.anchor = { day: D, g: Math.floor(T0 / DAY), epoch: 0, dayMs: DAY, at: T0 };
    db.prepare('UPDATE world_meta SET data = ? WHERE zone = ?').run(JSON.stringify(M), 'hanbando'); db.close();
    console.log(`② 앵커 다시 찍음 — econ 날 ${D} ↔ 벽시계 날 ${Math.floor(T0 / DAY)} · 길 위 캐러밴 ${M.caravans.length}`); }
  const rows = [];
  for (const N of NS) {
    const db = path.join(DIR, `w-${N}.db`);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(DB0 + s, db + s); } catch (e) { try { fs.unlinkSync(db + s); } catch (x) {} } }
    let off = N * 60000, delta = 0;
    const waitTicks = N === WAIT ? 1 : 0;
    if (waitTicks) {   // 다음 경계가 부팅(≈90초) 뒤 1분쯤에 오도록 δ — 실효 멈춤 = N 분 + δ
      const est = Date.now() + 150000 + off; delta = (DAY - (est % DAY)) % DAY; off += delta;
    }
    const out = path.join(DIR, `jump-${N}.json`); try { fs.unlinkSync(out); } catch (e) {}
    const tBoot = Date.now();
    const code = await run(`p2-${N}`, { DB_PATH: db, T728_JUMP_OFF_MS: String(off), T728_JUMP_OUT: out, T728_JUMP_DAYS: String(waitTicks) }, [path.join(__dirname, 't728-jump-hook.js')]);
    const R = JSON.parse(fs.readFileSync(out, 'utf8'));
    const gap = (R.ready.at - T0) / 60000;   // 흉내 시계로 멈춘 뒤 흐른 실분(부팅 포함)
    const r = R.ready, rs = r.restored || {};
    const expect = Math.floor(R.ready.at / DAY) - Math.floor(T0 / DAY);
    const calOk = r.calNext && r.calNext.calendarNext.day === r.econDay + 1 && (r.calNext.calendarAt % DAY) === 0 && r.calNext.calendarAt > r.at && r.calNext.calendarAt - r.at <= DAY;
    const offset = r.econDay - r.wallDay;
    rows.push({ N, delta: Math.round(delta / 60000), gap: +gap.toFixed(1), jump: rs.jump | 0, expect, econDay: r.econDay, wallDay: r.wallDay, offset, overdue: r.overdue, caravans: r.caravans, calOk, ticks: R.ticks, code, bootS: ((Date.now() - tBoot) / 1000) | 0 });
    console.log(`③ N=${N}${delta ? `(+δ ${Math.round(delta / 60000)}분)` : ''} — 멈춘 뒤 ${gap.toFixed(1)}분 · 날 뜀 ${rs.jump | 0}(벽시계 날 차 ${expect}) · econ 날 ${r.econDay} · 벽시계 날 − econ 날 = ${-offset} · 밀린 캐러밴 ${r.overdue}/${r.caravans}(갈 길 ${r.overOut} · 올 길 ${r.overIn}) · 다음 날짜 경계 ${calOk ? '○' : '✗'}`);
    for (const t of R.ticks) console.log(`   econ 틱 — econ 날 ${t.econDay}(벽시계 날 ${t.wallDay}) · 남은 밀린 캐러밴 ${t.overdue}/${t.caravans}(갈 길 ${t.overOut} · 올 길 ${t.overIn}) · 그날 교역 기록 ${t.tradeToday}`);
  }
  const off0 = rows.map((r) => r.offset);
  console.log(`\n벽시계 날 − econ 날(모든 N 에서 같아야 = 날이 시계에서 계산된다): ${off0.map((x) => -x).join(' · ')} → ${new Set(off0).size === 1 ? '같음 ○' : '다름 ✗'}`);
  fs.writeFileSync(path.join(DIR, 'jump.json'), JSON.stringify(rows, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
