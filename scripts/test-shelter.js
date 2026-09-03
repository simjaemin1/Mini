#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-shelter.js — 공용 쉼터 [재민 확정 2026-09-03 · T62] ============
//
// ★설계 정본: §9.3 자격 *"쉼터 보유"* · §9.4 *"납품 → 밥 + 공용 쉼터"* ·
//   §9.5 *"잠자리 3단 사다리: 공용 쉼터 → 일해서 빈터 → 직접 짓는 내 움집"* ·
//   T43 §12 *"마을 안 불사 — 마을 사람이 쉼터로 옮긴다"*.
//   구현 정본: `server/villages.js` 의 `shelterOf` / `ensureShelter` / `pickShelterSpot`.
//
// ★★이 하네스가 재는 것 — 순서가 곧 카드다
//   ⓪ 상황 assert — 마을이 실제로 섰고 정본 함수가 열려 있나.
//   ① ★§0 — "쉼터"가 가리키던 자리 여섯이 이제 **하나**를 가리키는가(사본 금지).
//   ② 백필 — NPC 마을 전수: 서고 · 영토 안이고 · 물·바위가 아니고 · 큰집 마당을 안 밟는다.
//   ③ 자리를 **고르지 않고 잰다** — 마을 집터 필터 정본을 통과한 자리만 낸다(대조 포함).
//   ④ 저장·로드 왕복 — 쉼터가 **재시작을 넘는다**(T45 가 사유지 종류를 잃던 결함의 재판 금지).
//   ⑤ 이송 좌표 = 쉼터 — T43 의 문장이 이제 **참**이다. 그리고 그 자리는 **집 밖**이다.
//   ⑥ 유저 마을은 백필하지 않는다 — 창설자가 지어야 T19 자격이 자명 통과가 아니다.
//   ⑦ 재료·크기를 **발명하지 않았다** — 움집에서 유도된 값임을 소스로 대조.
//   ⑧ ★이 하네스가 실패할 줄 아는가 — 일부러 틀린 것을 넣는다.
//
// 실행: node scripts/test-shelter.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

const TMP = `/tmp/test-shelter-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37600 + (process.pid % 150));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1';       // ★쉼터는 마을의 시설이다 — 마을이 서 있어야 잰다
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.CLAIM_ABSENCE = '0';
process.env.SHELTER_BACKFILL = '0';      // ★타이머는 끈다 — 백필을 **하네스가 직접** 부른다(언제 돌았는지 알아야 한다)
process.env.NEWCOMER_ENABLE = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const { SimVillages, Onboarding, BUILDING_SIZE: SZ } = H;
const VL = require(path.join(ROOT, 'server', 'village-layout.js'));

// 실측 대상 마을 수 — 전수가 기본이지만 러너에서 시간이 문제면 env 로 줄인다(값은 보고에 적는다).
const N_SAMPLE = parseInt(process.env.SHELTER_TEST_N || '0', 10) || 0;   // 0 = 전수

console.log('\n=== 공용 쉼터 — 시설로 존재한다 (T62) ===');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⓪ 상황 — 마을이 섰고 정본이 열려 있나');
let vids = [];
{
  const list = SimVillages.clientVillages() || [];
  pre(list.length > 0, '마을이 실제로 섰다(0곳이면 아래가 전부 자명 통과다)', `${list.length}곳`);
  ok(list.length >= 10, '⓪ 실지도 마을이 열 곳 이상이다 — 전수 판정에 뜻이 있다', `${list.length}곳`);
  for (const f of ['shelterOf', 'hasShelter', 'ensureShelter', 'pickShelterSpot', 'addShelter', 'villageOfCell'])
    ok(typeof SimVillages[f] === 'function', `⓪ 정본 \`${f}\` 이(가) 열려 있다`);
  vids = list.map((v) => v.id);
  if (N_SAMPLE) vids = vids.slice(0, N_SAMPLE);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n① ★§0 — "쉼터"가 가리키던 여섯 자리가 이제 하나를 가리키는가');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const nsrc = fs.readFileSync(path.join(ROOT, 'server', 'newcomers.js'), 'utf8');
  const osrc = fs.readFileSync(path.join(ROOT, 'server', 'onboarding.js'), 'utf8');
  // ⓐ 미기후 `shelterAt` 은 **여전히 거리 함수**다 — 건물이 그 값을 바꾸지 않는다(축을 안 섞었다).
  { const _sa = vsrc.slice(vsrc.indexOf('function shelterAt('), vsrc.indexOf('function shelterAt(') + 900);
    ok(/smoothstep/.test(_sa) && !/_shelter\b/.test(_sa),
      '①ⓐ `shelterAt` 은 그대로 **미기후**다(거리 함수 · smoothstep) — 쉼터 건물과 섞지 않았다'); }
  // ⓑ 이송·사다리·자격·안내 넷이 **같은 문**을 부른다
  ok((zsrc.match(/SimVillages\.shelterOf/g) || []).length >= 2,
    '①ⓑ zone 이 쉼터 좌표를 **정본에 물어본다**(이송·디버그)', `${(zsrc.match(/SimVillages\.shelterOf/g) || []).length}회`);
  ok(/hasShelter: \(vid\) =>/.test(zsrc), '①ⓑ T19 자격도 같은 문을 쓴다(`hasShelter` 주입)');
  ok(/H\.shelterOf/.test(osrc), '①ⓑ 온보딩 안내도 같은 문을 쓴다 — 좌표를 다시 고르지 않는다');
  ok(/잘 자리가 없다/.test(nsrc), '①ⓑ 자격 거절 문장이 사람 말이다');
  // ⓒ ★대체 술어를 **버리지 않았다** — 쉼터 ∧ (인구 ∧ 자립)
  ok(/out\.shelter = /.test(nsrc) && /곳간이 얇다/.test(nsrc),
    '①ⓒ ★쉼터 항을 더하되 **econ 대체 술어를 버리지 않았다**(지붕만으론 못 먹인다)');
  // ⓓ 실체는 움집 정본 하나가 세운다(사본 금지)
  ok((vsrc.match(/_liveHut6x4\(/g) || []).length >= 3,
    '①ⓓ 6×4 실체를 세우는 코드가 **한 곳**이다 — 움집 완공과 쉼터가 같은 함수를 부른다',
    `${(vsrc.match(/_liveHut6x4\(/g) || []).length}회 등장(정의 1 + 호출 2)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② 백필 — NPC 마을 전수: 서고 · 영토 안 · 물·바위 아님 · 큰집 마당 밖');
let made = 0, withShelter = 0;
{
  const t0 = Date.now();
  for (const vid of vids) {
    const a = Onboarding.arrivalOf(vid);
    const r = SimVillages.ensureShelter(vid, a);
    if (r && r.ok && !r.already) made++;
  }
  const ms = Date.now() - t0;
  pre(made > 0, '백필이 실제로 무언가를 세웠다(0채면 아래가 자명 통과다)', `${made}채 · ${ms}ms`);
  let inTerr = 0, dry = 0, offYard = 0, noOverlapHouse = 0, doorsOut = 0;
  const bad = [];
  for (const vid of vids) {
    const sh = SimVillages.shelterOf(vid);
    if (!sh) { bad.push(`${vid}:없음`); continue; }
    withShelter++;
    const vil = SimVillages.villageByDbId(vid);
    // 영토 안 — 집채 6×4 **전부**
    let allIn = true, allDry = true;
    for (let x = sh.cx - 5; x <= sh.cx + 0; x++) for (let y = sh.cy - 5; y <= sh.cy - 2; y++) {
      if (!vil._terrSet.has(x + ',' + y)) allIn = false;
      if (H.isTerrainBlockedLocal ? H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) : false) allDry = false;
    }
    if (allIn) inTerr++; else bad.push(`${vid}:영토밖`);
    if (allDry) dry++; else bad.push(`${vid}:물바위`);
    if (Math.hypot(sh.cx - vil.ccx, sh.cy - vil.ccy) >= VL.HALL_CLEAR) offYard++; else bad.push(`${vid}:마당침범`);
    let far = true;
    for (const h of vil._houseCells) if (Math.hypot(h.cx - sh.cx, h.cy - sh.cy) < 18) far = false;
    if (far) noOverlapHouse++; else bad.push(`${vid}:집겹침`);
    // ★설 자리는 **집 밖**이어야 한다 — 문 앞 한 칸(남벽 아래)
    if (sh.y > (sh.cy - 2) * SZ + SZ) doorsOut++; else bad.push(`${vid}:집안`);
  }
  ok(withShelter === vids.length, '② 마을 전수에 쉼터가 하나씩 섰다', `${withShelter}/${vids.length}`);
  ok(inTerr === withShelter, '② 집채 6×4 가 **전부 마을 영토 안**이다', `${inTerr}/${withShelter}`);
  ok(dry === withShelter, '② 물·바위 위가 아니다', `${dry}/${withShelter}`);
  ok(offYard === withShelter, `② 큰집 마당(HALL_CLEAR=${VL.HALL_CLEAR})을 안 밟는다`, `${offYard}/${withShelter}`);
  ok(noOverlapHouse === withShelter, '② 기존 집과 안 겹친다', `${noOverlapHouse}/${withShelter}`);
  ok(doorsOut === withShelter, '② ★깨어날 자리는 **집 밖(문 앞)**이다 — 벽 안에 서지 않는다', `${doorsOut}/${withShelter}`);
  if (bad.length) console.log('    ⚠어긋난 것: ' + bad.slice(0, 8).join(' · '));
  // 멱등 — 다시 불러도 두 채가 서지 않는다
  let again = 0;
  for (const vid of vids) { const r = SimVillages.ensureShelter(vid, Onboarding.arrivalOf(vid)); if (r && r.ok && !r.already) again++; }
  ok(again === 0, '② ★멱등 — 다시 불러도 한 채도 더 안 선다', `${again}채`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ 자리를 고르지 않고 잰다 — 집터 필터 정본을 통과한 자리만');
{
  const vid = vids[0];
  const vil = SimVillages.villageByDbId(vid);
  const sh = SimVillages.shelterOf(vid);
  ok(!!sh, '③ [상황] 그 마을에 쉼터가 있다');
  // 정본 필터를 **그대로** 불러 그 자리가 통과하는지 본다(하네스가 규칙을 다시 안 적는다)
  const F = SimVillages.__probe && SimVillages.__probe.lifeSiteFilters ? SimVillages.__probe.lifeSiteFilters(vil) : null;
  if (F) {
    // ★자기 자신을 거절 대상에서 뺀다 — 쉼터가 이미 서 있으면 `reject` 가 **자기 자리**를 막는다
    //   (그 가드는 "다음 집이 쉼터를 밟지 않게" 하려고 붙인 것이고, 여기서 재려는 건 **고를 때의 판정**이다).
    const _keep = vil._shelter; vil._shelter = null;
    const _r = F.reject(sh.cx, sh.cy, false);
    vil._shelter = _keep;
    ok(!_r, '③ 쉼터 자리는 **집터 필터 정본**을 통과한다(사본 금지)', _r || '');
    // ★대조 — 물 한복판은 거절당한다(필터가 상수가 아니다)
    let refused = null;
    for (let d = 1; d < 200 && !refused; d++) { const r = F.reject(vil.ccx + d, vil.ccy, false); if (r) refused = r; }
    ok(!!refused, '③ ★대조 — 같은 필터가 **거절도 한다**(늘 통과하는 필터가 아니다)', refused || '');
  } else {
    ok(false, '③ 집터 필터 정본을 하네스가 못 쥔다(`__probe.lifeSiteFilters` 필요)');
    ok(false, '③ 대조 실험 불가');
  }
  // 도착 지점에 가까운 쪽을 골랐는가 — 어귀의 쉼터
  const a = Onboarding.arrivalOf(vid);
  if (a && sh) {
    const dSh = Math.hypot(sh.cx - a.cx, sh.cy - a.cy), dCtr = Math.hypot(vil.ccx - a.cx, vil.ccy - a.cy);
    ok(dSh <= dCtr + 1, '③ 쉼터는 **어귀 쪽**이다 — 마을 중심보다 도착 지점에 가깝다',
      `쉼터 ${dSh.toFixed(1)}셀 vs 중심 ${dCtr.toFixed(1)}셀`);
  } else ok(false, '③ 도착 지점을 못 얻었다');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 저장·로드 왕복 — 쉼터가 재시작을 넘는가 (T45 의 재판 금지)');
{
  const vid = vids[0];
  const before = SimVillages.shelterOf(vid);
  // ★자식 프로세스로 **같은 DB 를 다시 연다** — 같은 프로세스에서 재는 건 왕복이 아니다(T45 가 배운 것).
  const code = `
    process.env.ZONE_ID='hanbando'; process.env.PORT='${37750 + (process.pid % 120)}';
    process.env.DB_PATH=${JSON.stringify(TMP)}; process.env.ENABLE_VILLAGES='1';
    process.env.ENABLE_WILDLIFE='0'; process.env.ENABLE_BANDITS='0'; process.env.ENABLE_ROADS='0';
    process.env.SHELTER_BACKFILL='0'; process.env.NEWCOMER_ENABLE='0'; process.env.CLAIM_ABSENCE='0';
    const _l=console.log; console.log=()=>{};console.warn=()=>{};console.error=()=>{};
    const Z=require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))});
    const H=Z.__testBind(); const s=H.SimVillages.shelterOf(${vid});
    console.log=_l; console.log(JSON.stringify(s)); process.exit(0);`;
  let after = null;
  try { after = JSON.parse(String(execFileSync(process.execPath, ['-e', code], { timeout: 180000 })).trim() || 'null'); }
  catch (e) { after = null; console.log('    ⚠자식 프로세스 실패: ' + (e.message || '').slice(0, 120)); }
  ok(!!before, '④ [상황] 재시작 전에 쉼터가 있었다');
  ok(!!after, '④ ★재시작 뒤에도 쉼터가 있다 — 종류를 잃지 않는다');
  ok(!!(before && after && before.cx === after.cx && before.cy === after.cy),
    '④ ★★같은 자리다 — 좌표가 왕복을 넘는다', `${before ? before.cx + ',' + before.cy : '?'} → ${after ? after.cx + ',' + after.cy : '?'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ 이송 좌표 = 쉼터 — T43 의 문장이 참이 됐다');
{
  const vid = vids[0];
  const vil = SimVillages.villageByDbId(vid);
  const sh = SimVillages.shelterOf(vid);
  const w = H.nearestVillageWake(vil.ccx * SZ + SZ / 2, vil.ccy * SZ + SZ / 2);
  ok(!!w, '⑤ [상황] 깨어날 자리가 나온다');
  ok(!!(w && sh && Math.abs(w.x - sh.x) < 1 && Math.abs(w.y - sh.y) < 1),
    '⑤ ★마을 안에서 쓰러지면 **쉼터 앞**에서 깨어난다', w ? `(${w.x.toFixed(0)},${w.y.toFixed(0)}) kind=${w.kind}` : '');
  ok(!!(w && w.kind === 'shelter'), '⑤ 그 자리가 스스로 "쉼터"라고 말한다(도착 지점 폴백이 아니다)');
  // ★대조 — 쉼터를 잠깐 지우면 **도착 지점**으로 떨어진다(사다리가 상수가 아니다)
  const keep = vil._shelter; vil._shelter = null;
  const w2 = H.nearestVillageWake(vil.ccx * SZ + SZ / 2, vil.ccy * SZ + SZ / 2);
  vil._shelter = keep;
  ok(!!(w2 && w2.kind !== 'shelter'), '⑤ ★대조 — 쉼터가 없으면 **다른 답**이 나온다(사다리가 살아 있다)', w2 ? w2.kind : '');
  // 문장이 실제로 "쉼터"라고 말한다
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/마을 사람들이 당신을 쉼터로 옮겼다/.test(zsrc), '⑤ 그 문장이 그대로 있다 — 이제 거짓이 아니다');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 유저 마을은 백필하지 않는다 — 창설자가 짓는다');
{
  const vid = vids[0];
  const vil = SimVillages.villageByDbId(vid);
  const keepSh = vil._shelter, keepF = vil.econ.founder;
  vil._shelter = null; vil.econ.founder = 'pretend_player';
  const r = SimVillages.ensureShelter(vid, Onboarding.arrivalOf(vid));
  ok(!(r && r.ok), '⑥ ★사람이 세운 마을엔 백필이 안 든다 — 그래야 T19 자격이 자명 통과가 아니다', r && r.err ? r.err : '');
  ok(!SimVillages.hasShelter(vid), '⑥ 그래서 그 마을은 아직 쉼터가 없다');
  // ★대조 — 창설자 표지만 떼면 같은 호출이 성공한다(막은 것이 그 표지임을 증명)
  vil.econ.founder = null;
  const r2 = SimVillages.ensureShelter(vid, Onboarding.arrivalOf(vid));
  ok(!!(r2 && r2.ok), '⑥ ★대조 — 표지만 떼면 같은 호출이 통과한다(막은 것이 그 표지다)');
  vil.econ.founder = keepF; vil._shelter = keepSh;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑦ 재료·크기를 발명하지 않았다 — 움집에서 유도');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const st = H.SHELTER_STAGES;
  ok(Array.isArray(st) && st.length === 3, '⑦ 공정이 셋이다 — 움집 넷에서 **①수혈만 뺐다**', `${st && st.length}단계`);
  ok(st.every((s) => !s.tool), '⑦ 곡괭이를 요구하지 않는다 — 파지 않으니까(빈손 사다리 위)');
  const need = Object.assign({}, ...st.map((s) => s.need));
  ok(need.pillar === 6 && need.rafter === 8 && need.fiber === 6 && need.thatch === 8,
    '⑦ ★재료가 움집 ②③④ **그대로**다', JSON.stringify(need));
  // 소스 대조 — HUT_STAGES 의 그 수와 같은가(두 표가 갈리면 빨개진다)
  const hut = zsrc.slice(zsrc.indexOf('const HUT_STAGES'), zsrc.indexOf('function tryHutStart'));
  ok(/pillar: 6/.test(hut) && /rafter: 8, fiber: 6/.test(hut) && /thatch: 8/.test(hut),
    '⑦ ★움집 정본의 수와 대조 — 같다(한쪽이 바뀌면 이 줄이 빨개진다)');
  ok(/PSITE_COST = \{ pillar: 6, rafter: 8, thatch: 8 \}/.test(zsrc),
    '⑦ 같은 수가 이미 한 번 더 쓰이고 있다(`PSITE_COST`) — 새 눈금이 아니라 세 번째 재사용');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑧ ★이 하네스가 실패할 줄 아는가 — 일부러 틀린 것을 넣는다');
{
  const vid = vids[0];
  const vil = SimVillages.villageByDbId(vid);
  // ⓐ 쉼터를 지우면 `hasShelter` 가 꺼진다(상수가 아니다)
  const keep = vil._shelter;
  ok(SimVillages.hasShelter(vid) === true, '⑧ⓐ [상황] 지금은 있다');
  vil._shelter = null;
  ok(SimVillages.hasShelter(vid) === false, '⑧ⓐ 지우면 없다고 답한다');
  vil._shelter = keep;
  ok(SimVillages.hasShelter(vid) === true, '⑧ⓐ 되돌리면 다시 있다고 답한다 — **상수가 아니다**');
  // ⓑ 없는 마을엔 null (좌표를 지어내지 않는다)
  ok(SimVillages.shelterOf(999999) === null, '⑧ⓑ 없는 마을엔 **좌표를 지어내지 않는다**');
  // ⓒ 자리 없이 부르면 거절한다
  const r = SimVillages.addShelter(999999, 10, 10);
  ok(!(r && r.ok), '⑧ⓒ 없는 마을엔 못 세운다', r && r.err ? r.err : '');
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
