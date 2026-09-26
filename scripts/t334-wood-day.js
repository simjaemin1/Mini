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
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t334/wood-day.json';
const WARMS = (process.env.T334_WARMS || '45,60,75').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
const DAYS = parseInt(process.env.DAYS || '30', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '6000', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

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
    const b0 = boot(tag + '-warm', { DB_PATH: db, VILLAGE_DAY_MS: String(Math.max(1200, Math.floor(DAY_MS / 4))) });
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
        p50: t ? t.p50 : null, p95: t ? t.p95 : null, players: popOf(p) });
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
