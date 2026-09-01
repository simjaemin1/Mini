#!/usr/bin/env node
// === scripts/probe-handoff-tools.js ===
// 시나리오 C 에서 나온 관측 하나를 끝까지 따라간다:
//   "존을 넘으면 도구 인스턴스(toolItems)가 사라진다" — 이게 **전송 누락**인가, **계정에서도 소실**인가.
//
//   ① hanbando 접속(게스트) → __e2e_give 로 도끼·곡괭이 지급 → toolItems 기록 · guestToken 확보
//   ② 경계까지 텔레포트 → 동쪽으로 걸어 핸드오프 → nippon 도착 welcome 의 toolItems 기록
//   ③ 끊고, **같은 게스트 토큰**으로 hanbando 에 새로 접속 → toolItems 기록
//        ③에 도구가 있으면 = 핸드오프 페이로드만 빠뜨린 것(계정엔 남음)
//        ③에도 없으면   = 도착 존의 savePlayer 가 빈 몸으로 계정을 덮은 것(영구 소실)
//
// 사용: bash scripts/bench-2zone.sh start && node scripts/probe-handoff-tools.js
'use strict';
const WebSocket = require('ws');
const http = require('http');
const CENTRAL = process.env.CENTRAL_URL || 'http://127.0.0.1:3010';
const EDGE_PAD = parseInt(process.env.EDGE_PAD || '400', 10);
const LAT_STEP = 2048;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toolsOf = (a) => (a || []).map((t) => `${t.type}/${t.d}`).sort().join('+') || '(없음)';
const invOf = (o) => Object.keys(o || {}).sort().map((k) => `${k}:${o[k]}`).join(',') || '(빈)';
const ledOf = (l) => { if (!l) return '(없음)';
  const out = []; for (const k of Object.keys(l).sort()) {
    const v = l[k]; const arr = Array.isArray(v) ? v : (v && v.items) || [];
    out.push(`${k}[${arr.map((e) => (e && e.kg !== undefined ? e.kg : e)).join('·') || '-'}]`); }
  return out.join(' ') || '(빈)'; };

function getZones() {
  return new Promise((res, rej) => {
    http.get(CENTRAL + '/zones', (m) => { let b = ''; m.on('data', (c) => b += c);
      m.on('end', () => { try { res(JSON.parse(b).zones); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

// 한 소켓을 열고, welcome 을 받고, 주어진 일을 하고 닫는다.
function open(url, onMsg) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const st = { ws, welcome: null, tools: null, inv: null };
    ws.on('error', rej);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') { st.welcome = m; st.tools = m.toolItems; st.inv = m.inventory; res(st); }
      if (m.type === 'tools') st.tools = m.toolItems;
      if (m.type === 'inventory') { st.inv = m.inventory; st.ledger = m.ledger; st.lots = m.lots; }
      if (onMsg) onMsg(m, st);
    });
  });
}

(async () => {
  const Z = await getZones();
  const han = Z.hanbando, nip = Z.nippon;
  console.log(`존: hanbando ${han.wsUrl} (${han.zoneWidth}×${han.zoneHeight}) · nippon ${nip.wsUrl}`);

  // ── ① 지급 ────────────────────────────────────────────────
  let handoffMsg = null;
  const a = await open(`${han.wsUrl}/?username=&name=probeT&color=%23ffffff`,
                       (m) => { if (m.type === 'handoff') handoffMsg = m; });
  const guestToken = a.welcome.guestToken;
  //  kgs = 개체별 무게 원장(Carry). 물고기 셋을 서로 다른 무게로 준다 — 넘어간 뒤에도
  //  "3마리 2.0·0.4·1.1kg" 이 그대로면 원장이 따라온 것이고, 마릿수만 남으면 무게가 증발한 것이다.
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3, thatch: 7 }, tools: ['axe', 'pickaxe'],
                             kgs: { fish: [2.0, 0.4, 1.1] }, quiet: true }));
  await sleep(700);
  console.log(`① 출발(hanbando)   inv=${invOf(a.inv)}  도구=${toolsOf(a.tools)}`);
  console.log(`                   kg원장=${ledOf(a.ledger)}   게스트토큰=${guestToken ? '있음' : '없음'}`);

  // ── ② 경계로 가서 넘는다 ─────────────────────────────────
  let placed = false, lane = 3;
  a.ws.on('message', () => {});
  const waitNotice = () => new Promise((r) => {
    const h = (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'notice' && (String(m.text).startsWith('🌀') || String(m.text).startsWith('🌊'))) {
        a.ws.off('message', h); r(String(m.text).startsWith('🌀')); } };
    a.ws.on('message', h);
  });
  //  ★한 위도에서 되면 끝, 안 되면 다음 위도. 경계 근처가 육지여도 그 **동쪽 몇백 px 이 바다**면
  //    못 넘는다 — 그러니 "찍히는 자리"가 아니라 "실제로 넘어지는 자리"를 찾아야 한다(족보 73).
  const walk = setInterval(() => { try { a.ws.send(JSON.stringify({ type: 'input', vx: 1, vy: 0 })); } catch (e) {} }, 33);
  for (let i = 0; i < 60 && !handoffMsg; i++) {
    const p = waitNotice();
    a.ws.send(JSON.stringify({ type: 'teleport_debug', x: han.zoneWidth - EDGE_PAD, y: LAT_STEP + ((lane + i) % 60) * LAT_STEP }));
    placed = await p;
    if (!placed) continue;
    for (let k = 0; k < 32 && !handoffMsg; k++) await sleep(500);   // 최대 16초 — 656px/64px·s ≈ 10.3초
  }
  clearInterval(walk);
  if (!handoffMsg) { console.log('❌ 어느 위도에서도 핸드오프가 안 일어났다'); process.exit(1); }
  console.log(`   (넘은 위도에서 ${handoffMsg.targetZone} 으로 핸드오프)`);
  try { a.ws.close(); } catch (e) {}

  const b = await open(`${nip.wsUrl}/?handoff_token=${encodeURIComponent(handoffMsg.token)}`);
  await sleep(500);
  console.log(`② 도착(${handoffMsg.targetZone})     inv=${invOf(b.inv)}  도구=${toolsOf(b.tools)}`);
  //  도착 존은 welcome 에 원장을 안 싣는다. 원장을 실은 `inventory` 방송을 받으려면 인벤을 한 번
  //  건드려야 한다 — 물고기 1마리를 버린다(남은 2마리의 무게가 그대로면 원장이 따라온 것이다).
  b.ws.send(JSON.stringify({ type: 'drop_item', item: 'fish', amount: 1 }));
  await sleep(900);
  console.log(`                   kg원장=${ledOf(b.ledger)}   (물고기 1마리 버린 뒤)`);
  await sleep(1500);                     // 도착 존이 savePlayer 를 돌릴 시간을 준다
  try { b.ws.close(); } catch (e) {}
  await sleep(800);

  // ── ③ 같은 신원으로 처음부터 다시 접속 ───────────────────
  const c = await open(`${han.wsUrl}/?username=&name=probeT&color=%23ffffff${guestToken ? '&guest_token=' + encodeURIComponent(guestToken) : ''}`);
  await sleep(700);
  console.log(`③ 재접속(hanbando) inv=${invOf(c.inv)}  도구=${toolsOf(c.tools)}`);
  try { c.ws.close(); } catch (e) {}

  console.log('');
  const lost2 = toolsOf(b.tools) === '(없음)' && toolsOf(a.tools) !== '(없음)';
  const lost3 = toolsOf(c.tools) === '(없음)';
  console.log(lost2 ? '→ 핸드오프 페이로드에 toolItems 가 없다(도착 즉시 사라짐).'
                    : '→ 핸드오프는 도구를 옮겼다.');
  if (lost2) console.log(lost3 ? '→ 재접속해도 안 돌아온다 = **영구 소실**(도착 존이 빈 몸으로 계정을 덮음).'
                              : '→ 재접속하면 돌아온다 = 전송 누락(계정엔 남아 있음).');
  process.exit(0);
})().catch((e) => { console.error('실패:', e && e.message); process.exit(1); });
