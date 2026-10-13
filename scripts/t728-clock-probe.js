#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T728 계측기 · 제품 무변)
// === scripts/t728-clock-probe.js — 클라 시계 차 전후(같은 기계 · 망 대역 흉내) ==========================================
//   node scripts/t728-clock-probe.js <DB 사본> [--mbps 5] [--days 3]
//   손잡이(`T728_RESTART_KEEP`)는 부르는 쪽 env 그대로 존에 간다.
//   잰다(같은 기계라 참 차 = 0 — 클라가 잡은 차가 곧 오차):
//     · welcome 차 — `serverNow − (받은 순간 + 대역 흉내 지연)` (대역 흉내 = welcome 바이트 × 8 ÷ 대역 · 받은 뒤 그만큼 기다렸다 푼다)
//     · pong 차(켬) — 클라 식 그대로 `sn + 왕복/2 − 받은 순간` · 1초마다 · 20번
//     · 날짜 넘김 — `VILLAGE_DAY_MS` 짧은 날로 경계 셋: 마감 끝 방송이 경계(`calendarAt`)보다 몇 ms 늦나(종전 클라가 넘기던 때) ·
//       켬이면 클라가 경계 그 순간 넘긴다(오차 = 위 pong 차)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DB0 = args[0], MBPS = +opt('mbps', '5'), DAYS = +opt('days', '3');
const DIR = process.env.T728_PROBE_DIR || '/tmp/t728';
const DB = path.join(DIR, `clock-${process.pid}.db`);
fs.copyFileSync(DB0, DB); for (const s of ['-wal', '-shm']) { try { fs.copyFileSync(DB0 + s, DB + s); } catch (e) { try { fs.unlinkSync(DB + s); } catch (x) {} } }
const PORT = 39900 + (process.pid % 90);
const env = Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(PORT), DB_PATH: DB, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0', VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || '20000' });
const child = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
const lf = fs.createWriteStream(DB + '.log'); child.stdout.pipe(lf); child.stderr.pipe(lf);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const up = await FB.waitUp(child, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!up.ok) { console.log('존이 안 떴다', up.why); child.kill(); process.exit(1); }
  await sleep(3000);
  const ws = new WebSocket(`ws://localhost:${PORT}/?name=t728clock`);
  const R = { welcome: null, pong: [], flips: [] };
  let calAt = 0, calNextDay = null, offset = null;
  ws.on('message', async (raw) => {
    const tRecv = Date.now(); const s = raw.toString();
    if (!R.welcome && s.includes('"worldClock"')) {
      const bytes = Buffer.byteLength(s), txMs = bytes * 8 / (MBPS * 1e6) * 1000;
      await sleep(txMs);   // 대역 흉내 — 이만큼 늦게 다 받은 셈
      const m = JSON.parse(s); const t = Date.now();
      if (m.type !== 'welcome') return;
      offset = m.worldClock.serverNow - t;
      R.welcome = { bytes, txMs: Math.round(txMs), offsetMs: offset, sameMachineMs: tRecv - m.worldClock.serverNow, calendar: m.calendar && m.calendar.day, calendarNext: m.calendarNext ? m.calendarNext.day : null };
      if (m.calendarNext) { calAt = m.calendarAt; calNextDay = m.calendarNext.day; }
      return;
    }
    if (s.startsWith('{"type":"pong"')) {
      const m = JSON.parse(s); const t3 = Date.now();
      if (typeof m.sn === 'number') {   // 클라 식 그대로(`30-n-net.js` pong — 구간 겹치기 · 가운데)
        const a = m.sn - t3, b = a + (t3 - m.t);
        if (R._iv && Math.max(R._iv[0], a) <= Math.min(R._iv[1], b)) R._iv = [Math.max(R._iv[0], a), Math.min(R._iv[1], b)]; else R._iv = [a, b];
        offset = (R._iv[0] + R._iv[1]) / 2; R.pong.push({ rtt: t3 - m.t, offsetMs: +offset.toFixed(1), w: R._iv[1] - R._iv[0] });
      }
      return;
    }
    if (s.includes('"sim_village_day"')) {
      const m = JSON.parse(s);
      const f = { day: m.day, recvMs: tRecv };
      if (m.calendarAt) { f.nextAt = m.calendarAt; }
      if (calAt && calNextDay === m.day) f.lateMs = tRecv - calAt;   // 방송이 그 날 경계보다 몇 ms 늦게 왔나(종전 클라가 넘기던 때)
      R.flips.push(f);
      if (m.calendarNext) { calAt = m.calendarAt; calNextDay = m.calendarNext.day; }
    }
  });
  await new Promise((r) => ws.on('open', r));
  let n = 0;
  const iv = setInterval(() => { if (n++ < 20) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); }, 1000);
  const dayMs = +env.VILLAGE_DAY_MS;
  await sleep(Math.max(22000, dayMs * DAYS + 3000));
  clearInterval(iv);
  const late = R.flips.filter((f) => f.lateMs != null).map((f) => f.lateMs);
  console.log(JSON.stringify(R, null, 1).slice(0, 3000));
  const po = R.pong.map((p) => Math.abs(p.offsetMs));
  console.log(`\n=== 클라 시계(${process.env.T728_RESTART_KEEP === '1' ? '켬' : '끔'} · 대역 흉내 ${MBPS} Mbps) ===`);
  console.log(`welcome ${(R.welcome.bytes / 1024).toFixed(0)} KB · 전송 흉내 ${R.welcome.txMs} ms · 같은 기계 도장→받음 ${R.welcome.sameMachineMs} ms · welcome 으로 잡은 차 ${R.welcome.offsetMs} ms(게임 ${(Math.abs(R.welcome.offsetMs) / 1000 * 60).toFixed(0)} 초)`);
  console.log(po.length ? `pong 다시 재기 ${po.length}번 · |차| 최대 ${Math.max(...po).toFixed(1)} ms · 중앙 ${po.sort((a, b) => a - b)[po.length >> 1].toFixed(1)} ms(게임 ${(Math.max(...po) / 1000 * 60).toFixed(1)} 초 이내)` : 'pong 에 서버 시각 없음(끔) — 차는 welcome 값 그대로 남는다');
  console.log(late.length ? `날짜 방송이 경계보다 늦게 온 ms: ${late.join(' · ')}(종전 클라가 넘기던 때) — ${R.welcome.calendarNext != null ? '켬: 클라가 경계 순간에 넘긴다' : ''}` : `날짜 경계 표본 ${R.flips.length}개(경계 시각이 없어 늦음은 못 잼 — 끔)`);
  ws.close(); child.kill('SIGTERM'); await sleep(800); try { for (const f of [DB, DB + '-wal', DB + '-shm']) fs.unlinkSync(f); } catch (e) {}
  process.exit(0);
})();
