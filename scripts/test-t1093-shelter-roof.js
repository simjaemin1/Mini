#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// =============================================================================
// scripts/test-t1093-shelter-roof.js — 살아 있는 길로 선 공용 쉼터도 지붕 선언(`shelter: 1`)을 싣는가 (T1093 · 2026-11-03)
//
// ★왜 [land1038 실기 e2e-first30 · 첫 30분 막힘 "잠자리가 화면에 안 보임"의 사람 화면 쪽]
//   T136 은 쉼터 지붕 선언을 **부팅 시딩 길**(`materializeVillageStructures` 'shelter' → `buildStructureRect`)에만 실었다.
//   새 세계의 쉼터는 **살아 있는 길**(`_shelterBackfill` → `ensureShelter` → `addShelter` → `_liveHut6x4`)로 서고, 그 길은 선언 없이 섰다.
//   ⇒ 다음 부팅의 다시 실물화 전까지 쉼터 지붕이 아무 움집과 같았다(클라 `34-m-renderloop` 는 이 칸으로 쉼터 지붕을 고른다 ·
//     e2e-first30 실측 "알아본 길=이름표만(지붕 표지 없음)"). 손잡이 `T1093_SHELTER_ROOF`(켬 기본 후보 · `=0` 종전 바이트).
//
// 재는 것 — 진짜 존(마을 둘) · 진짜 `ensureShelter` · 진짜 건물 지도 · 진짜 DB 행
//   ① 켬: 막 선 쉼터의 벽 18 · 바닥 24 전부가 `shelter: 1` 을 싣는다(기하 · 문 두 칸 그대로)
//   ② 키 차례 · 바이트가 시딩 길(`buildStructureRect` 의 `Object.assign({side,floor:0}, tag)`)과 같다
//   ③ 영속 행(buildings 테이블 `data`)도 같은 선언이다 — 재시작 전까지 갈리지 않는다
//   ④ 끔(자식 프로세스 `T1093_SHELTER_ROOF=0`): 선언 0 · 데이터 JSON 이 종전 글자 그대로
//   ⑤ 클라 정본이 그 칸으로 지붕을 고른다(소스) · 그림 파일 · 앵커가 있다
//   ⑥ 쉼터만 갈린다 — 같은 정본 함수의 다른 호출(마을 움집 완공)은 선언이 없다
//   ⑦ 자명 통과 금지 — 선언 없이 같은 함수로 세운 6×4 에 같은 단언을 대면 빨개진다
//
// 실행: node scripts/test-t1093-shelter-roof.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHILD = process.env.T1093_CHILD || '';

const TMP = `/tmp/test-t1093-roof-${process.pid}.db`;
const rmDb = () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } };
rmDb();
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(require('./lib-port').port(37800));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1';
process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';   // 마을 둘이면 잰다(쉼터 한 채의 벽 · 바닥 · 행)
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.CLAIM_ABSENCE = '0';
process.env.SHELTER_BACKFILL = '0';      // ★타이머 · 날 백필은 끈다 — 쉼터는 하네스가 직접 세운다
process.env.NEWCOMER_ENABLE = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const { SimVillages, Onboarding, buildings } = H;
const SZ = H.BUILDING_SIZE;

// 쉼터 하나를 세우고 그 6×4 의 벽 · 바닥(건물 지도)과 DB 행을 모은다
function buildOne() {
  const list = SimVillages.clientVillages() || [];
  for (const v of list) {
    const a = Onboarding.arrivalOf(v.id);
    if (!a) continue;
    const r = SimVillages.ensureShelter(v.id, a);
    if (!r || !r.ok || r.already) continue;
    const sh = SimVillages.shelterOf(v.id);
    const R = [sh.cx - 5, sh.cy - 5, sh.cx, sh.cy - 2];
    const parts = [...buildings.values()].filter((b) => b.data && Array.isArray(b.data.hut) && b.data.hut.join(',') === R.join(','));
    return { vid: v.id, name: v.name, sh, R, parts };
  }
  return null;
}
function rowData(dbIds) {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(TMP, { readOnly: true });
  const q = d.prepare('SELECT id, data FROM buildings WHERE id = ?');
  const out = dbIds.map((id) => { const r = q.get(id); return r ? r.data : null; });
  d.close();
  return out;
}

if (CHILD === 'off') {   // ── 끔 판(자식) — 같은 일을 하고 JSON 만 낸다 ──
  const o = buildOne();
  const walls = o ? o.parts.filter((b) => b.type === 'wall') : [], floors = o ? o.parts.filter((b) => b.type === 'floor') : [];
  process.stdout.write('@@' + JSON.stringify({ knob: SimVillages.__probe && SimVillages.__probe.T1093_SHELTER_ROOF, n: o ? o.parts.length : 0,
    walls: walls.length, floors: floors.length, flagged: o ? o.parts.filter((b) => b.data.shelter === 1).length : -1,
    wall0: walls[0] ? JSON.stringify(walls[0].data) : null, floor0: floors[0] ? JSON.stringify(floors[0].data) : null,
    rows: o ? rowData(o.parts.slice(0, 3).map((b) => b.dbId)) : [], R: o ? o.R : null }) + '\n');
  rmDb();
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

console.log('\n=== T1093 쉼터 지붕 선언 — 살아 있는 길도 시딩 길과 같게 ===');
const o = buildOne();
ok(!!o, '⓪ 진짜 `ensureShelter` 가 쉼터 한 채를 세웠다(없으면 아래가 자명 통과다)', o ? `${o.name}(vid ${o.vid}) · 셀 ${o.sh.cx},${o.sh.cy}` : '');
const walls = o ? o.parts.filter((b) => b.type === 'wall') : [], floors = o ? o.parts.filter((b) => b.type === 'floor') : [];
const knob = SimVillages.__probe && SimVillages.__probe.T1093_SHELTER_ROOF;

console.log('\n① 켬(기본) — 벽 · 바닥 전부에 선언');
ok(knob === true, '①ⓐ 손잡이 기본이 켬이다(`T1093_SHELTER_ROOF` 없음 = 켬)', String(knob));
ok(walls.length === 18 && floors.length === 24, '①ⓑ 6×4 기하 그대로 — 벽 18(북 6 · 남 4 · 동서 8) · 바닥 24', `벽 ${walls.length} · 바닥 ${floors.length}`);
const southDoor = o ? walls.filter((b) => b.data.side === 'N' && b.y === (o.sh.cy - 1) * SZ).map((b) => b.x / SZ).sort((a, b) => a - b) : [];
ok(o && southDoor.length === 4 && !southDoor.includes(o.sh.cx - 3) && !southDoor.includes(o.sh.cx - 2), '①ⓒ 남벽 문 두 칸(cx−3 · cx−2)이 그대로 열려 있다', southDoor.join(','));
ok(o && o.parts.length === 42 && o.parts.every((b) => b.data.shelter === 1), '①ⓓ 42칸 전부 `shelter: 1`', o ? `${o.parts.filter((b) => b.data.shelter === 1).length}/${o.parts.length}` : '');

console.log('\n② 시딩 길과 같은 바이트');
{
  const want = (b) => JSON.stringify(b.type === 'wall' ? Object.assign({ side: b.data.side, floor: 0 }, { hut: o.R, shelter: 1 }) : Object.assign({ floor: 0 }, { hut: o.R, shelter: 1 }));
  const bad = o ? o.parts.filter((b) => JSON.stringify(b.data) !== want(b)) : [];
  ok(o && bad.length === 0, '②ⓐ 데이터 JSON 이 `buildStructureRect` 의 `Object.assign({side,floor:0}, {hut,shelter:1})` 과 바이트 같다(키 차례 포함)', bad.length ? JSON.stringify(bad[0].data) : (walls[0] ? JSON.stringify(walls[0].data) : ''));
  const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/b\.type === 'shelter'[\s\S]{0,1600}\{ hut: R\.slice\(\), shelter: 1 \}/.test(vsrc), '②ⓑ 시딩 길의 선언 글자가 그대로다(`{ hut: R.slice(), shelter: 1 }`)');
}

console.log('\n③ 영속 행');
{
  const rows = o ? rowData(o.parts.map((b) => b.dbId)) : [];
  const bad = rows.filter((d) => { try { return JSON.parse(d).shelter !== 1; } catch (e) { return true; } });
  ok(o && rows.length === 42 && bad.length === 0, '③ buildings 테이블 행 42 전부가 같은 선언을 싣는다(다음 부팅 전 다시 읽어도 지붕이 같다)', `${rows.length - bad.length}/${rows.length}`);
}

console.log('\n④ 끔(자식 프로세스 · `T1093_SHELTER_ROOF=0`) — 종전 바이트');
let off = null;
try {
  const out = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1093_CHILD: 'off', T1093_SHELTER_ROOF: '0', DB_PATH: '' }), encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'ignore'] });
  const line = out.split('\n').find((l) => l.startsWith('@@'));
  off = line ? JSON.parse(line.slice(2)) : null;
} catch (e) { off = null; }
ok(!!off && off.knob === false, '④ⓐ 자식이 끔 판으로 섰다', off ? String(off.knob) : '자식 실패');
ok(!!off && off.walls === 18 && off.floors === 24 && off.flagged === 0, '④ⓑ 같은 6×4 · 선언 0', off ? `벽 ${off.walls} · 바닥 ${off.floors} · 선언 ${off.flagged}` : '');
ok(!!off && off.wall0 === JSON.stringify({ side: JSON.parse(off.wall0).side, floor: 0, hut: off.R }) && off.floor0 === JSON.stringify({ floor: 0, hut: off.R }),
  '④ⓒ 데이터 JSON 이 종전 글자 그대로(`{side,floor,hut}` · `{floor,hut}`)', off ? `${off.wall0} · ${off.floor0}` : '');
ok(!!off && off.rows.length === 3 && off.rows.every((d) => d && !/shelter/.test(d)), '④ⓓ 영속 행에도 선언 0');

console.log('\n⑤ 클라 정본이 이 칸으로 지붕을 고른다');
{
  const rl = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
  const vis = fs.readFileSync(path.join(ROOT, 'public', 'client', '20-r2-visibility.js'), 'utf8');
  ok(/b\.data\.shelter && _bldSpr\.shelter_roof/.test(rl), '⑤ⓐ `34-m-renderloop` — 지붕 그림 = `b.data.shelter` 면 쉼터 지붕(T136 그 줄)');
  ok(/shelter_roof: \[[\d.]+, [\d.]+\]/.test(vis), '⑤ⓑ 쉼터 지붕 앵커가 있다(`20-r2-visibility`)');
  ok(fs.existsSync(path.join(ROOT, 'public', 'assets', 'buildings', 'shelter_roof.png')), '⑤ⓒ 그림 파일 `assets/buildings/shelter_roof.png` 이 있다');
}

console.log('\n⑥ 쉼터만 갈린다');
{
  const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const calls = vsrc.match(/_liveHut6x4\([^)]*\)/g) || [];
  const decl = calls.filter((c) => /shelter: 1/.test(c));
  ok(decl.length === 1 && /addShelter/.test(vsrc.slice(vsrc.lastIndexOf('function addShelter'), vsrc.indexOf(decl[0]) + 10)), '⑥ⓐ 선언을 싣는 호출은 하나 — `addShelter`(쉼터) 뿐', `${decl.length}/${calls.length}`);
  ok(calls.some((c) => /onm, made\)$/.test(c)), '⑥ⓑ 마을 움집 완공(`_lifeCompleteHouse`)은 선언 없이 부른다(종전 그대로)');
}

console.log('\n⑦ 자명 통과 금지 — 선언 없이 세운 6×4 에 같은 단언');
{
  const p = SimVillages.__probe;
  const vil = (SimVillages.villageByDbId && o) ? SimVillages.villageByDbId(o.vid) : null;
  const made = [];
  if (p && p.liveHut6x4 && vil) p.liveHut6x4(vil, o.sh.cx + 40, o.sh.cy + 40, 'npc_t1093_probe', 'T1093 대조', made);   // 선언 없음(`d` 없음) · 브로드캐스트 0(`made` 를 준다)
  ok(made.length === 42, '⑦ⓐ 같은 정본 함수가 대조 6×4 를 세웠다', `${made.length}칸`);
  ok(made.length === 42 && !made.every((b) => b.data.shelter === 1), '⑦ⓑ ①ⓓ 의 단언(42칸 전부 선언)이 대조에선 빨갛다 — 단언이 일을 한다', `${made.filter((b) => b.data.shelter === 1).length}/${made.length}`);
}

rmDb();
console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
