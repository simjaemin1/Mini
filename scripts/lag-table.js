#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T486 ④ 표 기계)
// =============================================================================
// T486 ④ — `lag-capture.sh` 의 5분(jsonl)과 `__frameCapture()` 의 60초(json)를 **원인 표** 로 만든다(새 계산 0 · 읽기만).
//
//   ★가름 기준을 **먼저** 적는다(값을 보기 전에 정한 문장 — 보고 §0-ⓓ 와 같은 글):
//     스파이크 초 = 서버가 1초 안에 한 번이라도 막힌 초 — 루프 max ≥ 50ms(해상도 10ms 를 품는 값 · 막힘 ≥ 40ms)
//                   또는 틱 max ≥ 33ms(한 틱 예산 · 30Hz) 또는 `/perf` 왕복 q ≥ 50ms(pong 과 같은 줄을 기다린다)
//     후보마다 "그 초에 켜졌나" 술어 하나:
//       ⓐ steal   : 그 초 steal ≥ 5%                     (공유 vCPU 를 못 받았다)
//       ⓑ 포화    : 그 초 user+sys+steal ≥ 90%           (상자 전체가 바쁘다 · 1 vCPU)
//       ⓒ GC      : 로그 `GC 정지` 가 그 초 ±1초 안       (>30ms 만 찍힌다)
//       ⓓ 디스크  : 그 초 쓴 KB ≥ 5분 p95 이고 > 0 · 또는 쓰기 ms ≥ 50 · 또는 사건 링 `save` ≥ 5ms
//       ⓔ 중앙    : 그 초 중앙 CPU ≥ 30%(한 코어의)
//       ⓕ econ    : 사건 링 `econ_frame`·`econ_day` 가 그 초에
//     주인 판정 = **들어 올림(lift)** — 스파이크 초에서 켜진 비율 ÷ 평소 초에서 켜진 비율 ≥ 2 이고 스파이크 초의 ≥ 30% 에서 켜진 것 중 가장 큰 것.
//       둘 다 못 넘으면 "주인 없음(틱 본문 자체)" — 사건 링의 `tick ≥ 33ms` 가 그 몫이다.
//     핑 튐(클라 캡처): 튄 핑 = rtt > max(2×중앙, 중앙+30ms) · 판정은 `__frameCapture` 가 이미 적은 것(클라 · 서버 · 망 · 미상)을 센다.
//     ⓖ 망은 서버 캡처의 소켓 rtt(5초) · 재전송 증가 · 클라 pong 셋의 망 몫 p95 로 본다.
//
// 쓰는 법: node scripts/lag-table.js <server.jsonl> [frame.json] [--md]
// =============================================================================
'use strict';
const fs = require('fs');
const [SRV, FRAME] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MD = process.argv.includes('--md');
const L = fs.readFileSync(SRV, 'utf8').split('\n').filter(Boolean).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
const meta = L.find((o) => o.k === 'meta') || {}, pmeta = L.find((o) => o.k === 'pmeta') || {};
const S = L.filter((o) => o.k === 's'), P = L.filter((o) => o.k === 'p' && !o.first), W = L.filter((o) => o.k === 'w'), G = L.filter((o) => o.k === 'gc');
const q = (a, p) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : null; };
const f1 = (x, d = 1) => (x == null ? '—' : (+x).toFixed(d));
const sec = (t) => Math.floor(t / 1000);
// ── 초 표 — /perf 초(P)와 호스트 초(S)를 벽시계 초로 맞춘다
const bySec = new Map();
const at = (t) => { const k = sec(t); if (!bySec.has(k)) bySec.set(k, { t: k }); return bySec.get(k); };
for (const p of P) Object.assign(at(p.t), { p });
for (const s of S) Object.assign(at(s.t), { s });
const gcSec = G.filter((g) => g.ts && g.ms != null && !g.debt).map((g) => ({ k: sec(Date.parse(g.ts)), ms: g.ms, src: g.src }));
const rows = [...bySec.values()].filter((r) => r.p && r.p.tick).sort((a, b) => a.t - b.t);
const dsk = (r) => { let kb = 0, ms = 0; for (const d of Object.values((r.s && r.s.disk) || {})) { kb += d.wKB || 0; ms += d.wMs || 0; } return { kb, ms }; };
const kbP95 = q(rows.map((r) => dsk(r).kb), 0.95) || 0;
const spike = (r) => (r.p.loop && r.p.loop.max >= 50) || (r.p.tick && r.p.tick.max >= 33) || r.p.q >= 50;
const ev = (r, kind, min = 0) => (r.p.ev || []).some((e) => e.kind === kind && e.ms >= min);
const F = {
  steal: (r) => !!(r.s && r.s.cpu.steal >= 5),
  busy: (r) => !!(r.s && (r.s.cpu.user + r.s.cpu.sys + r.s.cpu.steal) >= 90),
  gc: (r) => gcSec.some((g) => Math.abs(g.k - r.t) <= 1),
  disk: (r) => { const d = dsk(r); return (d.kb >= kbP95 && d.kb > 0) || d.ms >= 50 || ev(r, 'save', 5); },
  central: (r) => !!(r.s && r.s.c && r.s.c.cpu >= 30),
  econ: (r) => ev(r, 'econ_frame') || ev(r, 'econ_day'),
};
const sp = rows.filter(spike), nm = rows.filter((r) => !spike(r));
const rate = (a, f) => (a.length ? a.filter(f).length / a.length : 0);
const cand = Object.entries(F).map(([k, f]) => { const a = rate(sp, f), b = rate(nm, f); return { k, spike: +(100 * a).toFixed(1), normal: +(100 * b).toFixed(1), lift: b > 0 ? +(a / b).toFixed(2) : (a > 0 ? Infinity : null), n: sp.filter(f).length }; });
const owner = cand.filter((c) => c.spike >= 30 && (c.lift === Infinity || c.lift >= 2)).sort((a, b) => (b.lift === Infinity ? 1e9 : b.lift) - (a.lift === Infinity ? 1e9 : a.lift))[0] || null;
// ── 요약 수
const loopMax = rows.map((r) => r.p.loop && r.p.loop.max), tickMax = rows.map((r) => r.p.tick.max), tickP95 = rows.map((r) => r.p.tick.p95), qs = rows.map((r) => r.p.q);
const steal = S.map((s) => s.cpu.steal), busy = S.map((s) => s.cpu.user + s.cpu.sys + s.cpu.steal), zc = S.map((s) => s.z && s.z.cpu), cc = S.map((s) => s.c && s.c.cpu);
const evCount = {}; for (const p of P) for (const e of (p.ev || [])) { const o = evCount[e.kind] || (evCount[e.kind] = { n: 0, max: 0 }); o.n++; o.max = Math.max(o.max, e.ms); }
const rtts = [], retr = []; let loN = 0; for (const w of W) for (const s of (w.socks || [])) { if (s.lo) { loN++; continue; } if (s.rtt != null) rtts.push(s.rtt); retr.push(s.retrans || 0); }   // ★되돌이(수집기 자신)는 뺀다
const out = {
  meta: { start: meta.start, mode: meta.mode, zone: meta.zone, ncpu: meta.ncpu, kernel: meta.kernel, secret: pmeta.secret, reset: pmeta.reset, seconds: rows.length, host: S.length },
  server: {
    loop: { p50: q(rows.map((r) => r.p.loop && r.p.loop.p50), 0.5), p95ofP95: q(rows.map((r) => r.p.loop && r.p.loop.p95), 0.95), maxMed: q(loopMax, 0.5), maxP95: q(loopMax, 0.95), max: q(loopMax, 1) },
    tick: { p50: q(rows.map((r) => r.p.tick.p50), 0.5), p95: q(tickP95, 0.5), maxP95: q(tickMax, 0.95), max: q(tickMax, 1), over33: tickMax.filter((x) => x >= 33).length },
    q: { p50: q(qs, 0.5), p95: q(qs, 0.95), max: q(qs, 1) },
    cpu: { stealP50: q(steal, 0.5), stealP95: q(steal, 0.95), stealMax: q(steal, 1), busyP50: q(busy, 0.5), busyP95: q(busy, 0.95), zoneP50: q(zc, 0.5), zoneP95: q(zc, 0.95), centralP50: q(cc, 0.5), centralP95: q(cc, 0.95) },
    rssMB: { zone: q(S.map((s) => s.z && s.z.rssMB), 1), central: q(S.map((s) => s.c && s.c.rssMB), 1) },
    disk: { kbP50: q(rows.map((r) => dsk(r).kb), 0.5), kbP95: kbP95, kbMax: q(rows.map((r) => dsk(r).kb), 1), wMsMax: q(rows.map((r) => dsk(r).ms), 1) },
    gc: { n: gcSec.length, maxMs: gcSec.length ? Math.max(...gcSec.map((g) => g.ms)) : 0, zone: gcSec.filter((g) => g.src === 'zone').length, central: gcSec.filter((g) => g.src === 'central').length, debt: G.filter((g) => g.debt).length },
    events: evCount,
    sock: { n: rtts.length, lo: loN, rttP50: q(rtts, 0.5), rttP95: q(rtts, 0.95), rttMax: q(rtts, 1), retransMax: retr.length ? Math.max(...retr) : 0 },
  },
  spikes: { n: sp.length, of: rows.length, list: sp.slice(0, 40).map((r) => ({ t: new Date(r.t * 1000).toISOString().slice(11, 19), loopMax: r.p.loop && r.p.loop.max, tickMax: r.p.tick.max, q: r.p.q,
    steal: r.s && r.s.cpu.steal, busy: r.s && +(r.s.cpu.user + r.s.cpu.sys + r.s.cpu.steal).toFixed(1), central: r.s && r.s.c && r.s.c.cpu, diskKB: dsk(r).kb,
    ev: (r.p.ev || []).map((e) => `${e.kind}:${e.ms}`).join(' '), on: Object.entries(F).filter(([, f]) => f(r)).map(([k]) => k).join(',') })) },
  candidates: cand, owner: owner ? owner.k : null,
  //   스파이크 초의 모양 — 틱 본문이 막았나(틱 max ≥ 33) · 틱 **밖**에서 루프가 막혔나(틱은 멀쩡한데 루프 max ≥ 50 — 타이머 일·작은 GC·I/O 콜백)
  shape: { inTick: sp.filter((r) => r.p.tick.max >= 33).length, outTick: sp.filter((r) => r.p.tick.max < 33 && r.p.loop && r.p.loop.max >= 50).length,
           noCand: sp.filter((r) => !Object.values(F).some((f) => f(r))).length },
};
if (FRAME) {
  const fr = JSON.parse(fs.readFileSync(FRAME, 'utf8'));
  out.client = { at: fr.at, ua: fr.ua, frames: fr.frames, pong: { n: fr.pong.n, split: fr.pong.split, rtt: fr.pong.rtt, net: fr.pong.net, srv: fr.pong.srv }, verdict: fr.verdict, longTop: (fr.longFrames || []).slice().sort((a, b) => b.dt - a.dt).slice(0, 10) };
}
if (!MD) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const s = out.server, Lm = [];
Lm.push(`**${out.meta.mode} · ${out.meta.zone} · ${out.meta.start} · ${out.meta.seconds}초 · vCPU ${out.meta.ncpu} · 창 영점 ${out.meta.reset ? '○' : '✗'}**`, '');
Lm.push('| 칸 | 값 |', '|---|---|');
Lm.push(`| 루프 지연(해상도 10ms 포함) | p50 ${f1(s.loop.p50)} · 초별 max 중앙 ${f1(s.loop.maxMed)} · p95 ${f1(s.loop.maxP95)} · 최대 ${f1(s.loop.max)} ms |`);
Lm.push(`| 틱 본문 | p50 ${f1(s.tick.p50, 2)} · p95 ${f1(s.tick.p95, 2)} · 초별 max p95 ${f1(s.tick.maxP95)} · 최대 ${f1(s.tick.max)} ms · 33ms 넘은 초 ${s.tick.over33} |`);
Lm.push(`| \`/perf\` 왕복 q(pong 과 같은 줄) | p50 ${s.q.p50} · p95 ${s.q.p95} · 최대 ${s.q.max} ms |`);
Lm.push(`| CPU(상자) | steal p50 ${f1(s.cpu.stealP50)} · p95 ${f1(s.cpu.stealP95)} · 최대 ${f1(s.cpu.stealMax)} % · 바쁨(user+sys+steal) p50 ${f1(s.cpu.busyP50)} · p95 ${f1(s.cpu.busyP95)} % |`);
Lm.push(`| CPU(프로세스 · 한 코어의 %) | 존 p50 ${f1(s.cpu.zoneP50)} · p95 ${f1(s.cpu.zoneP95)} · 중앙 p50 ${f1(s.cpu.centralP50)} · p95 ${f1(s.cpu.centralP95)} |`);
Lm.push(`| RSS 최대 | 존 ${s.rssMB.zone} MB · 중앙 ${s.rssMB.central} MB |`);
Lm.push(`| 디스크 쓰기 | 초당 KB p50 ${s.disk.kbP50} · p95 ${s.disk.kbP95} · 최대 ${s.disk.kbMax} · 쓰기 ms 최대 ${s.disk.wMsMax} |`);
Lm.push(`| GC 정지(>30ms) | ${s.gc.n}번(존 ${s.gc.zone} · 중앙 ${s.gc.central}) · 최대 ${s.gc.maxMs} ms · 틱 빚 버림 ${s.gc.debt} |`);
Lm.push(`| 사건 링 | ${Object.entries(s.events).map(([k, v]) => `${k} ${v.n}번(최대 ${v.max}ms)`).join(' · ') || '없음'} |`);
Lm.push(`| 소켓(5초 · 되돌이 ${s.sock.lo} 뺌) | ${s.sock.n ? `rtt p50 ${s.sock.rttP50} · p95 ${s.sock.rttP95} · 최대 ${s.sock.rttMax} ms · 재전송 최대 ${s.sock.retransMax}` : '연결 0'} |`);
Lm.push('', `스파이크 초 **${out.spikes.n} / ${out.spikes.of}**`, '', '| 후보 | 스파이크 초에서 % | 평소 초에서 % | 들어 올림 | 초 |', '|---|---:|---:|---:|---:|');
for (const c of out.candidates) Lm.push(`| ${c.k} | ${c.spike} | ${c.normal} | ${c.lift === Infinity ? '∞' : f1(c.lift, 2)} | ${c.n} |`);
Lm.push('', `주인(기준: 스파이크 ≥ 30% · 들어 올림 ≥ 2): **${out.owner || '없음 — 틱 본문 자체'}**`);
Lm.push(`스파이크 초의 모양: 틱 본문이 막음 ${out.shape.inTick} · **틱 밖**에서 루프가 막힘 ${out.shape.outTick} · 후보 하나도 안 켜진 초 ${out.shape.noCand}`);
if (out.client) {
  const c = out.client;
  Lm.push('', `**클라 ${c.at} · ${c.ua.slice(0, 60)}**`, '', '| 칸 | 값 |', '|---|---|');
  Lm.push(`| 프레임 | ${c.frames.fps} fps · p50 ${c.frames.p50} · p95 ${c.frames.p95} · max ${c.frames.max} ms · 긴 프레임 >50ms ${c.frames.long50} · >100ms ${c.frames.long100} |`);
  Lm.push(`| 60초 몫(ms) | 렌더 ${c.frames.sum.render} · 메시지 ${c.frames.sum.msg} · 지면 ${c.frames.sum.tile} · 물 ${c.frames.sum.water} · 산 ${c.frames.sum.mt} · 자연물 ${c.frames.sum.nat} (전체 ${c.frames.sum.dt}) |`);
  Lm.push(`| 핑 | rtt p50 ${c.pong.rtt.p50} · p95 ${c.pong.rtt.p95} · max ${c.pong.rtt.max} · 셋 실린 pong ${c.pong.split}/${c.pong.n} · 망 p95 ${c.pong.net.p95} · 서버 p95 ${c.pong.srv.p95} |`);
  Lm.push(`| 튄 핑 판정 | ${c.verdict.spikes}번 = 클라 ${c.verdict.client} · 서버 ${c.verdict.server} · 망 ${c.verdict.net} · 미상 ${c.verdict.unknown} |`);
}
console.log(Lm.join('\n'));
