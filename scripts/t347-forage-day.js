#!/usr/bin/env node
// === scripts/t347-forage-day.js — 마을 예산의 값: 첫날 등가 · 30일 나무 곡선 · 존 틱 (T347 ③) =====
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
//   ⇒ 이 자는 **틀 나이가 다른 세 판**(`T347_WARMS`)으로 세 세계를 만든다. 한 판의 우연이 아님을 그렇게 본다.
//   `t176-ab` 의 3시드(1020·7·42)는 **끔 팔**에만 댈 수 있다(그 자는 `villages.js` 를 안 지난다 — T312 §④).
//
// 실행: node scripts/t347-forage-day.js [out.json]
//   T347_WARMS="45,60,75" · DAYS(기본 30) · DAY_MS(기본 6000)
//   T347_KEEP_DB=<폴더> · T347_FROM=<폴더> … [T490] 틀을 한 번 구워 남기고(`DAYS=0` 이면 굽기만) 팔 여럿을 그 세계에서 짝으로(T334 자와 같은 꼴)
//   T347_MAX_MIN(기본 60) … [T495] 켠 판 한 판의 벽시계 상한(분 · 긴 하루로 30일을 채울 때)
//   T495_PARTIAL_PICK … [T495] 부분 수확 — ★[T510] **기본 켬**(`=0` 이 종전 개체째) · 켜면 행에 `units`(딴 단위)·`empt`(비운 개체)·`part`(서 있게 둔 개체)가 붙고 세계 비용은 단위로 센다(`=0` 이면 칸 0)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// ★[T462] `T347_ROOT` — 서버 코드 자리(베이스 워크트리를 **같은 자**로 잰다 · T450 자 `T450_ROOT` 와 같은 꼴). 없으면 이 레포.
const ROOT = process.env.T347_ROOT ? path.resolve(process.env.T347_ROOT) : path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t347/forage-day.json';
const WARMS = (process.env.T347_WARMS || '45,60,75').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
const DAYS = parseInt(process.env.DAYS || '30', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '6000', 10);
// ★[T495] 켠 판 한 판의 벽시계 상한(분) — 기본은 종전 그대로 60분. 하루가 길면(T490 반경 120셀 = 하루 171,429ms · 30일 86분) 늘린다.
const RUN_MAX_MS = (parseFloat(process.env.T347_MAX_MIN || '60') || 60) * 60000;
// ★[T462] 틀 굽는 하루 — 기본은 종전 그대로(`max(1200, DAY_MS/4)`). 켠 팔 하루를 늘려도(왕복이 서게) 틀은 빨리 굽는다.
const WARM_DAY_MS = parseInt(process.env.WARM_DAY_MS || String(Math.max(1200, Math.floor(DAY_MS / 4))), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

// ── ★[T475] 요약 — 이 자가 남긴 JSON 을 읽기만 한다(세계를 안 세운다 · 새 자 0) ─────────────────────────
//   node scripts/t347-forage-day.js --summary <팔 이름>=<a.json> [<팔 이름>=<b.json> …]
//   마을·하루(행위 마을 행)마다: 걷은 몫 = 그날 남은 수요 `dem`(헤드리스는 `_lifeDaily` 머리 = `D·share` — 두 시계 검사) ·
//   곳간 = 누계 `g` 의 하루 증분(가지 · T475 계측) · 세계 비용 = 딴 개체 × w̄(T462 자기신고 그대로 · ★[T495] 켠 팔은 딴 단위 `units`).
//   ⇒ 항등 = 곳간 증분 = 걷은 몫(그 마을·그날) · 비(세계) = Σ 세계 비용 ÷ Σ 걷은 몫 = T462 의 "비"(134 → 91).
if (process.argv[2] === '--summary') {
  const arms = process.argv.slice(3).map((a) => { const i = a.indexOf('='); return i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [path.basename(a), a]; });
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  say(['팔', '판', '날', '행위 마을', '군락 0 마을', '군락 시작→끝', '딴 개체', '세계 비용(단)', '걷은 몫(단)', '비(세계) %', '곳간(단)', '비(곳간) %',
    '항등 마을·날', '모자람', '넘침(세계−곳간)', 'dem=D·share', '걸은 손 마을·날', '그중 수요 0', '걸음 곳간÷걷은 몫 %', '걷는 몫 평균', '목록(마을 수 · 목록이 선 첫날)', 'p95 중앙'].join(' | '));
  for (const [nm, f] of arms) {
    let J = null; try { J = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { say(`${nm} | 못 읽음 ${f}`); continue; }
    for (const [tag, r] of Object.entries(J.runs || {})) {
      const cv = r.curve || []; if (!cv.length) continue;
      let pick = 0, world = 0, strip = 0, gran = 0, hasG = false, eq = 0, short = 0, vd = 0, dAlign = 0, dN = 0, walkedVD = 0, mixS = 0, mixN = 0;
      let wDem0 = 0, wIn = 0, wStrip = 0;   // ★[T475 ②] 걷는 몸 마을·날 — 그날 남은 수요가 0(어제 손이 먹었다) · 손이 곳간에 든 몫 ÷ 걷은 몫
      let granEst = 0;   // 곳간 칸(`g`)이 없는 판(베이스) — 추정 = min(세계 비용, 걷은 몫)(곳간 입구가 수요에서 자른다 · 헤드리스)
      const prevG = new Map(), prevD = new Map(); const p95 = [];
      for (const d of cv) {
        if (d.p95 != null) p95.push(d.p95);
        for (const q of (d.rows || [])) {
          const w = (typeof q.units === 'number') ? q.units : (q.pick || 0) * (q.wBar || 0);   // ★[T495] 켠 팔은 딴 **단위**가 세계 비용이다(개체 × w̄ 가 아니다)
          pick += q.pick || 0; world += w;
          const dem = (q.f > 0 && q.mix > 0) ? q.f * q.mix : 0;   // 걷은 몫 = 그날 수식이 걷어낸 몫(`_forageOutLast × _t347MixShare`)
          strip += dem; granEst += Math.min(w, dem);
          if (q.mix > 0) { mixS += q.mix; mixN++; }
          const dd = (typeof q.d === 'number') ? q.d - (prevD.has(q.n) ? prevD.get(q.n) : q.d) : 0; if (typeof q.d === 'number') prevD.set(q.n, q.d);
          if (q.walked > 0) { walkedVD++; if (typeof q.dem === 'number' && q.dem >= 0 && q.dem <= 1e-6 && dem > 0) wDem0++; wIn += dd; wStrip += dem; }
          if (typeof q.dem === 'number' && q.dem >= 0 && q.f != null && q.mix != null && !(q.walked > 0)) { dN++; if (Math.abs(q.f * q.mix - q.dem) <= 1e-3 * Math.max(1, q.dem)) dAlign++; }
          if (typeof q.g === 'number') {
            hasG = true;
            const dg = q.g - (prevG.has(q.n) ? prevG.get(q.n) : 0); prevG.set(q.n, q.g);
            gran += dg;
            if (dem > 0) { vd++; if (Math.abs(dg - dem) <= 1e-4 * Math.max(1, dem)) eq++; else if (dg < dem) short++; }   // 걷은 몫이 있는 마을·날만(0 = 0 은 안 센다)
          }
        }
      }
      const last = cv[cv.length - 1];
      //   목록 분포 — 마을 목록이 다 선 첫날(켠 첫날은 스캔 전이라 세계 목록 폴백 · 가지만 `it` 가 있다)
      const d1 = cv.find((d) => (d.rows || []).length && (d.rows || []).every((q) => Array.isArray(q.it))) || cv[Math.min(1, cv.length - 1)];
      const lists = {}; for (const q of (d1.rows || [])) { const k = Array.isArray(q.it) ? q.it.join('·') : '(세계)'; lists[k] = (lists[k] || 0) + 1; }
      say([nm, tag, cv.length, `${cv[0].act}→${last.act}`, `${cv[0].noGrove}→${last.noGrove}`, `${cv[0].groves}→${last.groves}`, pick,
        world.toFixed(1), strip.toFixed(1), strip > 0 ? (100 * world / strip).toFixed(1) : '—',
        hasG ? gran.toFixed(1) : `(추정 ${granEst.toFixed(1)})`, strip > 0 ? (hasG ? (100 * gran / strip).toFixed(1) : `(추정 ${(100 * granEst / strip).toFixed(1)})`) : '—',
        hasG ? `${eq}/${vd}` : '—', hasG ? short : '—', hasG ? (world - gran).toFixed(1) : '—',
        `${dAlign}/${dN}`, walkedVD, walkedVD ? wDem0 : '—', wStrip > 0 ? (100 * wIn / wStrip).toFixed(1) : '—', mixN ? (mixS / mixN).toFixed(3) : '—',
        Object.entries(lists).map(([k, n]) => `${k} ${n}`).join(' ; '), med(p95)].join(' | '));
    }
  }
  process.exit(0);
}

// ★[T462] 두 팔을 **나란히** 돌릴 때 — 자리(포트)·이름(파일)이 겹치지 않게(기본 0 · 없음 = 종전 그대로)
const PORT_OFF = parseInt(process.env.T347_PORT || '0', 10) || 0;
const TAGP = process.env.T347_TAG || '';
function boot(tag, zenv) {
  tag = TAGP + tag;
  const SECRET = 't347-' + tag;
  const CP = 3830 + PORT_OFF, ZP = 3840 + PORT_OFF;
  const logf = fs.openSync(`/tmp/t347/${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t347/c-${tag}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
  const perf = async (reset) => { try { const r = await fetch(`http://localhost:${ZP}/perf${reset ? '?reset=1' : ''}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  return { z, perf, health, kill };
}
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
const popOf = (p) => (p && p.forage && p.forage.popAll) || null;

(async () => {
  const res = { at: new Date().toISOString(), host: { cpus: require('os').cpus().length }, WARMS, DAYS, DAY_MS, runs: {} };
  for (const warm of WARMS) {
    const tag = 'w' + warm, db = `/tmp/t347/z-${TAGP}${tag}.db`;
    rmdb(db);
    //   ★[T490] `T347_FROM=<폴더>` — 틀을 **굽지 않고** 남겨 둔 틀(`<tag>-warm.db`)에서 켠 팔만 돈다(팔 여럿을 **같은 세계**에서 짝으로 ·
    //     T334 자 `T334_FROM` 과 같은 꼴 — 틀은 벽시계 지터로 판마다 다르다 · T341 §3) · `T347_KEEP_DB=<폴더>` — 틀 끝(켠 팔이 받는 세계)을 남긴다.
    const FROM = process.env.T347_FROM || '', KEEP = process.env.T347_KEEP_DB || '';
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
    if (KEEP) { fs.mkdirSync(KEEP, { recursive: true }); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(db + s, path.join(KEEP, `${tag}-warm.db${s}`)); } catch (e) {} } }
    }
    if (!(DAYS > 0)) { rmdb(db); continue; }   // ★[T490] 틀만 굽는 판(`DAYS=0` + `T347_KEEP_DB`)
    // ── 켠 팔 — 같은 DB 를 이어 받아 하루 경계마다 창을 읽는다
    const b = boot(tag + '-on', { DB_PATH: db, T347_FORAGE_ACT: '1' });
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    const d0 = dayOf(await b.perf(false));
    const curve = [];
    let first = null;
    const t1 = Date.now();
    let last = d0;
    while (curve.length < DAYS && Date.now() - t1 < RUN_MAX_MS) {
      await sleep(Math.max(1500, Math.floor(DAY_MS / 3)));
      const p = await b.perf(false);
      const dd = dayOf(p);
      if (dd === last || !p || !p.forage) continue;
      last = dd;
      const w = p.forage, t = p.tick && p.tick.ms;
      curve.push({ day: dd, act: w.actVillages, noGrove: w.noGroveVillages, cells: w.cells, groves: w.groves, K: w.K, back: w.back, cap: w.cap, pickDay: w.pickDay,
        delivered: w.delivered, formula: w.formulaActPerDay, formulaAll: w.formulaPerDay, hands: w.hands, walkers: w.walkers,
        p50: t ? t.p50 : null, p95: t ? t.p95 : null, players: popOf(p),
        //   ★[T462] 마을별 하루 — 입고를 **딴 개체 × w̄**(T347 §3 자기신고 · 누계 `delivered` 는 게이트에서 빠진 마을 몫이 사라진다)로 다시 세려고 남긴다
        rows: (w.rows || []).map((r) => ({ n: r.n, pick: (r.dbg && r.dbg.pick) | 0, wBar: r.wBar, cap: (r.dbg && r.dbg.cap) | 0, N: r.N, K: r.K, f: r.f, mix: r.mix, back: (r.dbg && r.dbg.back) | 0, dem: r.dbg ? r.dbg.dem : null,
          //   ★[T475] 곳간 누계(`g` — 수요에서 자른 뒤 실제로 든 몫 · 항등의 한쪽) · 그 마을 걷는 목록(`it`) · 걷는 몸(`walked` 손을 넣은 사람 · `hU` 지금 손) · 멈춤(`stop`)
          g: r.g, it: r.it, walked: r.dbg ? r.dbg.walked : null, hU: r.hU, stop: r.dbg ? r.dbg.stop : null, fg: r.fg, d: r.d,
          //   ★[T490] 원판 밖(팔 켬) — 목록에 붙은 개체(`x`) · 그날 훑기(`xr`: 모자람·찾은 단위·링·물/먼 칸·µs) · 밖에서 딴 개체(`xpick`)
          x: r.x, xr: r.xr, xpick: r.dbg ? r.dbg.xpick : null, cells: r.cells,
          //   ★[T495] 부분 수확(팔 켬) — 딴 단위(`units`) · 비운 개체(`empt`) · 서 있게 둔 개체(`part`) · `pick` 은 개체를 **들른** 수(끄면 칸이 안 생긴다)
          units: r.dbg ? r.dbg.units : undefined, empt: r.dbg ? r.dbg.empt : undefined, part: r.dbg ? r.dbg.part : undefined })),
        gran: w.gran, reach: w.reach });
      if (!first) first = { day: dd, rows: w.rows, delivered: w.delivered, formula: w.formulaActPerDay, formulaAll: w.formulaPerDay, groves: w.groves, cells: w.cells, act: w.actVillages, noGrove: w.noGroveVillages };
      say(`  day ${dd} · 입고 ${w.delivered} / 수식(걷은 몫) ${w.formulaActPerDay}/${w.formulaPerDay} · 군락 ${w.groves}/${w.K} · 딴 ${w.pickDay} · 되살아난 ${w.back} · 한도 ${w.cap} · p50 ${t ? t.p50 : '?'}`);
    }
    const p = await b.perf(false);
    res.runs[tag] = { warm, day0: d0, first, curve,
      tick: p && p.tick ? { ms: p.tick.ms, dropN: p.tick.dropN, lagPct: p.tick.lagPct } : null,
      loop: p && p.loop, wood: p && p.forage };
    await b.kill(); rmdb(db);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  say('\n끝 →', OUT);
  process.exit(0);
})();
