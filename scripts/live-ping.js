#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1443 ② 밖에서 보는 생존 확인 · 라이브 무변 · 읽기만 · 비밀 0)
// === scripts/live-ping.js — 게임이 **밖에서 실제로 되는가**: 게임 주소 · central · 존(브라우저가 붙는 그 주소)마다 HTTP 답 + 인증서 남은 날 ==========
//
// ★왜(사고 2026-11-21 · 보고/사고_2026-11-21_서울_커널.md): 서울 서버가 34시간 죽어 있었는데 아무도 몰랐다.
//   그동안 핑은 정상이었고 80 / 443 / 3010 / 22 는 **TCP 연결은 받는데 답이 0** 이었다(커널이 반쯤 굳은 꼴). 그래서 이 자는
//   ① 핑 · TCP 연결만으로 "살았다"고 하지 않는다 — **HTTP 답(상태 200 + 기대한 몸)** 이 와야 산 것이다.
//   ② 게임 주소 200 만으로 "세계도 떴다"고 하지 않는다 — 재부팅 직후 central 은 떴는데 존이 `Exited` 였다(11-22 21:05 꼴) →
//      central `/zones` 가 "선 존"(`hosted`)이라 말하는 존마다 **그 존의 `/health`**(브라우저가 붙는 `wsUrl` 의 https · Caddy 443)가
//      200 + 그 존 이름 + 세계 날을 줘야 산 것이다. 기대 존(기본 한반도 · 닛폰)이 `/zones` 에서 빠져도 빨강.
//   ③ 한 번 실패로 빨강을 내지 않는다 — 실패면 60초 뒤 다시 · 또 실패면 60초 뒤 한 번 더 — **세 번 다 실패일 때만 빨강**(망 한 번 튐 · 배포 중 짧은 내림).
//
// 쓰는 법:
//   node scripts/live-ping.js            # 표 + 판정 · 종료 코드 0 = 살았다 · 1 = 빨강(세 번 다 실패)
//   node scripts/live-ping.js --line     # 한 줄(야간러너 보고 첫 줄 — "생존 ○ …" / "생존 ✗ …")
//   node scripts/live-ping.js --json     # 판 원문 한 줄
//   env  LIVE_URL(기본 https://mini-gate.duckdns.org) · LIVE_ZONES(기본 hanbando,nippon) · LIVE_TRIES(3) · LIVE_GAP_MS(60000) ·
//        LIVE_TIMEOUT_MS(20000 — 한 요청 · 연결은 받고 답이 없으면 이 시간에 실패) · LIVE_CERT_MIN_DAYS(14) · LIVE_CERT_HOSTS(인증서를 볼 이름 — 기본 = 게임 · 존 주소의 이름)
//   주소 값(존 호스트 · IP)은 표 · 줄 · JSON 에 안 찍는다 — 이름(게임 · 존 id)만(T1077 경계 줄 · `live-lag.sh` 와 같이).
//
// 인증서 문턱 14일: Caddy 는 Let's Encrypt 90일 인증서를 남은 30일(수명의 1/3)부터 갱신한다 — 14일 밑이면 갱신이 2주 넘게 실패한 것이다.
'use strict';
const http = require('http');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');

const E = process.env;
const CFG = {
  url: (E.LIVE_URL || 'https://mini-gate.duckdns.org').replace(/\/+$/, ''),
  zones: (E.LIVE_ZONES || 'hanbando,nippon').split(',').map((s) => s.trim()).filter(Boolean),
  tries: Math.max(1, parseInt(E.LIVE_TRIES || '3', 10)),
  gapMs: parseInt(E.LIVE_GAP_MS || '60000', 10),
  timeoutMs: parseInt(E.LIVE_TIMEOUT_MS || '20000', 10),
  certMinDays: parseFloat(E.LIVE_CERT_MIN_DAYS || '14'),
  certHosts: E.LIVE_CERT_HOSTS ? E.LIVE_CERT_HOSTS.split(',').filter(Boolean) : null,
};

// 한 요청 — 상태 · 몸 · 걸린 ms. 연결은 받고 답이 없으면 timeoutMs 에 실패(이번 사고 꼴)
function get(u, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now(); let done = false;
    const fin = (r) => { if (done) return; done = true; resolve(Object.assign({ ms: Date.now() - t0 }, r)); };
    let url; try { url = new URL(u); } catch (e) { return fin({ ok: false, why: '주소 꼴' }); }
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, { method: 'GET', timeout: timeoutMs, headers: { 'user-agent': 'live-ping/1', accept: 'application/json,text/html' } }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { if (body.length < 200000) body += c; });
      res.on('end', () => fin({ ok: true, status: res.statusCode, body }));
      res.on('error', (e) => fin({ ok: false, why: '답 끊김 ' + e.code }));
    });
    req.on('timeout', () => { req.destroy(); fin({ ok: false, why: `답 없음(${timeoutMs}ms — 연결만 받고 답 0 꼴)` }); });
    req.on('error', (e) => fin({ ok: false, why: e.code === 'ECONNREFUSED' ? '연결 거절' : e.code === 'ENOTFOUND' ? '이름 못 찾음(DNS)' : (e.code || e.message) }));
    req.end();
  });
}
// 인증서 남은 날(검증 실패여도 끝 날은 읽는다 — 만료 · 이름 틀림은 따로 적는다)
function certDays(host, port, timeoutMs) {
  return new Promise((resolve) => {
    let done = false; const fin = (r) => { if (!done) { done = true; resolve(r); } };
    const s = tls.connect({ host, port: port || 443, servername: require('net').isIP(host) ? undefined : host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const c = s.getPeerCertificate(); const ok = s.authorized; const err = s.authorizationError;
      s.end();
      if (!c || !c.valid_to) return fin({ ok: false, why: '인증서 없음' });
      fin({ ok: true, days: +((Date.parse(c.valid_to) - Date.now()) / 864e5).toFixed(1), authorized: ok, authErr: err ? String(err) : null });
    });
    s.on('timeout', () => { s.destroy(); fin({ ok: false, why: '답 없음' }); });
    s.on('error', (e) => fin({ ok: false, why: e.code || e.message }));
  });
}
const jparse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const zoneHealthUrl = (wsUrl) => { const u = new URL(wsUrl); u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'; u.pathname = '/health'; u.search = ''; return u.toString(); };

// 한 번 보기 — 칸마다 {name, ok, why, ms, …} · 하나라도 거짓이면 그 번은 실패
async function once(cfg) {
  const C = cfg || CFG, out = [], to = C.timeoutMs;
  const push = (name, ok, why, extra) => { out.push(Object.assign({ name, ok, why: ok ? '' : why }, extra || {})); return ok; };
  const root = await get(C.url + '/', to);
  push('게임 주소 /', root.ok && root.status === 200 && root.body.length > 0, root.ok ? `상태 ${root.status}` : root.why, { ms: root.ms });
  const h = await get(C.url + '/health', to), hj = h.ok && h.status === 200 ? jparse(h.body) : null;
  push('central /health', !!(hj && hj.ok === true), h.ok ? (hj ? 'ok 아님' : `상태 ${h.status}`) : h.why, { ms: h.ms });
  const z = await get(C.url + '/zones', to), zj = z.ok && z.status === 200 ? jparse(z.body) : null;
  push('central /zones', !!(zj && zj.zones), z.ok ? `상태 ${z.status}` : z.why, { ms: z.ms });
  const names = new Map();   // 인증서를 볼 이름(https 주소만) → 표에 쓸 이름(게임 주소 · 존 id — 주소 값은 안 찍는다)
  const addHost = (u, nm) => { try { const x = new URL(u); if (x.protocol === 'https:') names.set(x.host, names.has(x.host) && names.get(x.host) !== nm ? names.get(x.host) + ' · ' + nm : nm); } catch (e) {} };
  addHost(C.url, '게임 주소');
  const zinfo = {};
  for (const id of C.zones) {
    const zz = zj && zj.zones ? zj.zones[id] : null;
    if (!zz) { push(`존 ${id}`, false, zj ? '/zones 에 없음' : '/zones 못 읽음'); continue; }
    if (zz.hosted === false) { push(`존 ${id}`, false, '/zones 가 선 존이 아니라 함(hosted=false)'); continue; }
    let hu; try { hu = zoneHealthUrl(zz.wsUrl); } catch (e) { push(`존 ${id}`, false, 'wsUrl 꼴'); continue; }
    addHost(hu, `존 ${id}`);
    const r = await get(hu, to), j = r.ok && r.status === 200 ? jparse(r.body) : null;
    const good = !!(j && j.zone === id && Number.isFinite(j.day));
    push(`존 ${id}`, good, r.ok ? (j ? '존 이름 · 날 없음' : `상태 ${r.status}`) : r.why, { ms: r.ms, day: j ? j.day : null, villages: j ? j.villages : null, tickP50Ms: j ? j.tickP50Ms : null });
    if (j) zinfo[id] = { day: j.day, villages: j.villages };
  }
  const certs = [];
  const targets = C.certHosts ? C.certHosts.map((h) => [h, '인증서 ' + C.certHosts.indexOf(h)]) : [...names.entries()];
  for (const [hp, nm] of targets) {
    const [host, port] = hp.split(':');
    const c = await certDays(host, port ? +port : 443, to);
    certs.push({ name: nm, days: c.ok ? c.days : null });
    push(`인증서 ${nm}`, c.ok && c.days >= C.certMinDays, c.ok ? `남은 ${c.days}일 < ${C.certMinDays}일` : c.why, { days: c.ok ? c.days : null });
  }
  return { ok: out.every((x) => x.ok), checks: out, zones: zinfo, certs, at: Date.now() };
}

// 판 — 실패면 gapMs 뒤 다시(최대 tries 번) · 다 실패일 때만 빨강
async function run(cfg, sleep) {
  const C = cfg || CFG, zz = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tries = [];
  for (let i = 0; i < C.tries; i++) {
    if (i > 0) await zz(C.gapMs);
    const r = await once(C); tries.push(r);
    if (r.ok) break;
  }
  const last = tries[tries.length - 1];
  return { ok: last.ok, tries: tries.length, flaky: last.ok && tries.length > 1, last, failsBefore: tries.slice(0, -1).map((t) => t.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.why}`)) };
}
function line(R) {
  const L = R.last, z = Object.entries(L.zones).map(([id, v]) => `${id} 날 ${v.day}`).join(' · ');
  const ms = Math.max(0, ...L.checks.filter((c) => c.ms != null).map((c) => c.ms));
  const cert = L.certs.length ? Math.min(...L.certs.filter((c) => c.days != null).map((c) => c.days)) : null;
  if (R.ok) return `생존 ○ 게임 200 · central ok · 존 ${z || '—'} · 인증서 최소 ${cert != null ? Math.floor(cert) + '일' : '—'} · 가장 느린 답 ${(ms / 1000).toFixed(1)}초${R.flaky ? ` · (앞 ${R.tries - 1}번 실패 뒤 살아남)` : ''}`;
  return `생존 ✗ ${R.tries}번 다 실패 — ` + L.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.why}`).join(' · ');
}
module.exports = { CFG, get, certDays, once, run, line, zoneHealthUrl };

if (require.main === module) {
  (async () => {
    const R = await run(CFG);
    const A = process.argv.slice(2);
    if (A.includes('--json')) console.log(JSON.stringify(R));
    else if (A.includes('--line')) console.log(line(R));
    else {
      console.log(`=== 생존 확인 — 게임 주소 · central · 존 ${CFG.zones.join(' · ')}(밖에서 · HTTP 답 · ${CFG.tries}번까지 ${CFG.gapMs / 1000}초 간격) ===`);
      for (const c of R.last.checks) console.log(`  ${c.ok ? '○' : '✗'} ${c.name}${c.ms != null ? ` · ${c.ms}ms` : ''}${c.day != null ? ` · 날 ${c.day}` : ''}${c.days != null ? ` · 남은 ${c.days}일` : ''}${c.ok ? '' : ` — ${c.why}`}`);
      if (R.failsBefore.length) R.failsBefore.forEach((f, i) => console.log(`  (앞 ${i + 1}번째 실패: ${f.join(' · ')})`));
      console.log(line(R));
    }
    process.exit(R.ok ? 0 : 1);
  })().catch((e) => { console.error('생존 ✗ 자 오류 — ' + (e && e.message)); process.exit(1); });
}
