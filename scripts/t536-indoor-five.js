#!/usr/bin/env node
// === scripts/t536-indoor-five.js — 켜면 같이 움직이는 다섯 표 [T536 ③ · 2026-09-30] ======================
//
// ★묻는 것: 실내 = 지붕 아래(`T526_VILLAGE_INDOOR` · T536 기본 켬)가 **마을 움집 안 몸 하나**에게 무엇을 바꾸나 —
//   몸의 실내(`zone.isIndoorAt`)를 듣는 자리 전부(T526 보고 §1-ⓓ)를 **실제 서버**에서 게이지 값으로 잰다:
//     ① 부패 완충 — 움집 바닥에 놓은 고기 · 움집 안 궤짝(`ground_item_added`·`chest_state` 가 싣는 로트 `m`·`w`)
//     ② 추위 옷 닳음 — 겨울 밤 삼베옷 내구(`equipment`)
//     ③ 피로 회복 — 피로 1 에서 서 있을 때(`gauges.body.fatigue`)
//     ④ 비 가림 — 비 오는 날 젖음(`gauges.body.wet`) · 젖은 몸이 들어와 마르기
//     ⑤ 더위 그늘 — 여름 낮 갈증(`gauges.body.thirst`)
//     (+) 문 앞 1칸 — 몸은 바깥(`weather.indoor`)·비가 닿는다 · 화면은 지붕을 걷는다(클라 컷어웨이 · 표만)
//     (+) 페이로드 — 같은 자리·같은 얼린 시계에서 `gauges.weather` 원문(끔 판 = main 판 바이트 대조용)
// ★판정은 한 줄도 여기서 짓지 않는다 — 시계는 `__e2e_clock`(몸·날씨가 보는 날·밤) · 몸은 `__e2e_body` · 재료는 `__e2e_give`
//   (셋 다 `E2E_GIVE` 게이트 픽스처) · 자리는 `teleport_debug` · 옷은 정본 구매 경로(`craft_buy` → `equip_item`).
//   부패 속도는 서버가 로트에 찍은 `m`·`w` 를 **정본** `Spoil.dayExposure` 에 넣어 읽는다(존이 정산 때 부르는 그 함수).
// ★제품 코드 0 · 러너 밖 · 도구. 실행: node scripts/t536-indoor-five.js [--root DIR] [--env K=V]… [--out file.json] [--vid N]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')));
const OUT = arg('--out', '/tmp/t536-five.json');
const CPORT = +arg('--cport', 3736), ZPORT = +arg('--zport', 3746);
const ZENV = {};
argv.forEach((a, i) => { if (a === '--env' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); ZENV[k] = v.join('='); } });
const CDB = `/tmp/t536f-central-${process.pid}.db`, ZDB = `/tmp/t536f-zone-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const LOG = fs.createWriteStream(OUT + '.log');   // 존·중앙의 입(stdout·stderr) — 멎으면 왜 멎었는지 여기 남는다
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => LOG.write(`[${file} out] ` + d)); p.stderr.on('data', (d) => LOG.write(`[${file} err] ` + d));
  p.on('exit', (code, sig) => LOG.write(`[${file}] exit ${code} ${sig}\n`));
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const SZ = 32;
const cellC = (cx, cy) => ({ x: cx * SZ + 16, y: cy * SZ + 16 });

(async () => {
  const t0 = Date.now();
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' }, ZENV));
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  let rows = [], prev = -1;
  for (let i = 0; i < 90; i++) {
    try { const j = await (await fetch(`http://localhost:${ZPORT}/startinfo`, { signal: AbortSignal.timeout(5000) })).json(); rows = (j.villages || []).filter((v) => v.arrive && Number.isFinite(v.arrive.x)); } catch (e) {}
    if (rows.length && rows.length === prev) break;
    prev = rows.length; await sleep(4000);
  }
  const want = arg('--vid', null);
  const V = want ? rows.find((v) => String(v.vid) === String(want)) : rows.slice().sort((a, b) => a.vid - b.vid)[0];
  if (!V) { console.log('마을 없음'); process.exit(1); }
  console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] 마을 ${V.name}(vid ${V.vid}) 중심 (${V.cx},${V.cy}) · 손잡이 ${JSON.stringify(ZENV)} · ROOT ${ROOT}`);

  const WS = require('ws');
  const ws = new WS(`ws://localhost:${ZPORT}/?${new URLSearchParams({ name: 't536five', color: '#777777', start_vid: String(V.vid) })}`);
  const S = { wel: null, g: null, gAt: 0, eq: null, bld: new Map(), notices: [], ground: [], chest: null };
  ws.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
    if (m.type === 'welcome') { S.wel = m; for (const b of (m.buildings || [])) S.bld.set(b.id, b); if (m.equipment) S.eq = { equipment: m.equipment, equipSlots: m.equipSlots || {} }; }
    else if (m.type === 'buildings_spawn') for (const b of (m.buildings || [])) S.bld.set(b.id, b);
    else if (m.type === 'building_added' && m.building) S.bld.set(m.building.id, m.building);
    else if (m.type === 'gauges' && m.weather) { S.g = m; S.gAt = Date.now(); }
    else if (m.type === 'equipment') S.eq = { equipment: m.equipment || [], equipSlots: m.equipSlots || {} };
    else if (m.type === 'notice') S.notices.push(String(m.text || ''));
    else if (m.type === 'ground_item_added' && m.gi) S.ground.push(m.gi);
    else if (m.type === 'chest_state') S.chest = m;
  });
  ws.on('close', (code, why) => { LOG.write(`[ws] close ${code} ${String(why || '')}\n`); console.log(`WS 닫힘 ${code} ${String(why || '')}`); });
  await new Promise((r) => ws.on('open', r));
  const send = (o) => ws.send(JSON.stringify(o));
  // ★숨 — 존은 30초 동안 아무 말도 없는 접속을 좀비로 끊는다(`STALE_WS_MS` · 첫 판이 거기 걸려 게이지가 12초째에 멎었다).
  //   정본 핑(`{type:'ping'}` — 실클라가 보내는 그 문)으로 5초마다 숨을 쉰다. 몸·세계엔 아무것도 안 한다.
  const _beat = setInterval(() => { try { send({ type: 'ping', t: Date.now() }); } catch (e) {} }, 5000);
  const until = async (pred, ms) => { const e = Date.now() + ms; while (Date.now() < e) { if (pred()) return true; await sleep(100); } return false; };
  await until(() => S.wel && S.g, 30000);
  const freshG = async () => { const a = S.gAt; await until(() => S.gAt > a, 3000); return S.g; };
  const tp = async (x, y, ms) => { send({ type: 'teleport_debug', x, y }); await sleep(ms || 3000); return freshG(); };

  // ── 움집 하나 — 마을 중심으로 가서 받은 건물 행에서 **태그 렉트**(data.hut · 쉼터 아님)를 고른다 ──
  await tp(V.cx * SZ + 16, V.cy * SZ + 16, 6000);
  const huts = new Map();
  for (const b of S.bld.values()) {
    if (b.type !== 'floor' || !b.data || !Array.isArray(b.data.hut) || b.data.shelter || (b.floor || 0) !== 0) continue;
    const k = b.data.hut.join(','); if (!huts.has(k)) huts.set(k, b.data.hut.slice());
  }
  const pick = [...huts.values()].sort((a, b) => Math.hypot((a[0] + a[2]) / 2 - V.cx, (a[1] + a[3]) / 2 - V.cy) - Math.hypot((b[0] + b[2]) / 2 - V.cx, (b[1] + b[3]) / 2 - V.cy))[0];
  if (!pick) { console.log('움집 행을 못 받았다'); process.exit(1); }
  const R = pick;
  const IN = { cx: R[0] + 2, cy: R[1] + 1 }, IN2 = { cx: R[0] + 3, cy: R[1] + 1 };   // 문 열 · 집채 둘째 줄(벽·문에서 떨어진 바닥 칸)
  const DOOR = { cx: R[0] + 2, cy: R[3] + 1 };                                       // 남벽 개구 칸(렉트 밖 · 바닥 없음)
  const OUTC = { cx: R[0] + 2, cy: R[3] + 5 };                                       // 문에서 남으로 네 칸 — 마당
  console.log(`움집 렉트 [${R}] · 안 (${IN.cx},${IN.cy}) · 문 (${DOOR.cx},${DOOR.cy}) · 마당 (${OUTC.cx},${OUTC.cy}) · 태그 움집 ${huts.size}채`);

  // ── ★페이로드만(`--payload-only`) — 끔 판과 main 판의 `gauges.weather` 원문을 바이트로 대 보는 판 ──
  //   무작위가 끼는 것(장인 품질이 정하는 옷 방한 · 도착 때 맞은 비의 마름 시각)을 빼려고 **맨몸 · 비 오는 날(젖음 = 그날 강수 그대로)**
  //   · 얼린 시계에서 문 칸(바깥)과 움집 안 칸의 게이지를 연달아 셋씩 받는다.
  if (argv.includes('--payload-only')) {
    send({ type: '__e2e_clock', day: 160, night: false }); await sleep(1500);
    const grab = async (cell) => { await tp(cellC(cell.cx, cell.cy).x, cellC(cell.cx, cell.cy).y, 4000); const a = [];
      for (let i = 0; i < 3; i++) { const g = await freshG(); a.push(JSON.stringify(g.weather)); } return { keys: Object.keys(S.g).join(','), w: a }; };
    const po = { at: new Date().toISOString(), root: ROOT, env: ZENV, hut: R, door: await grab(DOOR), in: await grab(IN) };
    fs.writeFileSync(OUT, JSON.stringify(po, null, 1));
    console.log(`페이로드 — 문 칸 ${po.door.w[2]}\n           안 칸 ${po.in.w[2]}`);
    clearInterval(_beat); try { ws.close(); } catch (e) {}
    for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
    for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.exit(0);
  }
  // ── 옷 — 마을 장인에게 산다(정본 경로) · 궤짝 재료 · 고기 ──
  send({ type: '__e2e_give', items: { hemp: 9, plank: 8, meat: 6 }, tools: ['hammer'] });
  await sleep(1200);
  send({ type: 'craft_buy', itemType: 'clothes', material: 'hemp' });
  await until(() => S.eq && S.eq.equipment.some((e) => e.type === 'clothes'), 5000);
  const cl = S.eq && S.eq.equipment.filter((e) => e.type === 'clothes').slice(-1)[0];
  if (cl) { send({ type: 'equip_item', id: cl.id }); await until(() => S.eq && S.eq.equipSlots && S.eq.equipSlots.clothes, 4000); }
  const dura = () => { const id = S.eq && S.eq.equipSlots && S.eq.equipSlots.clothes; const e = id && S.eq.equipment.find((q) => q.id === id); return e ? e.dura : null; };
  console.log(`옷 ${cl ? `${cl.type}/${cl.mat || cl.material || ''} 방한 ${cl.attrs && cl.attrs.warmth} 내구 ${cl.dura}` : '못 삼'} · 입음 ${!!(S.eq && S.eq.equipSlots && S.eq.equipSlots.clothes)} · 알림 ${S.notices.slice(-2).join(' | ')}`);

  const out = { at: new Date().toISOString(), root: ROOT, env: ZENV, village: { vid: V.vid, name: V.name, cx: V.cx, cy: V.cy }, hut: R, cells: { IN, IN2, DOOR, OUTC },
    clothes: cl ? { warmth: cl.attrs && cl.attrs.warmth, dura0: cl.dura } : null, scen: {} };
  const snap = (g) => ({ indoor: g.weather.indoor, shelter: g.weather.shelter, exp: g.weather.exp, insC: g.weather.insC, precip: g.weather.precip, tempC: g.weather.tempC,
    cover: g.weather.cover, cold: g.body.cold, fatigue: g.body.fatigue, wet: g.body.wet, thirst: g.body.thirst, hunger: g.body.hunger });
  const series = async (sec, extra) => { const s = []; const a = Date.now();
    while (Date.now() - a < sec * 1000) { const g = await freshG(); s.push(Object.assign({ t: +((Date.now() - a) / 1000).toFixed(1) }, snap(g), extra ? extra() : {})); }
    return s; };

  // ══ A 겨울 밤 — 추위 · 옷 닳음 · 피로 ══════════════════════════════════════════════════════════
  await tp(cellC(IN.cx, IN.cy).x, cellC(IN.cx, IN.cy).y, 4000);
  send({ type: '__e2e_clock', day: 317, night: true }); await sleep(1500);
  // ★밖에서 언 몸이 들어온 판 — 추위 0.3(`_cold` 문턱 0.05 위 · 옷 닳음 줄이 실제로 설 자리) · 피로 1(쉼의 회복을 잴 자리)
  send({ type: '__e2e_body', cold: 0.3, fatigue: 1, hunger: 100, thirst: 100, quiet: true }); await sleep(300);
  const gA = await freshG();
  out.payload = { weather: JSON.stringify(gA.weather), keys: Object.keys(gA).join(','), wkeys: Object.keys(gA.weather).join(',') };
  const dA0 = dura();
  out.scen.winterNight = { day: 317, night: true, dura0: dA0, s: await series(150, () => ({ dura: dura() })) };
  out.scen.winterNight.dura1 = dura();
  console.log(`A 겨울 밤(움집 안 · 150초): 실내 ${gA.weather.indoor} · 완충 ${gA.weather.shelter} · 추위 ${out.scen.winterNight.s.slice(-1)[0].cold} · 피로 1 → ${out.scen.winterNight.s.slice(-1)[0].fatigue} · 옷 내구 ${dA0} → ${out.scen.winterNight.dura1}`);

  // ══ B 여름 낮 — 갈증(그늘) · 부패(바닥·궤짝) ══════════════════════════════════════════════════════
  send({ type: '__e2e_clock', day: 135, night: false }); await sleep(1500);
  send({ type: '__e2e_body', cold: 0, fatigue: 0, hunger: 100, thirst: 100, quiet: true }); await sleep(300);
  out.scen.summerDay = { day: 135, night: false, s: await series(120) };
  console.log(`B 여름 낮(움집 안 · 120초): 갈증 100 → ${out.scen.summerDay.s.slice(-1)[0].thirst}`);
  // 바닥 — 움집 안에서 고기 하나를 놓는다(서버가 그 자리의 배율을 로트에 찍는다)
  const g0 = S.ground.length;
  send({ type: 'drop_item', item: 'meat', amount: 1 });
  await until(() => S.ground.length > g0, 4000);
  const gi = S.ground.slice(g0).find((x) => x.item === 'meat');
  // 궤짝 — 움집 안 옆 칸에 짓고 고기 하나를 넣는다(지을 수 없으면 거절 문구를 적는다)
  const nb = S.notices.length, cb = new Set([...S.bld.values()].filter((b) => b.type === 'chest').map((b) => b.id));
  send({ type: 'build', buildType: 'chest', floor: 0, atX: cellC(IN2.cx, IN2.cy).x, atY: cellC(IN2.cx, IN2.cy).y });
  await until(() => [...S.bld.values()].some((b) => b.type === 'chest' && !cb.has(b.id)), 4000);
  const chestB = [...S.bld.values()].find((b) => b.type === 'chest' && !cb.has(b.id));
  if (chestB) { S.chest = null; send({ type: 'chest_put', buildingId: chestB.id, item: 'meat', amount: 1 }); await until(() => S.chest, 4000); }
  const chestLots = S.chest && S.chest.data && S.chest.data._lots && S.chest.data._lots.meat;
  out.spoil = { ground: gi && gi.lots ? gi.lots.map((r) => ({ m: r.m, w: r.w })) : null,
    chest: chestB ? { at: [Math.floor(chestB.x / SZ), Math.floor(chestB.y / SZ)], lots: chestLots ? chestLots.map((r) => ({ m: r.m, w: r.w })) : null } : null,
    buildNotices: S.notices.slice(nb) };
  console.log(`부패 자리: 바닥 ${JSON.stringify(out.spoil.ground)} · 궤짝 ${JSON.stringify(out.spoil.chest)} ${chestB ? '' : '· 알림 ' + out.spoil.buildNotices.join(' | ')}`);

  // ══ C 비 — 젖음 · 들어와 마르기 · 문 앞 1칸 ═══════════════════════════════════════════════════════
  send({ type: '__e2e_clock', day: 160, night: false }); await sleep(1500);
  const inRain = await series(30);
  await tp(cellC(OUTC.cx, OUTC.cy).x, cellC(OUTC.cx, OUTC.cy).y, 2000);
  const outRain = await series(20);
  await tp(cellC(IN.cx, IN.cy).x, cellC(IN.cx, IN.cy).y, 1500);
  const dryIn = await series(60);
  await tp(cellC(DOOR.cx, DOOR.cy).x, cellC(DOOR.cx, DOOR.cy).y, 1500);
  const door = await series(20);
  out.scen.rain = { day: 160, night: false, inRain, outRain, dryIn, door };
  const L = (a) => a.slice(-1)[0];
  console.log(`C 비(강수 ${L(inRain).precip}): 움집 안 30초 젖음 ${inRain[0].wet} → ${L(inRain).wet} · 마당 20초 ${L(outRain).wet} · 들어와 60초 ${dryIn[0].wet} → ${L(dryIn).wet} · 문 칸 실내 ${L(door).indoor} 젖음 ${L(door).wet}`);

  // ── 부패 속도 — 로트의 `m`·`w` 를 정본 `Spoil.dayExposure`(하루치 노출 · 고도 0)에 넣는다 ──
  process.env.ZONE_ID = 'hanbando';
  const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  const exp = (w, m, d) => +(Spoil.dayExposure(d, 0, w) * m).toFixed(4);
  const place = (lots) => (lots && lots[0]) ? lots[0] : null;
  const pg = place(out.spoil.ground), pc = out.spoil.chest && place(out.spoil.chest.lots);
  out.spoil.exposure = {};
  for (const [k, d] of [['winter', 317], ['summer', 135], ['rain', 160]]) {
    out.spoil.exposure[k] = { day: d, outdoorGround: exp(0, 1, d), outdoorChest: exp(0, Spoil.placeFields('chest').m, d),
      floor: pg ? exp(pg.w, pg.m, d) : null, chest: pc ? exp(pc.w, pc.m, d) : null };
  }
  out.spoil.meatShelf = Spoil.shelfOf('meat');
  // ── 추위 목표점 — 정본 `Body.coldTarget` 에 그 자리의 게이지 값(완충·노출·실내·옷)을 넣는다(존 틱이 넘기는 그 맥락) ──
  const Body = require(path.join(ROOT, 'server', 'body.js')), Wx = require(path.join(ROOT, 'server', 'weather.js'));
  const w0 = out.scen.winterNight.s[0];
  const ctxA = (indoor) => ({ day: 317, dayT: 317 + Wx.PH.midnight, dayPh: Wx.PH.midnight, night: true, elevKm: 0, warmth: out.clothes ? out.clothes.warmth : 0,
    villageShelter: w0.shelter, windExposure: w0.exp, indoor, cover: w0.cover });
  out.targets = { winterNight: { asIs: Body.coldTarget(ctxA(w0.indoor === true)), ifIndoor: Body.coldTarget(ctxA(true)), ifOutdoor: Body.coldTarget(ctxA(false)) } };
  console.log(`추위 목표점(겨울 밤 · 움집 안 · 삼베 ${out.clothes && out.clothes.warmth}): 이 판 ${out.targets.winterNight.asIs} · 실내라면 ${out.targets.winterNight.ifIndoor} · 바깥이라면 ${out.targets.winterNight.ifOutdoor}`);
  console.log(`부패 노출(일/일): ${JSON.stringify(out.spoil.exposure)} · 고기 보관일 ${out.spoil.meatShelf}`);
  out.sec = +((Date.now() - t0) / 1000).toFixed(0);
  clearInterval(_beat);
  try { ws.close(); } catch (e) {}
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log(`끝 ${out.sec}s → ${OUT}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
