#!/usr/bin/env node
// === scripts/t334-wood-day.js — 마을 예산의 값: 첫날 등가 · 30일 나무 곡선 · 존 틱 (T334 ②) =====
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// ★왜 — T325 는 셀 예산으로 **한 그루도 못 벴다**. PM 이 분모를 마을로 내렸으니(T334 ①) 이제 물을 것 셋:
//     ⓐ **첫날 합이 수식과 같은가** — 오차는 정의상 마을마다 **한 그루 미만**이어야 한다(카드 ②)
//     ⓑ **30일 뒤 나무가 남아 있는가** — 개체 수 곡선(T122 재생이 하루 벌목을 따라오나)
//     ⓒ **존 틱** — 나무꾼 팔 p50/p95 + **사람당 µs**(T333 표에 얹는 한 줄)
//   자는 `scripts/t325-wood-perf.js`(그 앞은 T316 · T284 `war-world-perf`) **그 자**이고,
//   창을 **하루 경계마다** 읽어 곡선으로 만든 것만 다르다.
//
// ★"3시드" 에 대하여 — **존의 세계 씨는 `hashStr(zoneId)` 다**(`chunk.js seedRand`). 그래서 같은 지도에서
//   씨를 바꿀 수가 없다(다른 존은 다른 지도이고, `nippon` 은 지금 진단 중이다 — T336).
//   ⇒ 이 자는 **틀 나이가 다른 세 판**(`T334_WARMS`)으로 세 세계를 만든다. 한 판의 우연이 아님을 그렇게 본다.
//   `t176-ab` 의 3시드(1020·7·42)는 **끔 팔**에만 댈 수 있다(그 자는 `villages.js` 를 안 지난다 — T312 §④).
//
// 실행: node scripts/t334-wood-day.js [out.json]
//   T334_WARMS="45,60,75" · DAYS(기본 30) · DAY_MS(기본 6000)
//   T334_KEEP_DB=<폴더>  … [T398] 틀 끝(켠 팔이 받는 세계) · 켠 팔 끝 DB 를 남긴다(자가 영토·고리를 잰다)
//   T334_FROM=<폴더>     … [T398] 틀을 굽지 않고 남겨 둔 틀에서 켠 팔만(두 팔을 같은 세계에서 짝으로)
//   T334_PORTS="CP,ZP" · T334_LOGSFX=-sq … [T398] 두 팔을 나란히(자리 · 로그 이름만 가른다)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// ★[T475] `T334_ROOT` — 서버 코드 자리(베이스 워크트리를 **같은 자**로 잰다 · T347 자 `T347_ROOT` 와 같은 꼴). 없으면 이 레포.
const ROOT = process.env.T334_ROOT ? path.resolve(process.env.T334_ROOT) : path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t334/wood-day.json';
const WARMS = (process.env.T334_WARMS || '45,60,75').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
const DAYS = parseInt(process.env.DAYS || '30', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '6000', 10);
// ★[T475] 틀 굽는 하루 — 기본은 종전 그대로(`max(1200, DAY_MS/4)`). 켠 팔 하루를 늘려도 틀은 빨리 굽는다(T347 자 `WARM_DAY_MS` 와 같은 꼴).
const WARM_DAY_MS = parseInt(process.env.WARM_DAY_MS || String(Math.max(1200, Math.floor(DAY_MS / 4))), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

// ── ★[T475] 요약 — 이 자가 남긴 JSON 을 읽기만 한다(세계를 안 세운다 · 새 자 0) ─────────────────────────
//   node scripts/t334-wood-day.js --summary <팔 이름>=<a.json> …
//   마을·하루(행위 마을 행)마다: 수식 `D` = `_woodOutLast`(`f`) · 그날 남은 수요 `dem`(`_lifeDaily` 머리 — 헤드리스는 `D` 그대로면 두 시계가 하나) ·
//   세계 비용 = 벤 그루 × w̄ · 곳간(추정) = min(세계 비용, dem) — 곳간 입구가 수요에서 자른다(T374) · 한도 = 걸음이 허락한 그루(`cap`).
//   ⇒ 비(세계) = Σ 세계 비용 ÷ Σ D(T334·T374 의 "입고/수식") · 비(곳간) = Σ 곳간 ÷ Σ D · 한도 모자람 = cap × w̄ < D 인 마을·날.
if (process.argv[2] === '--summary') {
  const arms = process.argv.slice(3).map((a) => { const i = a.indexOf('='); return i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [path.basename(a), a]; });
  say(['팔', '판', '날', '행위 마을', '나무 시작→끝', '벤 그루', '세계 비용(단)', '수식 D(단)', '비(세계) %', '곳간 추정(단)', '비(곳간) %',
    '입고/수식(누계) %', 'dem=D', '한도 0 마을·날', '한도 < D 마을·날', '멈춤 마을·날', '마을·날'].join(' | '));
  for (const [nm, f] of arms) {
    let J = null; try { J = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { say(`${nm} | 못 읽음 ${f}`); continue; }
    for (const [tag, r] of Object.entries(J.runs || {})) {
      const cv = r.curve || []; if (!cv.length) continue;
      let cut = 0, world = 0, D = 0, gran = 0, al = 0, alN = 0, cap0 = 0, capLow = 0, stop = 0, vd = 0, form = 0;
      for (const d of cv) {
        form += d.formula || 0;
        for (const q of (d.rows || [])) {
          vd++; const w = (q.cut || 0) * (q.wBar || 0), Dq = q.f || 0, dem = (typeof q.dem === 'number' && q.dem >= 0) ? q.dem : Dq;
          cut += q.cut || 0; world += w; D += Dq; gran += Math.min(w, dem);
          if (typeof q.dem === 'number' && q.dem >= 0 && !(q.walked > 0)) { alN++; if (Math.abs(q.dem - Dq) <= 1e-3 * Math.max(1, Dq)) al++; }
          if (!(q.cap > 0)) cap0++; else if (q.cap * (q.wBar || 0) < Dq) capLow++;
          if (q.stop) stop++;
        }
      }
      const last = cv[cv.length - 1], dl = last.delivered || 0;   // 누계 입고(`_t325Deliv` 합 — 켠 팔 부팅부터 · 헤드리스는 세계 비용)
      say([nm, tag, cv.length, `${cv[0].act}→${last.act}`, `${cv[0].trees}→${last.trees}`, cut, world.toFixed(1), D.toFixed(1), D > 0 ? (100 * world / D).toFixed(1) : '—',
        gran.toFixed(1), D > 0 ? (100 * gran / D).toFixed(1) : '—', form > 0 ? (100 * dl / form).toFixed(1) : '—', `${al}/${alN}`, cap0, capLow, stop, vd].join(' | '));
    }
  }
  process.exit(0);
}

function boot(tag, zenv) {
  const SECRET = 't334-' + tag;
  //   ★[T398] `T334_PORTS="CP,ZP"` — 두 팔을 나란히 돌릴 때 자리를 가른다(기본 3830·3840 그대로)
  const _pp = String(process.env.T334_PORTS || '').split(',').map((x) => parseInt(x, 10));
  const CP = _pp[0] > 0 ? _pp[0] : 3830, ZP = _pp[1] > 0 ? _pp[1] : 3840;
  const logf = fs.openSync(`/tmp/t334/${tag}${process.env.T334_LOGSFX || ''}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t334/c-${tag}${process.env.T334_LOGSFX || ''}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
  const perf = async (reset) => { try { const r = await fetch(`http://localhost:${ZP}/perf${reset ? '?reset=1' : ''}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  return { z, perf, health, kill };
}
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
const popOf = (p) => (p && p.wood && p.wood.popAll) || null;

(async () => {
  const res = { at: new Date().toISOString(), host: { cpus: require('os').cpus().length }, WARMS, DAYS, DAY_MS, runs: {} };
  for (const warm of WARMS) {
    const tag = 'w' + warm, db = `/tmp/t334/z-${tag}${process.env.T334_LOGSFX || ''}.db`;
    rmdb(db);
    //   ★[T398] `T334_FROM=<폴더>` — 틀을 **굽지 않고** 남겨 둔 틀(`<tag>-warm.db`)에서 켠 팔만 돈다.
    //     두 팔(네모 · 고리)을 **같은 세계**에서 갈라 짝으로 재려고(틀은 벽시계 지터로 판마다 다르다 — T341 §3).
    const FROM = process.env.T334_FROM || '';
    let d = 0;
    if (FROM) {
      for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(path.join(FROM, `${tag}-warm.db${s}`), db + s); } catch (e) {} }
      say(`\n판 ${warm}일 — 틀은 남겨 둔 것(${FROM}/${tag}-warm.db)`);
    } else {
    // ── 틀 — **끈 팔로** 굽는다(켠 팔이 그 세계에서 갈라지게). 굽는 동안은 손잡이가 없다.
    say(`\n판 ${warm}일 — 틀 굽기(끈 팔)`);
    const b0 = boot(tag + '-warm', { DB_PATH: db, VILLAGE_DAY_MS: String(WARM_DAY_MS) });
    for (let i = 0; i < 900 && !(await b0.health()); i++) await sleep(1000);
    const t0 = Date.now();
    while (d < warm && Date.now() - t0 < 45 * 60000) { await sleep(6000); d = dayOf(await b0.perf(false)); }
    await sleep(5000); await b0.kill();
    say(`  틀 day ${d}`);
    }
    //   ★[T398] `T334_KEEP_DB=<폴더>` — 켠 팔이 **받는 그 세계**(틀 끝)와 끝난 세계를 남긴다(자 `t378-forest-in-village` 가 T378_DB 로 잰다)
    const KEEP = process.env.T334_KEEP_DB || '';
    const keep = (sfx) => { if (!KEEP) return; fs.mkdirSync(KEEP, { recursive: true }); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(db + s, path.join(KEEP, `${tag}-${sfx}.db${s}`)); } catch (e) {} } };
    keep('warm');
    // ── 켠 팔 — 같은 DB 를 이어 받아 하루 경계마다 창을 읽는다
    const b = boot(tag + '-on', { DB_PATH: db, T325_WOOD_ACT: '1' });
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    const d0 = dayOf(await b.perf(false));
    const curve = [];
    let first = null;
    const t1 = Date.now();
    let last = d0;
    while (curve.length < DAYS && Date.now() - t1 < 60 * 60000) {
      await sleep(Math.max(1500, Math.floor(DAY_MS / 3)));
      const p = await b.perf(false);
      const dd = dayOf(p);
      if (dd === last || !p || !p.wood) continue;
      last = dd;
      const w = p.wood, t = p.tick && p.tick.ms;
      curve.push({ day: dd, act: w.actVillages, noTree: w.noTreeVillages, cells: w.cells, trees: w.trees, K: w.K, back: w.back, cap: w.cap, cutDay: w.cutDay,
        delivered: w.delivered, formula: w.formulaPerDay, hands: w.hands, walkers: w.walkers,
        p50: t ? t.p50 : null, p95: t ? t.p95 : null, players: popOf(p),
        //   ★[T475] 마을별 하루 — 그날 남은 수요(`dem` · `_lifeDaily` 머리)·한도·벤 그루·멈춤·수식 `D`(`f`)·w̄ — 등가를 곳간 기준으로 다시 세려고 남긴다
        rows: (w.rows || []).map((r) => ({ n: r.n, f: r.f, wBar: r.wBar, lj: r.lj, N: r.N, K: r.K, cut: r.dbg ? r.dbg.cut : null, cap: r.dbg ? r.dbg.cap : null,
          dem: r.dbg ? r.dbg.dem : null, stop: r.dbg ? r.dbg.stop : null, walked: r.dbg ? r.dbg.walked : null, d: r.d })) });
      if (!first) first = { day: dd, rows: w.rows, delivered: w.delivered, formula: w.formulaPerDay, trees: w.trees, cells: w.cells, act: w.actVillages, noTree: w.noTreeVillages };
      say(`  day ${dd} · 입고 ${w.delivered} / 수식 ${w.formulaPerDay} · 나무 ${w.trees}/${w.K} · 벤 ${w.cutDay} · 되살아난 ${w.back} · 한도 ${w.cap} · p50 ${t ? t.p50 : '?'}`);
    }
    const p = await b.perf(false);
    res.runs[tag] = { warm, day0: d0, first, curve,
      tick: p && p.tick ? { ms: p.tick.ms, dropN: p.tick.dropN, lagPct: p.tick.lagPct } : null,
      loop: p && p.loop, wood: p && p.wood };
    await b.kill(); keep('end'); rmdb(db);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  say('\n끝 →', OUT);
  process.exit(0);
})();
