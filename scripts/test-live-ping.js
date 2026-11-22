#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @harness-only   ← [T1443] 제품을 안 부른다(`scripts/live-ping.js` 만 — 밖에서 보는 자) · 옛 제품 위에서도 초록이 맞다
// @bait 4   ← [T1443] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-live-ping.js — 밖에서 보는 생존 확인(`scripts/live-ping.js`)이 이번 사고 꼴을 빨강으로 잡는가(T1443 ②) ==========
//
// ★가짜 서버(이 프로세스 안 · 127.0.0.1 · 라이브 0): central(`/` · `/health` · `/zones`) + 존 둘(`/health` — 존 이름 · 세계 날) + 인증서 하나(openssl 로 만든 3일짜리)
//   ① 다 산 판 = 초록 · 한 번에
//   ② **연결은 받고 답이 0**(2026-11-21 사고 꼴 — 커널이 반쯤 굳음) = 빨강 · 세 번 다 실패 · 까닭 "답 없음"
//   ③ 연결 거절 = 빨강
//   ④ 느림: 시한 넘김 = 빨강 · 시한 안 = 초록(걸린 ms 가 적힌다)
//   ⑤ 존 하나가 `/zones` 에서 빠짐 = 빨강
//   ⑥ **central 은 살고 존은 죽음**(2026-11-22 21:05 재부팅 직후 꼴 — 게임 주소 200) = 빨강
//   ⑦ 인증서 3일 남음 = 빨강(문턱 14일)
//   ⑧ 첫 번 실패 · 둘째 번 삶 = 초록(흔들림 표시) — 한 번 실패로 빨강을 안 낸다
//   미끼 넷(이 파일 안 — `live-ping.js` 를 한 자리 고친 사본을 임시 폴더에 쓰고 같은 물음을 한다):
//     `ping` 이름만 닿으면 살았다는 사본 → ② 빨강을 못 잡음 · `tcp` TCP 연결만 보는 사본 → ② 못 잡음 ·
//     `game200` 게임 주소 200 만 보고 존을 안 보는 사본 → ⑥ 못 잡음 · `once` 한 번 실패에 바로 빨강인 사본 → ⑧ 이 빨강
//   (하네스는 날짜 · 벽시계를 박지 않는다 — 인증서 끝 날은 openssl `-days 3` 으로 만든 상대 값)
// 실행: node scripts/test-live-ping.js   (약 10초 · 망 0)
'use strict';
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const SRC = path.join(__dirname, 'live-ping.js');

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null ? '  ' + info : ''}`); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 't1443-ping-'));
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const servers = [];
const fast = () => Promise.resolve();   // 다시 보기 사이 쉼(하네스 — 0)

// 가짜 세계 — 상태 칸으로 꼴을 바꾼다
const S = { centralDelay: 0, fail503Once: false, dropZone: null, zoneDown: null, hang: false };
async function setup() {
  const zone = (id) => http.createServer((q, s) => { if (S.zoneDown === id) { s.destroy(); return; } if (q.url === '/health') { s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ zone: id, day: 1815, villages: 49, players: 6400, tickP50Ms: 15 })); } else { s.statusCode = 404; s.end(); } });
  const zh = zone('hanbando'), zn = zone('nippon'); servers.push(zh, zn);
  const ph = await listen(zh), pn = await listen(zn);
  const central = http.createServer((q, s) => {
    const go = () => {
      if (S.fail503Once) { S.fail503Once = false; s.statusCode = 503; s.end('busy'); return; }
      if (q.url === '/') { s.end('<!doctype html><title>game</title>'); return; }
      if (q.url === '/health') { s.end(JSON.stringify({ ok: true, players: 136 })); return; }
      if (q.url === '/zones') {
        const zones = { hanbando: { hosted: true, wsUrl: `ws://127.0.0.1:${ph}` }, nippon: { hosted: true, wsUrl: `ws://127.0.0.1:${pn}` }, canadia: { hosted: false, wsUrl: 'ws://127.0.0.1:1' } };
        if (S.dropZone) delete zones[S.dropZone];
        s.end(JSON.stringify({ zones })); return;
      }
      s.statusCode = 404; s.end();
    };
    S.centralDelay ? setTimeout(go, S.centralDelay) : go();
  });
  servers.push(central);
  const pc = await listen(central);
  // 연결은 받고 답이 0 — 소켓을 쥐고 아무것도 안 쓴다
  const hang = net.createServer((sock) => { sock.on('error', () => {}); }); servers.push(hang);
  const phang = await listen(hang);
  // 닫힌 포트(거절)
  const tmp = net.createServer(); const pdead = await listen(tmp); await new Promise((r) => tmp.close(r));
  // 인증서 3일짜리(openssl) — 없으면 그 물음은 ✗(건너뛰지 않는다)
  let pcert = null;
  const key = path.join(T, 'k.pem'), crt = path.join(T, 'c.pem');
  const o = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '3', '-subj', '/CN=localhost'], { encoding: 'utf8' });
  if (o.status === 0) { const hs = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (q, s) => s.end('ok')); servers.push(hs); pcert = await listen(hs); }
  return { pc, phang, pdead, pcert };
}
const cfg = (P, extra) => Object.assign({ url: `http://127.0.0.1:${P.pc}`, zones: ['hanbando', 'nippon'], tries: 3, gapMs: 0, timeoutMs: 600, certMinDays: 14, certHosts: [] }, extra || {});
const reasons = (R) => R.last.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.why}`).join(' · ');
// 미끼 사본 — 한 자리 고친 live-ping.js
const bait = (name, from, to) => { const s = fs.readFileSync(SRC, 'utf8'); const n = s.split(from).length - 1; const f = path.join(T, `bait-${name}.js`); fs.writeFileSync(f, s.split(from).join(to)); return { L: require(f), n }; };

(async () => {
  const L = require(SRC);
  const P = await setup();
  try {
    console.log('[T1443] 밖에서 보는 생존 확인 — 가짜 서버 여덟 꼴');
    const r1 = await L.run(cfg(P), fast);
    ok(r1.ok && r1.tries === 1 && r1.last.zones.hanbando && r1.last.zones.hanbando.day === 1815, '① 다 산 판 = 초록 · 한 번에 · 존 날 읽음', L.line(r1));
    const hangCfg = cfg(P, { url: `http://127.0.0.1:${P.phang}` });
    const r2 = await L.run(hangCfg, fast);
    ok(!r2.ok && r2.tries === 3 && /답 없음/.test(reasons(r2)), '★② 연결은 받고 답 0(사고 꼴) = 빨강 · 세 번 다 실패 · "답 없음"', reasons(r2).slice(0, 90));
    const r3 = await L.run(cfg(P, { url: `http://127.0.0.1:${P.pdead}` }), fast);
    ok(!r3.ok && /연결 거절/.test(reasons(r3)), '③ 연결 거절 = 빨강', reasons(r3).slice(0, 60));
    S.centralDelay = 900; const r4a = await L.run(cfg(P), fast); S.centralDelay = 200; const r4b = await L.run(cfg(P), fast); S.centralDelay = 0;
    ok(!r4a.ok && r4b.ok && r4b.last.checks[0].ms >= 190, '④ 느림 — 시한(600ms) 넘김 빨강 · 시한 안(200ms) 초록 · 걸린 ms 적힘', `${r4b.last.checks[0].ms}ms`);
    S.dropZone = 'nippon'; const r5 = await L.run(cfg(P), fast); S.dropZone = null;
    ok(!r5.ok && /존 nippon: \/zones 에 없음/.test(reasons(r5)), '⑤ 존 하나가 /zones 에서 빠짐 = 빨강', reasons(r5));
    S.zoneDown = 'hanbando'; const r6 = await L.run(cfg(P), fast); S.zoneDown = null;
    ok(!r6.ok && r6.last.checks[0].ok && /존 hanbando/.test(reasons(r6)), '★⑥ central 은 살고 존은 죽음(재부팅 직후 꼴 — 게임 주소 200) = 빨강', reasons(r6).slice(0, 80));
    const r7 = P.pcert ? await L.run(cfg(P, { certHosts: [`127.0.0.1:${P.pcert}`] }), fast) : null;
    ok(!!r7 && !r7.ok && /남은 [0-9.]+일 < 14일/.test(reasons(r7)), '⑦ 인증서 3일 남음 = 빨강(문턱 14일)', r7 ? reasons(r7) : 'openssl 없음');
    S.fail503Once = true; const r8 = await L.run(cfg(P), fast);
    ok(r8.ok && r8.tries === 2 && r8.flaky, '★⑧ 첫 번 실패 · 둘째 번 삶 = 초록(흔들림 표시) — 한 번 실패로 빨강 안 냄', L.line(r8));

    // ── 미끼 넷 ─────────────────────────────────────────────────────────────────────────
    // @bait ping — 이름만 닿으면(핑) 살았다
    const b1 = bait('ping', 'async function once(cfg) {\n', "async function once(cfg) {\n  if (true) return { ok: true, checks: [{ name: '핑', ok: true }], zones: {}, certs: [], at: 0 };   // 미끼: 핑만\n");
    const q1 = await b1.L.run(hangCfg, fast);
    ok(b1.n === 1 && q1.ok, '[미끼 ping] 바꾼 자리 1곳(핑만 보면 살았다) — 그 사본은 ② 사고 꼴을 초록이라 한다 = ② 물음이 잡는다', `자리 ${b1.n}`);
    // @bait tcp — TCP 연결만 보면 살았다
    const b2 = bait('tcp', "    const mod = url.protocol === 'https:' ? https : http;\n", "    return require('net').connect(+url.port || 80, url.hostname).on('connect', function () { this.destroy(); fin({ ok: true, status: 200, body: '{\"ok\":true,\"zones\":{},\"zone\":\"x\",\"day\":1}' }); }).on('error', (e) => fin({ ok: false, why: e.code }));   // 미끼: TCP 연결만\n    const mod = url.protocol === 'https:' ? https : http;\n");
    const q2 = await b2.L.run(cfg(P, { url: `http://127.0.0.1:${P.phang}`, zones: [] }), fast);
    ok(b2.n === 1 && q2.ok, '[미끼 tcp] 바꾼 자리 1곳(TCP 연결만) — 그 사본은 ② 사고 꼴을 초록이라 한다 = ② 물음이 잡는다', `자리 ${b2.n}`);
    // @bait game200 — 게임 주소 200 만 보고 존은 안 본다
    const b3 = bait('game200', '  for (const id of C.zones) {\n', '  for (const id of []) {   // 미끼: 존을 안 본다\n');
    S.zoneDown = 'hanbando'; const q3 = await b3.L.run(cfg(P), fast); S.zoneDown = null;
    ok(b3.n === 1 && q3.ok, '[미끼 game200] 바꾼 자리 1곳(존 안 봄) — 그 사본은 ⑥ 재부팅 직후 꼴을 초록이라 한다 = ⑥ 물음이 잡는다', `자리 ${b3.n}`);
    // @bait once — 한 번 실패에 바로 빨강
    const b4 = bait('once', '    if (r.ok) break;\n', '    break;   // 미끼: 한 번만 본다\n');
    S.fail503Once = true; const q4 = await b4.L.run(cfg(P), fast); S.fail503Once = false;
    ok(b4.n === 1 && !q4.ok, '[미끼 once] 바꾼 자리 1곳(다시 안 봄) — 그 사본은 ⑧ 흔들림을 빨강이라 한다 = ⑧ 물음이 잡는다', `자리 ${b4.n}`);
  } finally {
    for (const s of servers) try { s.close(); } catch (e) {}
    fs.rmSync(T, { recursive: true, force: true });
  }
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
