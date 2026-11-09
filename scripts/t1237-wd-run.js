#!/usr/bin/env node
'use strict';
// === scripts/t1237-wd-run.js — [T1237] 고라니 켬 · 끔 실존 판(한반도 존 한 프로세스 · 벽시계) — 몹 수 · 사냥 · µs ================
//
// 쓰는 법: node scripts/t1237-wd-run.js [초=60] [사냥초=60]   (임시 DB · 임시 포트 · 라이브 무접촉 · 자식은 차례로 하나씩 — 동시 0)
//   환경 `T1237_RUN_VIL=0` 이면 마을 끔(기본 = 마을 켬 · 실서버 꼴).
//
// 판 = 자리 셋 × 손잡이 둘(`T1237_WATER_DEER` 끔 · 켬) = 자식 여섯. 자리는 부모가 고른다(결정론 — 같은 표본 · 같은 차례):
//   · far = 물가(`chunk._wildClass` 'riverside') 표본 가운데 가장 가까운 마을이 400칸(= 400 m) 넘게 먼 첫 자리(마을 완충 MOB_AV0 100 m 밖 — 뷰 전부가 서식 후보)
//   · mix = 가장 가까운 마을이 250칸 넘는 물가 표본 가운데 둘레 ±48칸(4칸 격자 25×25)의 숲 · 물가 표본 수의 작은 쪽이 가장 큰 자리
//           (강이 숲을 지나는 곳 — 첫 판(사슴 · 멧돼지 · 토끼)과 고라니가 한 뷰에 같이 선다 · 서로 밀어내나)
//   · mid = 가장 가까운 마을이 130 ~ 170칸인 첫 물가 자리(뷰가 그 마을 완충 100 m 에 걸친다 — 완충 칸이 빠지는지)
//   표본 = 24칸(768 px) 격자의 칸 가운데(새 수 0 — 고르기만 · 판정에 안 쓴다).
// 단계: warm(관측자가 선 뒤 15초 — 훑기) → steady(초) → player(초÷2 — 사람 하나가 자리에 가만히 · 위협 1) → hunt(켬 · far · mix 만 — 사냥초).
// 자식 하나 = 존을 띄우고(`server/zone.js` 그대로 · 30 Hz 벽시계 틱) 관측자 하나를 그 자리에 둔다(사람 0 — 위협 0 · 몹 수 · µs 판).
//   `Wildlife.tick` 을 감싸 틱마다 걸린 µs 를 잰다(감싼 것은 시각만 — 인자 · 반환 그대로). 1초마다 몹 수(첫 판 랩 종별 · 고라니 둘째 상태 · 존 몹 표).
//   켬 판은 이어서 사람 하나가 그 뷰의 고라니를 차례로 잡는다(2초마다 가장 가까운 한 마리 곁 20 px 로 옮겨 진짜 `tryAttack` → 진짜 `butcherCorpse` —
//   주검 종 · 고기 · 가죽 · 알림 글자 · 그 뒤 몇 틱 만에 마릿수가 돌아오나 · 지역 절멸이 나나). 치기는 사람 쿨다운(500 ms)을 지켜 0.55초마다 한 번 ·
//   칠 때마다 그 짐승 곁으로 다시 옮긴다(맞으면 튄다 — 쫓아가 붙은 사냥꾼). ⚠한 틱 안에 거듭 치면 존 공간 색인(틱 머리에만 다시 짓는다)에 남은
//   죽은 몹을 또 잡아 주검이 겹으로 선다 — 이 판이 처음 그렇게 돌다 찾았다(보고 §6 · 회부 · `scripts/t1237-same-tick-kill.js`).
// 보고 표의 재료만 낸다(판정 0) — 끝에 JSON 한 줄(`T1237_RUN_OUT` 파일)과 표.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T1237_RUN_MODE || '';

if (MODE) child(); else parent();

// ───────────────────────────────────────── 자식: 존 한 프로세스 ─────────────────────────────────────────
function child() {
  const OUT = process.env.T1237_RUN_OUT;
  const SEC = +process.env.T1237_RUN_SEC || 60, HUNT = +process.env.T1237_RUN_HUNT || 0, WARM = +process.env.T1237_RUN_WARM || 15, STILL = Math.round(SEC / 2);
  const [SX, SY] = process.env.T1237_RUN_SPOT.split(',').map(Number);
  Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: process.env.T1237_RUN_DB, ENABLE_WILDLIFE: '1', ENABLE_BANDITS: '0', LATENCY_MS: '0', T1065_TOOL_GATE: '0' });
  const logs = [];
  const keep = (a) => { const s = a.map(String).join(' '); if (/🐾 mobs=|wildlife ON|wildlife tick 오류/.test(s) && logs.length < 400) logs.push(s.slice(0, 400)); };
  console.log = (...a) => keep(a); console.warn = () => {}; console.error = (...a) => keep(a);
  const tb = process.hrtime.bigint();
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const bootMs = Number(process.hrtime.bigint() - tb) / 1e6;
  const H = Zone.__testBind();
  const W = require(path.join(ROOT, 'server', 'wildlife.js'));
  const D = W._debug;
  // µs 감싸기 — 존은 `Wildlife.tick(now)` 를 부를 때마다 모듈 객체에서 찾는다(같은 객체) → 감싼 것이 불린다
  const us = [];   // [단계, µs]
  let phase = 'pre';
  const orig = W.tick;
  // 환경 `T1237_RUN_TRACE=1` — 3 ms 넘은 틱마다 그때의 훑기 · 서식 · 마릿수(읽기만) + GC 멈춤(perf_hooks · 5 ms 넘는 것) — 튄 틱의 까닭 찾기
  const TRACE = process.env.T1237_RUN_TRACE === '1', trace = [], gcs = [], T0 = Date.now();
  if (TRACE) { try { const { PerformanceObserver, performance } = require('perf_hooks'); const o = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 5) gcs.push([Math.round(performance.timeOrigin + e.startTime - T0), +e.duration.toFixed(1), e.detail && e.detail.kind]); }); o.observe({ entryTypes: ['gc'] }); } catch (e) {} }
  W.tick = function (now) {
    const t = process.hrtime.bigint(), w0 = TRACE ? { sc: D.t1237.scanned, hb: D.t1237.habitat, sw: D.SW ? D.SW.mobs.length : 0, s1: D.S.mobs.length, vf: (D.S._vf || []).length, sh: (D.S.huntCells || []).length } : null;
    try { return orig.call(this, now); } finally {
      const u = Number(process.hrtime.bigint() - t) / 1000; us.push([phase, u]);
      if (TRACE && u > 3000 && trace.length < 400) trace.push({ at: Date.now() - T0, ph: phase, us: Math.round(u), before: w0,
        after: { sc: D.t1237.scanned, hb: D.t1237.habitat, sw: D.SW ? D.SW.mobs.length : 0, s1: D.S.mobs.length, vf: (D.S._vf || []).length, sh: (D.S.huntCells || []).length } });
    }
  };
  const res = { knob: process.env.T1237_WATER_DEER === '1', vil: process.env.ENABLE_VILLAGES !== '0', spot: [SX, SY], bootMs: Math.round(bootMs), samples: [], kills: [], notes: [], logs };
  // 관측자(가짜 ws — 틱 방송을 받기만) — 마지막 본 때를 5초마다 새로(존의 30초 좀비 정리에 안 걸리게)
  const net = {};   // 단계 → [틱 방송 수, 바이트] — 관측자 하나가 받는 틱 글(AOI 몹 칸 — 고라니가 서면 늘어나는 몫)
  const obsWs = { readyState: 1, bufferedAmount: 0, send(str) { if (typeof str === 'string' && str.startsWith('{"type":"tick"')) { const a = net[phase] || (net[phase] = [0, 0]); a[0]++; a[1] += Buffer.byteLength(str); } }, close() {}, terminate() {} };
  const sample = (tag) => {
    const S = D.S, SW = D.SW, lab = {};
    for (const m of S.mobs) if (m.st !== 'dead') lab[m.type] = (lab[m.type] || 0) + 1;
    let wd = 0, wdDead = 0; const st = {};
    if (SW) for (const m of SW.mobs) { if (m._t1237Sentinel) continue; if (m.st === 'dead') { wdDead++; continue; } wd++; st[m.st] = (st[m.st] || 0) + 1; }
    const zone = {}; let shadows = 0, ps = {};
    for (const m of H.mobs.values()) { zone[m.type] = (zone[m.type] || 0) + 1; if (m.isWild) { shadows++; if (m.type === 'water_deer') ps[m._ps | 0] = (ps[m._ps | 0] || 0) + 1; } }
    res.samples.push({ t: tag, ph: phase, lab, wd, wdDead, wdSt: st, zoneMobs: H.mobs.size, shadows, zone, ps,
      hab1: (S._vf || []).length, hab1All: (S.huntCells || []).length, t1237: Object.assign({}, D.t1237), corpses: H.corpses.size, wlTicks: D.stats.ticks });
  };
  // 환경 `T1237_RUN_PROF=<단계>` — 그 단계 동안 CPU 표본(inspector · 1 ms) → `<OUT>.cpuprofile`(튄 틱의 함수 찾기 · 읽기만)
  const PROF = process.env.T1237_RUN_PROF || '';
  let prof = null, profOn = false;
  if (PROF) { const insp = require('inspector'); prof = new insp.Session(); prof.connect(); prof.post('Profiler.enable'); prof.post('Profiler.setSamplingInterval', { interval: 1000 }); }
  const profPhase = () => {
    if (!prof) return;
    if (!profOn && phase === PROF) { profOn = true; prof.post('Profiler.start'); }
  };
  let t = 0;
  function step() {
    t++;
    const ob = H.observers.get(obsWs); if (ob) ob.lastSeen = Date.now();
    if (t === 1) { H.observers.set(obsWs, { viewerX: SX, viewerY: SY, lastSeen: Date.now() }); phase = 'warm'; }
    if (t === 1 + WARM) phase = 'steady';
    if (t === 1 + WARM + SEC) { phase = 'player'; p.x = SX; p.y = SY; H.players.set(p.pid, p); }   // 사람 하나 — 자리에 가만히(두 손잡이 같은 일)
    profPhase();
    if (phase !== 'pre') sample(t);
    if (t === 1 + WARM + SEC + STILL) {
      if (HUNT && res.knob) return hunt();
      return done();
    }
    setTimeout(step, 1000);
  }
  // 사냥 판 — 사람 하나(관측자 자리에서 시작) · 2초마다 가장 가까운 고라니 하나를 잡아 손질
  const notes = [];
  var p = { pid: 't1237p', playerId: 't1237_hunter', name: '사냥꾼', persistent: false, ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } },
    x: SX, y: SY, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: {}, toolItems: [], equipment: [], equipSlots: {}, equipped: null, hotkey1: null,
    tribeId: null, tribeName: null, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {}, isNpc: false, isDown: false, vx: 0, vy: 0, lastAttackAt: 0, lastRangedAt: 0, vp: 0 };
  let ht = 0;
  function hunt() {
    phase = 'hunt';
    const hstep = async () => {
      ht++;
      const ob = H.observers.get(obsWs); if (ob) ob.lastSeen = Date.now();
      if (ht % 2 === 0) {
        let best = null, bd = Infinity;
        for (const m of H.mobs.values()) if (m.isWild && m.type === 'water_deer') { const d = Math.hypot(m.x - SX, m.y - SY); if (d < bd) { bd = d; best = m; } }
        if (best) {
          const n0 = notes.length, hp0 = best.hp, mid = best.mid, wd0 = res.samples.length ? res.samples[res.samples.length - 1].wd : -1;
          let hits = 0;
          for (let i = 0; i < 6 && H.mobs.has(mid); i++) {
            const m = H.mobs.get(mid); p.x = m.x - 20; p.y = m.y; p.vx = 0; p.vy = 0;   // 붙는다(맞은 짐승은 튄다 — 쫓아가 다시 붙은 자리)
            await H.tryAttack(p); hits++;
            await new Promise((r) => setTimeout(r, 550));                                    // 사람 쿨다운 500 ms 를 지킨다(틱 여럿이 지난다)
          }
          const dead = !H.mobs.has(mid);
          let corpse = null; for (const c of H.corpses.values()) if (c.mobType === 'water_deer' && c.killerPid === p.playerId && !c._t1237Seen) { corpse = c; }
          let inv = null;
          if (corpse) { corpse._t1237Seen = 1; const before = Object.assign({}, p.inventory); p.x = corpse.x; p.y = corpse.y; H.butcherCorpse(p, corpse.cid);
            inv = {}; for (const k of Object.keys(p.inventory)) { const d2 = (p.inventory[k] || 0) - (before[k] || 0); if (d2) inv[k] = d2; } }
          res.kills.push({ ht, mid, hp0, hits, dead, dist: Math.round(bd), corpse: corpse ? { type: corpse.mobType, drops: corpse.drops } : null, inv, wdBefore: wd0, notes: notes.slice(n0) });
          p.x = SX; p.y = SY;   // 자리로 돌아온다(뷰 가운데)
        } else res.kills.push({ ht, none: true });
      }
      sample('h' + ht);
      if (ht >= HUNT) return done();
      setTimeout(hstep, 1000);
    };
    setTimeout(hstep, 1000);
  }
  function done() {
    if (prof && profOn) { prof.post('Profiler.stop', (err, r) => { try { fs.writeFileSync(OUT + '.cpuprofile', JSON.stringify(r.profile)); } catch (e) {} prof = null; done(); }); return; }
    const by = {};
    for (const [ph, v] of us) (by[ph] || (by[ph] = [])).push(v);
    const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
    res.us = {};
    for (const [ph, a] of Object.entries(by)) res.us[ph] = { n: a.length, mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p50: +q(a, 0.5).toFixed(1), p95: +q(a, 0.95).toFixed(1), p99: +q(a, 0.99).toFixed(1), max: +Math.max(...a).toFixed(1) };
    res.t1237 = Object.assign({}, D.t1237);
    res.notes = notes;
    if (TRACE) { res.trace = trace; res.gcs = gcs; }
    res.net = net;
    fs.writeFileSync(OUT, JSON.stringify(res));
    process.kill(process.pid, 'SIGKILL');
  }
  setTimeout(step, 3000);   // 존 부팅 뒤 3초(마을 · 길 비동기 준비) — 관측자는 그 뒤에 선다
}

// ───────────────────────────────────────── 부모: 자리 고르기 · 판 넷 차례로 ─────────────────────────────────────────
function parent() {
  const { spawnSync } = require('child_process');
  const SEC = +(process.argv[2] || 60), HUNT = +(process.argv[3] || 60);
  const C = require(path.join(ROOT, 'server', 'chunk.js'));
  const V = require(path.join(ROOT, 'server', 'hanbando-terrain.json')).hanbando.villages;
  const W = 70016, Hh = 130016, st = 32 * 24;
  const nearV = (x, y) => { let b = Infinity; for (const v of V) { const d = Math.hypot(v.x - x, v.y - y); if (d < b) b = d; } return b / 32; };
  let far = null, mid = null, mix = null, mixK = -1;
  for (let y = st / 2; y < Hh; y += st) for (let x = st / 2; x < W; x += st) {
    if (C._wildClass('hanbando', x, y) !== 'riverside') continue;
    const d = nearV(x, y);
    if (!far && d > 400) far = [x, y, Math.round(d)];
    if (!mid && d >= 130 && d <= 170) mid = [x, y, Math.round(d)];
    if (d > 250) {
      let f = 0, r = 0;
      for (let dy = -1536; dy <= 1536; dy += 128) for (let dx = -1536; dx <= 1536; dx += 128) { const c = C._wildClass('hanbando', x + dx, y + dy); if (c === 'forest') f++; else if (c === 'riverside') r++; }
      if (Math.min(f, r) > mixK) { mixK = Math.min(f, r); mix = [x, y, Math.round(d), f, r]; }
    }
  }
  console.log(`자리: far ${JSON.stringify(far)} · mix ${JSON.stringify(mix)} · mid ${JSON.stringify(mid)}  (px · px · 가장 가까운 마을 칸 [· 숲 · 물가 표본 /625])`);
  const TMPD = fs.mkdtempSync('/tmp/t1237-run-');
  let port = 38700 + (process.pid % 12) * 4;
  const all = {};
  const only = process.env.T1237_RUN_ONLY || '';
  for (const [name, spot] of [['far', far], ['mix', mix], ['mid', mid]]) for (const knob of ['0', '1']) {
    const key = `${name}-${knob === '1' ? 'on' : 'off'}`;
    if (only && !only.split(',').includes(key)) continue;
    const db = path.join(TMPD, `${key}.db`), out = path.join(TMPD, `${key}.json`);
    const env = Object.assign({}, process.env, { T1237_RUN_MODE: 'run', T1237_RUN_DB: db, T1237_RUN_OUT: out, PORT: String(port++),
      T1237_RUN_SPOT: `${spot[0]},${spot[1]}`, T1237_RUN_SEC: String(SEC), T1237_RUN_HUNT: String(name !== 'mid' ? HUNT : 0), T1237_WATER_DEER: knob });
    if (process.env.T1237_RUN_VIL === '0') env.ENABLE_VILLAGES = '0';
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', timeout: (SEC + HUNT + 240) * 1000, maxBuffer: 64 << 20 });
    let j = null; try { j = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
    if (!j) { console.log(`✗ ${key}: 결과 없음 status=${r.status} signal=${r.signal}\n${(r.stderr || '').slice(-2000)}`); continue; }
    j.wallS = Math.round((Date.now() - t0) / 1000);
    all[key] = j;
    fs.writeFileSync(path.join(TMPD, 'all.json'), JSON.stringify(all));
    console.log(`… ${key} 끝 (${j.wallS}초 · 부팅 ${j.bootMs} ms)`);
  }
  const outAll = process.env.T1237_RUN_SAVE || path.join(TMPD, 'all.json');
  fs.writeFileSync(outAll, JSON.stringify({ far, mid, sec: SEC, hunt: HUNT, runs: all }));
  console.log(`JSON → ${outAll}`);
}
