#!/usr/bin/env node
// === scripts/probe-edge.js ===
// 존 경계 근처에 **육지가 있는가**를 서버에게 직접 물어본다.
//   방법: 이미 있는 `teleport_debug` 한 개만 쓴다(서버 무수정). 서버는 notice 로만 답한다 —
//         '🌀 텔레포트 →' = 그 자리는 통행 가능,  '🌊 강·바다 위로는' = 막힘.
//   왜 필요한가: 시나리오 C(핸드오프)는 봇이 경계를 **걸어서** 넘어야 하는데,
//   경계가 통째로 바다면 한 발짝도 못 넘는다. 넘을 수 있는 위도를 먼저 찾아야 한다.
//
// 사용: WS=ws://127.0.0.1:3020 X=69616 Y0=1000 Y1=129000 STEP=2048 node scripts/probe-edge.js
'use strict';
const WebSocket = require('ws');
const WS   = process.env.WS   || 'ws://127.0.0.1:3020';
const X    = parseInt(process.env.X    || '69616', 10);
const Y0   = parseInt(process.env.Y0   || '1000', 10);
const Y1   = parseInt(process.env.Y1   || '129000', 10);
const STEP = parseInt(process.env.STEP || '2048', 10);
const GAP  = parseInt(process.env.GAP  || '60', 10);   // ms — 한 번에 몰아 보내면 어느 응답인지 못 짝짓는다

(async () => {
  const ws = new WebSocket(`${WS}/?username=&name=probe&color=%23ffffff`);
  const ys = []; for (let y = Y0; y <= Y1; y += STEP) ys.push(y);
  const land = [], water = [];
  let idx = -1;                        // 응답은 보낸 순서대로 온다(단일 ws·단일 스레드)
  await new Promise((res, rej) => {
    ws.on('error', rej);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type !== 'notice') return;
      const t = String(m.text || '');
      if (t.indexOf('🌀') !== 0 && t.indexOf('🌊') !== 0) return;
      const y = ys[idx];
      if (y === undefined) return;
      (t.indexOf('🌀') === 0 ? land : water).push(y);
    });
    ws.on('open', async () => {
      await new Promise((r) => setTimeout(r, 800));   // welcome 이 다 오길 기다린다
      for (let i = 0; i < ys.length; i++) {
        idx = i;
        ws.send(JSON.stringify({ type: 'teleport_debug', x: X, y: ys[i] }));
        await new Promise((r) => setTimeout(r, GAP));
      }
      await new Promise((r) => setTimeout(r, 600));
      res();
    });
  });
  try { ws.close(); } catch (e) {}
  console.log(`x=${X}  표본 ${ys.length}  (y ${Y0}~${Y1} step ${STEP})`);
  console.log(`  육지 ${land.length}곳${land.length ? ' — y=' + land.slice(0, 20).join(',') + (land.length > 20 ? ' …' : '') : ''}`);
  console.log(`  막힘 ${water.length}곳`);
  console.log(`  응답 ${land.length + water.length}/${ys.length}`);
  process.exit(0);
})();
