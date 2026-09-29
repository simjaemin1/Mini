#!/usr/bin/env node
// === scripts/t512-mover.js — 경계 옆을 오가는 몸 하나(T512 · 러너 밖) ==========================================
//   손님 하나로 한반도에 붙어, 동쪽 경계(닛폰) 안쪽 띠(선에서 80~420px · 유령 띠 1,200px 안)를 **동서로 오간다** — 걷기 N초 → 달리기 N초.
//   방향은 서버 권위 자리(틱의 내 몸)로 뒤집는다(선을 안 넘는다 = 핸드오프 0). 줄 = e2e-zone-cross 동쪽 길(y 111,413 · 막힘 없음 · T428).
//   node scripts/t512-mover.js <central http> <걷기 s> <달리기 s>
'use strict';
const path = require('path');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const HB = ZONES.hanbando;
const [CBASE = 'http://127.0.0.1:3010', WALK_S = '40', RUN_S = '40'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const z = (await (await fetch(`${CBASE}/zones`, { signal: AbortSignal.timeout(5000) })).json()).zones.hanbando;
  const ws = new WebSocket(`${z.wsUrl}/?username=&name=mover&color=%23ffffff`);
  let pid = null, me = null, seq = 0;
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'welcome' && !pid) pid = m.pid;
    if (m.type === 'tick' && pid) for (const p of m.players || []) if (p.pid === pid) me = { x: p.x, y: p.y };
    if (m.type === 'handoff') console.log('⚠ handoff — 선을 넘었다(자 실패)'); });
  for (let i = 0; i < 100 && !pid; i++) await sleep(100);
  const ly = 111413 - (HB.worldOffsetY || 0), X0 = HB.zoneWidth - 420, X1 = HB.zoneWidth - 80;
  for (let i = 0; i < 10; i++) { ws.send(JSON.stringify({ type: 'teleport_debug', x: HB.zoneWidth - 250, y: ly })); await sleep(300); }
  await sleep(1500);
  let dir = 1;
  const phase = async (sec, sprint) => {
    const t1 = Date.now() + sec * 1000;
    while (Date.now() < t1) {
      if (me) { if (me.x >= X1) dir = -1; else if (me.x <= X0) dir = 1; }
      ws.send(JSON.stringify({ type: 'input', seq: ++seq, vx: dir, vy: 0, sprint }));
      await sleep(33);
    }
  };
  console.log(`mover ${pid} · 걷기 ${WALK_S}s`); await phase(+WALK_S, false);
  console.log(`mover · 달리기 ${RUN_S}s`); await phase(+RUN_S, true);
  for (let i = 0; i < 20; i++) { ws.send(JSON.stringify({ type: 'input', seq: ++seq, vx: 0, vy: 0, sprint: false })); await sleep(33); }
  console.log(`mover 끝 · 마지막 자리 ${me ? me.x.toFixed(0) + ',' + me.y.toFixed(0) : '-'}`);
  ws.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
