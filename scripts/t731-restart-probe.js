#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T731 계측기 · 제품 무변 · 판정 0)
// === scripts/t731-restart-probe.js — 현지 자정 정산(T731 켬) 위에서 T728 재기동: 창 가운데 내리기 · 다시 띄운 뒤 마을 날 ==========
//   node scripts/t731-restart-probe.js <DB 사본> [--day-ms 60000] [--out <json>]
//   존 하나(중앙 없음)를 `T731_LOCAL_MIDNIGHT=1 T731_WIT=1` 로 띄운다(나머지 env 는 부르는 쪽 그대로 · T728 은 기본 켬).
//     ① 창 둘이 닫힐 때까지 본다 → 다음 창의 동쪽 끝 자정 + 창 퍼짐의 ¼ 에 SIGTERM(창 가운데 — 동쪽 몇 곳만 정산한 때).
//        내릴 때 그 창이 마저 닫히나(남은 마을을 몰아 닫는다) · 종료 저장의 econ 날 · 기다린 ms.
//     ② 같은 DB 로 다시 띄운다 → 부팅 줄(시계에서 바로 낸 마을 날 · 다음 창 동 → 서 자정 시각) · T728 메타 되돌림 날 ·
//        다음 창이 econ 날 + 1 로 51곳을 동 → 서로 닫나.
//   DB 는 사본을 쓴다(원본 무접촉 · 판이 끝나면 사본을 지운다).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DB0 = args[0], DAYMS = +opt('day-ms', '60000'), OUT = opt('out', '');
if (!DB0 || !fs.existsSync(DB0)) { console.log('node scripts/t731-restart-probe.js <DB 사본> [--day-ms 60000]'); process.exit(2); }
const DIR = process.env.T731_PROBE_DIR || '/tmp/t731probe';
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, `rs-${process.pid}.db`);
const rmdb = () => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s); } catch (e) {} } };
rmdb(); fs.copyFileSync(DB0, DB); for (const s of ['-wal', '-shm']) { try { fs.copyFileSync(DB0 + s, DB + s); } catch (e) {} }
const PORT = 39800 + (process.pid % 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(PORT), DB_PATH: DB, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  VILLAGE_DAY_MS: String(DAYMS), T731_LOCAL_MIDNIGHT: '1', T731_WIT: '1' });

function boot(tag) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const lf = fs.createWriteStream(path.join(DIR, `rs-${process.pid}-${tag}.log`));
  const L = { lines: [], wins: [], boot: null, t728: null, ready: null, down: null };
  let buf = '';
  const on = (d) => { lf.write(d); buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, i); buf = buf.slice(i + 1);
    if (/\[T731\] 증인 /.test(ln)) { try { L.wins.push(Object.assign(JSON.parse(ln.slice(ln.indexOf('증인 ') + 3)), { seenAt: Date.now() })); } catch (e) {} }
    else if (/\[T731\] 현지 자정 정산 — 부팅/.test(ln)) L.boot = ln.slice(ln.indexOf('🕛'));
    else if (/\[T728\] 재기동 영속/.test(ln)) L.t728 = ln.slice(ln.indexOf('🏘️'));
    else if (/마을 시뮬 준비/.test(ln)) L.ready = ln.slice(ln.indexOf('🏘️'));
    else if (/\[T728\] 종료 저장/.test(ln)) L.down = ln.slice(ln.indexOf('🏘️')); } };
  child.stdout.on('data', on); child.stderr.on('data', on);
  return { child, L };
}
const waitFor = async (f, capMs) => { const t0 = Date.now(); while (Date.now() - t0 < capMs) { if (f()) return true; await sleep(200); } return false; };

(async () => {
  const R = { dayMs: DAYMS, a: {}, b: {} };
  // ── ① 첫 판: 창 둘 → 셋째 창 가운데 SIGTERM
  const A = boot('a');
  const upA = await FB.waitUp(A.child, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!upA.ok) { console.log('존이 안 떴다', upA.why); A.child.kill('SIGKILL'); process.exit(1); }
  R.a.boot = A.L.boot; R.a.ready = A.L.ready; R.a.t728 = A.L.t728;
  await waitFor(() => A.L.wins.length >= 2, DAYMS * 4 + 120000);
  const w2 = A.L.wins[A.L.wins.length - 1];
  //   다음 창 동쪽 끝 자정 = 이 창 동쪽 자정 + 하루(증인 `east` 의 시각은 시각만 — 날짜는 닫힌 순간의 날짜를 쓴다)
  const dueOf = (w) => { const d = new Date(w.seenAt), [hh, mm, ss] = w.east[1].split(':'); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hh, +mm, +ss); return t > w.seenAt + 3600000 ? t - 86400000 : t; };
  const eastNext = dueOf(w2) + DAYMS, spreadMs = w2.dueSpanS * 1000;
  const killAt = eastNext + Math.max(300, spreadMs / 4);
  R.a.wins = A.L.wins.map((w) => ({ D: w.D, econDay: w.econDay, n: w.n, opens: w.opens, dueSpanS: w.dueSpanS, spanS: w.spanS, lateMs: w.lateMs, orderBad: w.orderBad, east: w.east, west: w.west }));
  await sleep(Math.max(0, killAt - Date.now()));
  const nWinBefore = A.L.wins.length;
  R.a.sigterm = { at: new Date(Date.now()).toISOString().slice(11, 23), afterEastMs: Date.now() - eastNext, spreadMs };
  A.child.kill('SIGTERM');
  await new Promise((r) => A.child.on('exit', r));
  R.a.down = A.L.down;
  R.a.flushWin = A.L.wins.length > nWinBefore ? (({ D, econDay, n, opens, wit }) => ({ D, econDay, n, opens, witHead: wit.slice(0, 3), witTail: wit.slice(-2) }))(A.L.wins[A.L.wins.length - 1]) : null;
  // ── ② 다시 띄운다: 부팅 줄 · 메타 되돌림 · 다음 창
  await sleep(2000);
  const B = boot('b');
  const upB = await FB.waitUp(B.child, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!upB.ok) { console.log('다시 띄운 존이 안 떴다', upB.why); B.child.kill('SIGKILL'); process.exit(1); }
  R.b.boot = B.L.boot; R.b.ready = B.L.ready; R.b.t728 = B.L.t728;
  await waitFor(() => B.L.wins.length >= 1, DAYMS * 2 + 60000);
  R.b.wins = B.L.wins.map((w) => ({ D: w.D, econDay: w.econDay, n: w.n, opens: w.opens, dueSpanS: w.dueSpanS, lateMs: w.lateMs, orderBad: w.orderBad, east: w.east, west: w.west }));
  B.child.kill('SIGKILL');
  await sleep(500); rmdb();
  console.log(JSON.stringify(R, null, 1));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
  process.exit(0);
})();
