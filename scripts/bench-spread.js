#!/usr/bin/env node
// === scripts/bench-spread.js ===
// 시나리오 D — "존을 몇 개 깨우면 얼마인가". 봇을 **존마다 하나씩** 흩뿌린다.
//   idle skip(zone.js:8302~8314)은 "사람 0 + observer 0 이면 tick 본문을 건너뛴다"이다.
//   그러니 그 값을 재는 유일한 정직한 방법은 **깨어난 존 수를 바꿔 가며 CPU 를 재는 것**이다
//   (서버 코드를 고쳐 skip 을 끄고 A/B 하는 건 측정 배치 규칙상 금지 — 그래서 밖에서 잰다).
//
// 사용: N=8 DURATION=60 node scripts/bench-spread.js
//        N=0 이면 아무도 안 붙는다(대조군을 같은 스크립트로 재기 위해).
'use strict';
const WebSocket = require('ws');
const http = require('http');
const CENTRAL = process.env.CENTRAL_URL || 'http://127.0.0.1:3010';
const N = parseInt(process.env.N || '8', 10);
const DUR = parseInt(process.env.DURATION || '60', 10);
const INPUT_HZ = parseInt(process.env.INPUT_HZ || '30', 10);
const SKIP_OCEAN = process.env.SKIP_OCEAN !== '0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const zones = await new Promise((res, rej) => {
    http.get(CENTRAL + '/zones', (m) => { let b = ''; m.on('data', (c) => b += c);
      m.on('end', () => { try { res(JSON.parse(b).zones); } catch (e) { rej(e); } }); }).on('error', rej);
  });
  let ids = Object.keys(zones);
  if (SKIP_OCEAN) ids = ids.filter((i) => !zones[i].isOcean);   // 바다 존은 통행 불가라 대표성이 없다
  // ★PICK 으로 존을 직접 고를 수 있다. 기본 순서의 첫 존(canadia)은 **대표성이 없다** —
  //   zone.js:9466/9468 이 canadia 에만 거는 전용 타이머(영토 동기·농지 단계)가 있어 혼자 비싸다.
  const pick = process.env.PICK ? process.env.PICK.split(',').map((x) => x.trim()).filter((x) => zones[x])
                                : ids.slice(0, N);
  console.log(`존 ${Object.keys(zones).length}개 중 ${pick.length}곳을 깨운다: ${pick.join(', ') || '(없음)'}`);

  const socks = [];
  let ticks = 0, welcomes = 0, fails = 0;
  for (const id of pick) {
    const ws = new WebSocket(`${zones[id].wsUrl}/?username=&name=spread_${id}&color=%23a0a0a0`);
    ws.on('error', () => { fails++; });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') welcomes++; else if (m.type === 'tick') ticks++; });
    ws.on('open', () => {
      ws._t = setInterval(() => { const a = Math.random() * Math.PI * 2;
        try { ws.send(JSON.stringify({ type: 'input', vx: Math.cos(a), vy: Math.sin(a) })); } catch (e) {} },
        1000 / INPUT_HZ);
    });
    socks.push(ws);
    await sleep(120);
  }
  await sleep(3000);
  console.log(`접속 ${welcomes}/${pick.length} (실패 ${fails}) — ${DUR}초 유지`);
  await sleep(DUR * 1000);
  console.log(`받은 tick ${ticks} (깨운 존 ${pick.length}곳 · ${DUR}초 → 존당 초당 ${(ticks / Math.max(1, pick.length) / DUR).toFixed(1)})`);
  for (const ws of socks) { try { clearInterval(ws._t); ws.close(); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error('실패:', e && e.message); process.exit(1); });
