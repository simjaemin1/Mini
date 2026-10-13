#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T722 계측기 · 제품 무변)
// === scripts/t722-clock-probe.js — 클라 시계가 서버 시계와 얼마나 어긋나나(같은 기계 · 실제 시계 · 손님 하나) ==========
//   node scripts/t722-clock-probe.js <DB 사본>
//   잰다: welcome 바이트 · `worldClock.serverNow` 도장 → 클라가 메시지를 받은 순간 → JSON 을 다 푼 순간(같은 기계라 시계 차 0 — 차 = 그 길의 시간)
//         · 핑 20번(T486_PONG_SPLIT=1 로 띄워 `srvIn`/`srvOut` 이 실린다 — NTP 꼴 오프셋을 같이 셈) · 몇 초 뒤 위상 차.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const DB0 = process.argv[2];
const DB = '/tmp/t722/clock.db';
fs.copyFileSync(DB0, DB); for (const s of ['-wal', '-shm']) { try { fs.copyFileSync(DB0 + s, DB + s); } catch (e) { try { fs.unlinkSync(DB + s); } catch (x) {} } }
const PORT = 39900 + (process.pid % 90);
const env = Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(PORT), DB_PATH: DB, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  VILLAGE_NPC_CAP: '1', T486_PONG_SPLIT: '1', T640_BOOT_SLICE: '0' });
const child = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
const lf = fs.createWriteStream('/tmp/t722/clock.log'); child.stdout.pipe(lf); child.stderr.pipe(lf);
(async () => {
  const up = await FB.waitUp(child, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!up.ok) { console.log('존이 안 떴다', up.why); child.kill(); process.exit(1); }
  await new Promise((r) => setTimeout(r, 3000));
  const ws = new WebSocket(`ws://localhost:${PORT}/?name=t722clock`);
  const res = { pings: [] };
  ws.on('message', (raw, isBin) => {
    const tRecv = Date.now();
    const s = raw.toString();
    if (!res.welcome && s.includes('"worldClock"')) {
      const t0 = Date.now(); const m = JSON.parse(s); const tParsed = Date.now();
      if (m.type !== 'welcome') return;
      res.welcome = { bytes: Buffer.byteLength(s), serverNow: m.worldClock.serverNow, recvLag: tRecv - m.worldClock.serverNow, parseMs: tParsed - t0, offset: m.worldClock.serverNow - tParsed, dayLengthMs: m.worldClock.dayLengthMs };
      let i = 0; const iv = setInterval(() => { if (i++ >= 20) { clearInterval(iv); finish(); return; } ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); }, 150);
      return;
    }
    if (s.startsWith('{"type":"pong"')) { const m = JSON.parse(s); const t3 = Date.now(); res.pings.push({ rtt: t3 - m.t, srvIn: m.srvIn, srvOut: m.srvOut, t0: m.t, t3 }); }
  });
  function finish() {
    const W = res.welcome, P = res.pings;
    const ntp = P.filter((p) => p.srvIn != null).map((p) => ((p.srvIn - p.t0) + (p.srvOut - p.t3)) / 2);
    const rtt = P.map((p) => p.rtt).sort((a, b) => a - b);
    console.log(JSON.stringify({ welcome: W, rtt: { min: rtt[0], p50: rtt[rtt.length >> 1], max: rtt[rtt.length - 1] }, ntpOffset: ntp.length ? { min: Math.min(...ntp), max: Math.max(...ntp) } : null }, null, 1));
    const G = 60;   // 60× — 실 1초 = 게임 1분
    console.log(`welcome ${(W.bytes / 1024).toFixed(0)} KB · 도장→받음 ${W.recvLag} ms · 풀기 ${W.parseMs} ms ⇒ 클라 오프셋 오차(같은 기계) ${W.recvLag + W.parseMs} ms = 게임 ${((W.recvLag + W.parseMs) / 1000 * G).toFixed(1)} 초`);
    for (const mbps of [5, 20, 100]) { const tx = W.bytes * 8 / (mbps * 1e6) * 1000; console.log(`  망 ${mbps} Mbps 라면 전송만 ${tx.toFixed(0)} ms(+편도 지연) = 게임 ${(tx / 1000 * G).toFixed(0)} 초`); }
    ws.close(); child.kill('SIGTERM'); setTimeout(() => process.exit(0), 500);
  }
})();
