#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1092-handoff-back.js — 넘기에 실패해도 **말없이 멈추지 않는다**(옛 존에 머물고 까닭 한 줄) (T1092 · 2026-11-03) ==========
//
// ★왜 [★재민 11-02 실기 — 한반도 → 닛폰 경계에서 "끊김 · 멈춤"(튕기지도 않음)]
//   서버끼리 인계(`/handoff_prepare`)는 되는데 브라우저가 받는 존 소켓을 못 열면(central 주소 · 포트 · 방화벽 — 까닭 무관) ACK 가 안 오고,
//   보낸 존의 3초 시한이 사람을 지우고 소켓을 닫았다 — 화면은 "연결 끊김"으로 멈추고 사람은 왜인지 모른다(T1077 이 주소 하나를 고쳤다 · 이 카드는 까닭 무관).
//   고침(손잡이 `T1092_HANDOFF_BACK` · 켬 기본 후보 · `=0` 종전): 시한에 받는 존에게 토큰을 놓으라 하고(같은 문 `kind: 'drop'`), 놓았으면 넘기 전 자리
//   (T564 `_t564Pre`)로 돌려놓고 `handoff_back` + welcome(`back`) + 까닭 한 줄(하십시오체). 못 놓았으면(이미 썼다 · 그 사람이 받는 존에 따로 섰다 ·
//   못 물었다 · 받는 존 끔) 종전 정리 그대로.
//
// ★진짜 서버 셋(central · hanbando · nippon) + ws 클라(이 하네스). "브라우저가 받는 존에 못 붙는다" = 넘기 메시지를 받고 받는 존에 **안 붙는다**.
//   몸 읽기 = 존 `/bodydbg`(`serializeBody` 그 자체 · `E2E_GIVE=1` 문 뒤) · 행 = central `/player/<id>` · 로그 = 존 프로세스 출력(판마다 그 뒤만 센다).
//   판(손잡이 · 안 문 비밀을 바꿔 존을 다시 띄운다 — central 은 그대로):
//     A 켬 · 켬  ⓐ ★못 붙음 → 돌아옴(같은 pid · 넘기 전 자리 · 까닭 한 줄 · 소켓 그대로 · 몸 한 곳 · 행 `last_zone` = 한반도 · 늦은 토큰 · 승격 = 몸 0)
//                ⓑ 대조군 — 토큰으로 붙음 → 넘어감(돌려놓기 0)
//                ⓒ 받는 존에 이름 · 열쇠로 따로 섰다(토큰은 안 씀 · 클라 재시도 꼴) → 받는 존이 `here` · 종전 정리(몸 한 곳)
//     S 켬 · 켬 + 보낸 존에만 안 문 비밀(받는 존 ACK 가 거절된다 — T831 꼴)
//                ⓓ ★받는 존이 몸을 받았는데 ACK 만 잃은 판(T823 · T843 술어) → 토큰 이미 씀 · 종전 정리(몸은 받는 존 하나 · 행 안 되돌림)
//     M 보낸 존 켬 · 받는 존 끔(배포 창 — 한쪽만 새 판)  ⓔ drop 400 → 종전 정리
//     O 끔(`T1092_HANDOFF_BACK=0`)  ⓕ 종전 — `back` 칸 0 · ACK 시한이 지우고 닫는다(지금 꼴 증인)
//   ⓢ 소스 — 손잡이 한 자리 · 문 `kind: 'drop'` · 승격 welcome 한 벌(`_promoteWelcome`) · T843 술어 부르는 곳 그대로
// 실행: node scripts/test-t1092-handoff-back.js
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
process.env.HANDOFF_ACK_MS = process.env.HANDOFF_ACK_MS || '3000'; process.env.HANDOFF_TOKEN_MS = process.env.HANDOFF_TOKEN_MS || '5000';   // ★[PM 11-03] 이 하네스는 종전 넘기 시한(3초 · 5초)으로 잰다 — 제품 기본은 12초 · 15초(server/zone.js HANDOFF_ACK_MS)
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const { ZONES, HANDOFF_COMMIT } = require(path.join(ROOT, 'server', 'zone-config'));
const CPORT = 3010, HPORT = ZONES.hanbando.port, NPORT = ZONES.nippon.port;
const HW = ZONES.hanbando.zoneWidth;
const NIP_NM = ZONES.nippon.displayName;
const WHY = `${NIP_NM} 쪽으로 넘어가지 못했습니다. 저쪽 서버에 닿지 않습니다.`;
const SEC = 'zz-t1092-secret-aaaaaaaaaaaa';
const D = `/tmp/t1092-${process.pid}`;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
const until = async (f, ms, step = 100) => { const t = Date.now(); for (;;) { const v = f(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } };

// ── 서버 ─────────────────────────────────────────────────────────────────────────────────────────
const P = {};
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._out = ''; p.stdout.on('data', (b) => { p._out += String(b); }); p.stderr.on('data', (b) => { p._out += String(b); });
  P[name] = p; return p;
}
process.on('exit', () => { for (const p of Object.values(P)) { try { p.kill('SIGKILL'); } catch (e) {} } });
const COMMON = { CENTRAL_URL: `http://localhost:${CPORT}`, PUBLIC_HOST: 'localhost', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' };
const ENV = { hanbando: {}, nippon: {} };
async function startZone(z, env) {
  const old = P[z];
  if (old) { try { old.kill('SIGKILL'); } catch (e) {} for (let i = 0; i < 100 && !(await portFree(ZONES[z].port)); i++) await sleep(100); }
  ENV[z] = env || {};
  const p = boot(z, 'zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${D}/w-${z}.db` }, COMMON, ENV[z]));
  return (await FB.waitUp(p, /zone server up on/, { name: z, capMs: 600000 })).ok;
}
const hdr = (z) => (ENV[z] && ENV[z].CENTRAL_SECRET ? { 'x-zone-secret': ENV[z].CENTRAL_SECRET } : {});
const jget = async (u, h) => (await (await fetch(u, { headers: h || {}, signal: AbortSignal.timeout(5000) })).json());
const bodiesOf = async (z, name) => { try { return (await jget(`http://localhost:${ZONES[z].port}/bodydbg?name=${encodeURIComponent(name)}`, hdr(z))).bodies || {}; } catch (e) { return { err: e.message }; } };
const rowOf = async (id) => { try { return (await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(id)}`)).player || null; } catch (e) { return null; } };
const mark = () => ({ h: (P.hanbando._out || '').length, n: (P.nippon._out || '').length });
const logSince = (m, z) => String((P[z]._out || '').slice(z === 'hanbando' ? m.h : m.n));
const cnt = (s, re) => (s.match(re) || []).length;

// ── 클라(ws) ─────────────────────────────────────────────────────────────────────────────────────
function open(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const st = { ws, msgs: [], welcome: null, inv: null, closed: false };
    const tm = setTimeout(() => { if (!st.welcome) rej(new Error('welcome 없음')); }, 30000);
    ws.on('error', (e) => { st.err = e.message; if (!st.welcome) { clearTimeout(tm); rej(e); } });
    ws.on('close', () => { st.closed = true; st.closedAt = Date.now(); });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      m._at = Date.now(); st.msgs.push(m);
      if (m.type === 'inventory') st.inv = m.inventory;
      if (m.type === 'welcome' && !st.welcome) { st.welcome = m; st.inv = m.inventory; clearTimeout(tm); res(st); }
    });
  });
}
const send = (a, o) => { try { a.ws.send(JSON.stringify(o)); } catch (e) {} };
const after = (a, t, type) => a.msgs.filter((m) => m.type === type && m._at >= t);
const selfIn = (a, t, pid) => { const ts = after(a, t, 'tick'); for (let i = ts.length - 1; i >= 0; i--) { const me = (ts[i].players || []).find((q) => q.pid === pid); if (me) return me; } return null; };
// 동쪽 끝으로 옮겨 동쪽으로 걷는다 — 넘기 메시지가 올 때까지(test-handoff-body `crossEast` 와 같은 길 · 넘기 메시지가 오면 곧 걸음을 멈춘다)
async function crossEast(a) {
  const t0 = Date.now();
  const got = () => after(a, t0, 'handoff')[0] || null;
  let walk = null;
  try {
    for (let i = 0; i < 60 && !got(); i++) {
      const tT = Date.now();
      send(a, { type: 'teleport_debug', x: HW - 400, y: 2048 + ((3 + i) % 60) * 2048 });
      const tn = await until(() => after(a, tT, 'notice').find((m) => /텔레포트|물/.test(String(m.text))), 3000);
      if (!tn || !/텔레포트/.test(String(tn.text))) continue;
      walk = setInterval(() => send(a, { type: 'input', vx: 1, vy: 0 }), 33);
      await until(got, 16000, 50);
      clearInterval(walk); walk = null;
    }
  } finally { if (walk) clearInterval(walk); }
  return got();
}
const LOT_DURABLE = ['d', 'k', 'n', 'm', 'w'];
const durable = (b) => b ? JSON.stringify({ tools: (b.toolItems || []).map((t) => `${t.type}/${t.d}/${t.max}`).sort(), equipment: b.equipment || [], kg: b.kgLedger || null,
  lots: Object.fromEntries(Object.entries(b.lots || {}).map(([k, arr]) => [k, (arr || []).map((l) => Object.fromEntries(LOT_DURABLE.filter((f) => l && l[f] !== undefined).map((f) => [f, l[f]])))])) }) : '(없음)';
const invKey = (inv) => JSON.stringify(Object.fromEntries(Object.entries(inv || {}).filter(([, v]) => v).sort()));
async function person(tag) {   // 게스트 하나 — 짐 · 도구 · kg 를 앉힌다(빈 몸끼리 같음은 자명 통과)
  const NAME = 't1092' + tag;
  const a = await open(`ws://localhost:${HPORT}/?username=&name=${NAME}&color=%23ffffff`);
  send(a, { type: '__e2e_give', items: { pillar: 3, thatch: 7 }, tools: ['axe', 'pickaxe'], kgs: { fish: [2.0, 0.4, 1.1] }, quiet: true });
  await sleep(900);
  const name = a.welcome.name || NAME;
  return { a, name, id: a.welcome.playerId, pid: a.welcome.pid, gtok: a.welcome.guestToken || '', B0: (await bodiesOf('hanbando', name))[name] || null, I0: a.inv };
}

(async () => {
  console.log('\n=== 넘기에 실패해도 말없이 멈추지 않는다 — 옛 존에 머물고 까닭 한 줄 (T1092) ===');
  // ── ⓢ 소스 ───────────────────────────────────────────────────────────────────────────────────
  {
    const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const C = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'public', 'client', '33-m-conn.js'), 'utf8');
    ok((Z.match(/process\.env\.T1092_HANDOFF_BACK/g) || []).length === 1 && /const T1092_HANDOFF_BACK = process\.env\.T1092_HANDOFF_BACK !== '0';/.test(Z),
      "ⓢ 손잡이 한 자리 — `T1092_HANDOFF_BACK`(`!== '0'` · 켬 기본 후보 · 되돌림 `=0`)");
    ok(/else if \(data\.kind === 'drop' && T1092_HANDOFF_BACK\) out = _t1092Drop\(data\);/.test(Z) && !/req\.url === '\/handoff_drop'/.test(Z),
      "ⓢ 받는 존 문 = 그 문(`/handoff_prepare` · `kind: 'drop'`) — 새 라우트 0 · 끔이면 400(모르는 종류)");
    ok(/if \(T1092_HANDOFF_BACK && outgoingHandoffs\.has\(token\)\) return _t1092Back\(pid, token, targetZoneId, target, _ackGone\);[^\n]*\n\s*_ackGone\(\);\n\s*\}, HANDOFF_ACK_MS\);/.test(Z),
      'ⓢ ACK 시한 — 켬이면 `_t1092Back`(못 돌려놓으면 종전 몸통 `_ackGone`) · 끔이면 종전 몸통 그대로');
    //   ★[T1125] 보내는 함수는 `send` 또는 `sendWelcome`(큰 welcome 앞 머리 한 줄 — 손잡이 `T1125_WEL_HEAD` · welcome 글자 무변) · 뒤 두 인자(소켓 · 클라 서명 — `T1125_LEAN_PROMOTE`)
    ok((Z.match(/_promoteWelcome\(/g) || []).length === 3 && /send(?:Welcome)?\(ws, _promoteWelcome\(player, pid, \{ promoted: true \}(?:, ws, msg\.have)?\)\);/.test(Z) && /send(?:Welcome)?\(p\.ws, _promoteWelcome\(p, pid, \{ back: true \}(?:, p\.ws, null)?\)\);/.test(Z),
      'ⓢ 승격 welcome 한 벌(`_promoteWelcome` — 승격 · 되돌림 둘이 부른다 · 사본 0)');
    ok((Z.match(/_t843Skip\(/g) || []).length === 3 && (Z.match(/function _t564Hold\(player\)/g) || []).length === 1 && (Z.match(/_t564Hold\(/g) || []).length === 3,
      'ⓢ T843 술어 부르는 곳 그대로(정의 · 저장 머리 · 시한 = 3) · 몸 되돌림 한 자리(`_t564Hold` — T564 준비 실패 · T1092 둘)');
    ok(/msg\.type === 'handoff_back'/.test(C) && /if \(msg\.promoted \|\| msg\.back\)/.test(C) && /if \(_t1092Wait\(\)\) return;/.test(C),
      'ⓢ 클라 — `handoff_back` 갈래 · welcome `back` = 승격처럼 관측 상태 유지 · 약속 시한 동안 받는 존 재시도 0(`_t1092Wait`)');
  }
  for (const port of [CPORT, HPORT, NPORT]) if (!await portFree(port)) { ok(false, `포트 ${port} 가 비어 있다(남의 서버를 잴 수 없다)`); process.exit(1); }
  fs.mkdirSync(D, { recursive: true });
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: `${D}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const upA = cu.ok && (await Promise.all([startZone('hanbando', {}), startZone('nippon', {})])).every(Boolean);
  ok(upA, '[판 A] central · 한반도 · 닛폰 기동(손잡이 켬 · 켬)');
  if (!upA) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }

  // ── ⓐ 못 붙음 → 돌아옴 ───────────────────────────────────────────────────────────────────────
  console.log('\n[ⓐ 브라우저가 받는 존에 못 붙는다 → 옛 존에 머문다]');
  {
    const q = await person('a'), a = q.a;
    const m0 = mark();
    const H = await crossEast(a);
    ok(!!H && !!H.token, 'ⓐ [상황] 경계를 넘어 넘기 메시지가 왔다(토큰)', H ? `토큰 ${String(H.token).slice(0, 8)}` : '안 왔다');
    if (H) {
      ok(H.back === 5000, 'ⓐ 넘기 메시지에 `back` = 받는 존 토큰 수명(5000 — 종전 그 수 · 클라 기다림 시한)', String(H.back));
      const back = await until(() => after(a, H._at, 'handoff_back')[0], 9000);
      const wb = await until(() => after(a, H._at, 'welcome').find((m) => m.back), 2000);
      const dt = back ? back._at - H._at : null;
      ok(!!back && back.zone === 'hanbando' && back.from === 'nippon' && dt >= 2900 && dt < 5000 && !a.closed,
        'ⓐ ★`handoff_back` — ACK 시한(3초) 뒤 받는 존 답 한 번 안에 · 소켓은 그대로 열려 있다(종전: 지우고 닫는다)', back ? `${dt}ms · 소켓 ${a.closed ? '닫힘' : '열림'}` : '안 왔다');
      ok(!!wb && wb.pid === q.pid && !wb.promoted && wb.self && wb.self.x >= HW && wb.self.x <= HW + HANDOFF_COMMIT && invKey(wb.inventory) === invKey(q.I0),
        'ⓐ ★welcome(`back`) — 같은 pid · 넘기 전 자리(선 ~ 겹침 띠 끝) · 짐 그대로 · `promoted` 0(게스트 열쇠 안 건드림)',
        wb ? `pid ${wb.pid}/${q.pid} · x ${Math.round(wb.self.x)}(선 ${HW}) · 짐 ${invKey(wb.inventory) === invKey(q.I0) ? '같다' : '다르다'}` : '안 왔다');
      const nts = after(a, H._at, 'notice').map((m) => String(m.text));
      ok(nts.includes(WHY), 'ⓐ ★까닭 한 줄(하십시오체) — "' + WHY + '"', JSON.stringify(nts.filter((t) => !/텔레포트/.test(t))));
      // 몸이 산다 — 틱에 내가 다시 실리고 · 서쪽으로 걸으면 움직인다
      const tB = Date.now(); await sleep(600);
      const s0 = selfIn(a, tB, q.pid);
      const w = setInterval(() => send(a, { type: 'input', vx: -1, vy: 0 }), 33); await sleep(1500); clearInterval(w); await sleep(400);
      const s1 = selfIn(a, tB + 1500, q.pid);
      ok(!!s0 && !!s1 && s1.x < s0.x - 16, 'ⓐ ★몸이 산다 — 틱에 내가 다시 실리고 서쪽 입력에 움직인다(한반도)', s0 && s1 ? `x ${Math.round(s0.x)} → ${Math.round(s1.x)}` : '틱에 내가 없다');
      // 몸 한 곳 · 몸 칸 그대로
      const bh = await bodiesOf('hanbando', q.name), bn = await bodiesOf('nippon', q.name);
      ok(Object.keys(bh).length === 1 && Object.keys(bn).length === 0 && durable(bh[q.name]) === durable(q.B0),
        'ⓐ ★몸 사본 0 — 한반도 하나 · 닛폰 0 · 몸 칸(도구 · 장비 · kg · 로트 내구) 넘기 전과 같다', `한반도 ${Object.keys(bh).length} · 닛폰 ${Object.keys(bn).length} · 몸 ${durable(bh[q.name]) === durable(q.B0) ? '같다' : '다르다'}`);
      await sleep(800);
      const row = await rowOf(q.id);
      ok(!!row && row.last_zone === 'hanbando' && Math.abs((+row.last_x) - wb.self.x) <= 1,
        'ⓐ ★행 — `last_zone` 한반도(넘기 전 저장의 받는 존 · 입구에 머물지 않는다 — 다시 들어가도 한반도)', row ? `${row.last_zone} (${Math.round(row.last_x)},${Math.round(row.last_y)})` : '행 없음');
      const lh = logSince(m0, 'hanbando'), ln = logSince(m0, 'nippon');
      ok(cnt(lh, /↩ \[T1092\] 넘기 실패/g) === 1 && cnt(lh, /⚠ ACK timeout/g) === 0 && cnt(ln, /⇐ \[T1092\] handoff drop token=\S+ — 안 쓴 토큰을 놓았다/g) === 1 && cnt(ln, /✓ handoff token=/g) === 0,
        'ⓐ 로그 — 보낸 존 `↩ [T1092]` 1 · `⚠ ACK timeout` 0 · 받는 존 "안 쓴 토큰을 놓았다" 1 · 토큰 접속 0', `↩ ${cnt(lh, /↩ \[T1092\]/g)} · ACK timeout ${cnt(lh, /⚠ ACK timeout/g)} · drop ${cnt(ln, /handoff drop/g)}`);
      // 늦은 토큰 — 토큰 접속 · 승격 둘 다 그 사람 몸을 못 세운다
      let late = null; try { late = await open(`ws://localhost:${NPORT}/?handoff_token=${encodeURIComponent(H.token)}`); } catch (e) { late = { err: e.message }; }
      const lateId = late && late.welcome ? late.welcome.playerId : null;
      const obs = new WebSocket(`ws://localhost:${NPORT}/?observer=1&vx=100&vy=100`); const on = [];
      obs.on('message', (raw) => { try { const m = JSON.parse(raw); if (m.type === 'notice') on.push(String(m.text)); } catch (e) {} });
      await until(() => obs.readyState === 1, 5000); try { obs.send(JSON.stringify({ type: 'promote_to_primary', token: H.token })); } catch (e) {}
      await sleep(1200);
      const bn2 = await bodiesOf('nippon', q.name);
      ok(lateId !== q.id && Object.keys(bn2).length === 0 && on.some((t) => /모른다|모릅니다/.test(t)),
        'ⓐ ★늦은 토큰 — 받는 존 토큰 접속은 그 사람이 아니고(종전 1회용 손님 꼴) · 승격은 "모른다"(T564) · 닛폰에 그 사람 몸 0', `토큰 접속 ${lateId === q.id ? '그 사람!' : '남(' + String(lateId).slice(0, 10) + ')'} · 승격 ${JSON.stringify(on)} · 닛폰 ${Object.keys(bn2).length}`);
      try { late && late.ws && late.ws.close(); } catch (e) {} try { obs.close(); } catch (e) {}
    }
    try { a.ws.close(); } catch (e) {}
    await sleep(800);
  }

  // ── ⓑ 대조군 — 붙으면 넘어간다 ─────────────────────────────────────────────────────────────────
  console.log('\n[ⓑ 대조군 — 토큰으로 붙으면 넘어간다]');
  {
    const q = await person('b'), a = q.a;
    const m0 = mark();
    const H = await crossEast(a);
    let b = null; if (H) { try { b = await open(`ws://localhost:${NPORT}/?handoff_token=${encodeURIComponent(H.token)}`); } catch (e) {} }
    await sleep(4500);
    const bh = await bodiesOf('hanbando', q.name), bn = await bodiesOf('nippon', q.name);
    ok(!!H && !!b && b.welcome.playerId === q.id && after(a, H._at, 'handoff_back').length === 0 && Object.keys(bh).length === 0 && Object.keys(bn).length === 1,
      'ⓑ ★넘어간다 — 닛폰에 그 사람 하나 · 한반도 0 · `handoff_back` 0', `닛폰 ${Object.keys(bn).length} · 한반도 ${Object.keys(bh).length} · back ${H ? after(a, H._at, 'handoff_back').length : '-'}`);
    const lh = logSince(m0, 'hanbando');
    ok(cnt(lh, /✓ ACK token=/g) === 1 && cnt(lh, /\[T1092\]/g) === 0, 'ⓑ 보낸 존 로그 ACK 1 · `[T1092]` 0(넘어간 판엔 손대지 않는다)');
    try { b && b.ws.close(); } catch (e) {} try { a.ws.close(); } catch (e) {}
    await sleep(800);
  }

  // ── ⓒ 받는 존에 따로 섰다(토큰 안 씀) ──────────────────────────────────────────────────────────
  console.log('\n[ⓒ 기다리는 사이 받는 존에 이름 · 열쇠로 따로 들어갔다 — 돌려놓지 않는다]');
  {
    const q = await person('c'), a = q.a;
    const m0 = mark();
    const H = await crossEast(a);
    let b = null; if (H) { try { b = await open(`ws://localhost:${NPORT}/?username=&name=${encodeURIComponent('t1092c')}&color=%23ffffff&guest_token=${encodeURIComponent(q.gtok)}`); } catch (e) {} }
    await until(() => a.closed, 9000);
    await sleep(600);
    const bh = await bodiesOf('hanbando', q.name), bn = await bodiesOf('nippon', q.name);
    ok(!!H && !!b && b.welcome.playerId === q.id && a.closed && after(a, H._at, 'handoff_back').length === 0 && Object.keys(bh).length === 0 && Object.keys(bn).length === 1,
      'ⓒ ★몸 한 곳 — 받는 존에 따로 선 그 사람 하나 · 보낸 존은 종전 정리(소켓 닫음 · `handoff_back` 0)', `닛폰 ${Object.keys(bn).length} · 한반도 ${Object.keys(bh).length} · 소켓 ${a.closed ? '닫힘' : '열림'}`);
    const lh = logSince(m0, 'hanbando'), ln = logSince(m0, 'nippon');
    ok(cnt(lh, /· \[T1092\] ACK 없음 · 돌려놓지 않는다 — 받는 존에 그 사람이 따로 섰다/g) === 1 && cnt(lh, /⚠ ACK timeout/g) === 1 && cnt(ln, /handoff drop token=\S+ — 안 쓴 토큰을 놓았다 · 그 사람이 이 존에 있다/g) === 1,
      'ⓒ 로그 — 받는 존 "그 사람이 이 존에 있다" · 보낸 존 "따로 섰다" → 종전 `⚠ ACK timeout`');
    try { b && b.ws.close(); } catch (e) {}
    await sleep(800);
  }

  // ── 판 S — 보낸 존에만 안 문 비밀(받는 존 ACK 가 거절된다) ─────────────────────────────────────
  const upS = await startZone('hanbando', { CENTRAL_SECRET: SEC });
  ok(upS, '[판 S] 한반도만 안 문 비밀로 다시 기동(받는 존 `/handoff_ack` 이 거절된다 — T831 꼴)');
  console.log('\n[ⓓ 받는 존이 몸을 받았는데 ACK 만 잃은 판 — T823 · T843 술어와 겹치지 않는다]');
  if (upS) {
    const q = await person('d'), a = q.a;
    const m0 = mark();
    const H = await crossEast(a);
    let b = null; if (H) { try { b = await open(`ws://localhost:${NPORT}/?handoff_token=${encodeURIComponent(H.token)}`); } catch (e) {} }
    await until(() => a.closed, 9000);
    await sleep(1500);
    const bh = await bodiesOf('hanbando', q.name), bn = await bodiesOf('nippon', q.name);
    const row = await rowOf(q.id);
    ok(!!H && !!b && b.welcome.playerId === q.id && a.closed && after(a, H._at, 'handoff_back').length === 0 && Object.keys(bh).length === 0 && Object.keys(bn).length === 1,
      'ⓓ ★몸은 받는 존 하나 — 돌려놓지 않는다(토큰을 이미 썼다) · 보낸 존 종전 정리', `닛폰 ${Object.keys(bn).length} · 한반도 ${Object.keys(bh).length} · back ${H ? after(a, H._at, 'handoff_back').length : '-'}`);
    ok(!!row && row.last_zone === 'nippon', 'ⓓ 행 `last_zone` 닛폰 그대로(껍데기 저장이 안 되돌린다 — T843)', row ? row.last_zone : '행 없음');
    const lh = logSince(m0, 'hanbando'), ln = logSince(m0, 'nippon');
    ok(cnt(lh, /· \[T1092\] ACK 없음 · 돌려놓지 않는다 — 받는 존이 토큰을 이미 썼다/g) === 1 && cnt(ln, /handoff drop token=\S+ — 토큰 없음/g) === 1 && cnt(lh, /↩ \[T1092\]/g) === 0,
      'ⓓ 로그 — 받는 존 "토큰 없음(이미 썼다)" · 보낸 존 "이미 썼다" → 종전 정리 · `↩` 0');
    ok(!lh.includes(SEC) && !ln.includes(SEC), 'ⓓ 로그에 비밀 값 0');
    try { b && b.ws.close(); } catch (e) {}
    await sleep(800);
  }

  // ── 판 M — 받는 존만 끔(배포 창) ─────────────────────────────────────────────────────────────
  const upM = await startZone('nippon', { T1092_HANDOFF_BACK: '0' });
  ok(upM, '[판 M] 닛폰만 손잡이 끔으로 다시 기동(한쪽만 새 판 — 배포 창)');
  console.log('\n[ⓔ 받는 존이 `drop` 을 모른다 — 종전 정리]');
  if (upM) {
    const q = await person('e'), a = q.a;
    const m0 = mark();
    const H = await crossEast(a);
    await until(() => a.closed, 12000);
    const lh = logSince(m0, 'hanbando');
    ok(!!H && a.closed && after(a, H._at, 'handoff_back').length === 0 && cnt(lh, /· \[T1092\] ACK 없음 · 돌려놓지 않는다 — 받는 존에 못 물었다\(400\)/g) === 1 && cnt(lh, /⚠ ACK timeout/g) === 1,
      'ⓔ 받는 존 400(모르는 종류) → 보낸 존 종전 정리(소켓 닫음 · `⚠ ACK timeout`)', H ? `소켓 ${a.closed ? '닫힘' : '열림'} · back ${after(a, H._at, 'handoff_back').length}` : '넘기 없음');
    await sleep(500);
  }

  // ── 판 O — 끔(종전) ──────────────────────────────────────────────────────────────────────────
  const upO = await startZone('hanbando', { T1092_HANDOFF_BACK: '0' });
  ok(upO, '[판 O] 한반도 손잡이 끔(`T1092_HANDOFF_BACK=0`)으로 다시 기동');
  console.log('\n[ⓕ 끔 — 종전(지금 꼴): ACK 시한이 지우고 닫는다]');
  if (upO) {
    const q = await person('f'), a = q.a;
    const m0 = mark();
    const H = await crossEast(a);
    await until(() => a.closed, 9000);
    const dt = H && a.closedAt ? a.closedAt - H._at : null;
    const lh = logSince(m0, 'hanbando'), ln = logSince(m0, 'nippon');
    ok(!!H && H.back === undefined && a.closed && dt >= 2900 && dt < 4500 && after(a, H._at, 'handoff_back').length === 0,
      'ⓕ ★종전 — 넘기 메시지에 `back` 0 · 3초 시한이 소켓을 닫는다 · `handoff_back` 0', H ? `닫힘 ${dt}ms` : '넘기 없음');
    ok(cnt(lh, /⚠ ACK timeout token=\S+ — fallback 정리/g) === 1 && cnt(lh + ln, /\[T1092\]/g) === 0, 'ⓕ 로그 — `⚠ ACK timeout … fallback 정리` 1 · `[T1092]` 0(끔 = 종전 바이트 길)');
    const bh = await bodiesOf('hanbando', q.name), bn = await bodiesOf('nippon', q.name), row = await rowOf(q.id);
    ok(Object.keys(bh).length === 0 && Object.keys(bn).length === 0 && !!row && row.last_zone === 'nippon',
      'ⓕ [지금 꼴] 몸은 어느 존에도 안 서 있고 행은 받는 존(닛폰)을 가리킨다 — 다시 들어가도 닛폰으로 간다', row ? `행 ${row.last_zone}` : '행 없음');
  }

  for (const p of Object.values(P)) { try { p.kill('SIGKILL'); } catch (e) {} }
  await sleep(500);
  try { fs.rmSync(D, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); for (const p of Object.values(P)) { try { p.kill('SIGKILL'); } catch (x) {} } process.exit(1); });
