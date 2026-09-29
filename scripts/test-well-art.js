#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-well-art.js — 우물 그림 (T519) ==================================================
//
// ★이 하네스가 지키는 계약:
//   ① 형상은 **서버 정본의 수**로 짓는다 — `building_render.py` 가 `server/well-stages.js WELL_SRC` 를 **읽는다**(사본 0)
//   ② 단계 그림 셋(`well_s1` 착공 구덩이 · `well_s2` 자갈 벽 쌓는 중 · `well` 완성) — 노 터·가마 구덩이와 **같은 2×2 틀·앵커**
//      · 배포 메타 · 클라 앵커 표 · 굽는 표가 한 값(수 대조는 `test-building-anchor` 몫 — 여기선 **세 키가 거기 다 있나**만)
//   ③ 그림이 말하는 것 — 완성 우물엔 **게임 물 색**(42·80·120)이 있고 터 둘엔 없다 · 쌓는 중은 착공보다 돌이 많다
//   ④ 클라 — `36-r2-building` 이 `well_s{stage}`·`well` 을 고르고, 공정 수(`/2단계`)는 `WELL_STAGES.length` 와 같다 ·
//      터를 누르는 배선이 없는 동안 라벨이 "(클릭=…)" 을 약속하지 않는다(메뉴·라벨이 거짓말을 안 한다)
//   ⑤ 아이콘 하나 — `icons/well.png` 96² · 알파 · `ICON_RENDERED` 에 올랐다 · 잠금표(건물 셋 + 아이콘 하나)
//   ⑥ 우물가 E 문구 = 물가 E 문구와 **같은 문법**(실서버 함수 왕복 · 손잡이 켬) — 마시기는 같은 몸통 · 담기는 `where` 만 다르다 ·
//      완공 안내의 그릇 이름은 **이름표 정본**에서 온다(글자 무변)
// 실행: node scripts/test-well-art.js
'use strict';
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const BLD = path.join(ROOT, 'public', 'assets', 'buildings');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const png = (p) => PNG.sync.read(fs.readFileSync(p));
const KEYS = ['well_s1', 'well_s2', 'well'];

console.log('\n=== 우물 그림 (T519) ===');

console.log('\n① 형상 = 서버 정본의 수(사본 0)');
const py = rd('scripts/building_render.py');
const WS = require(path.join(ROOT, 'server', 'well-stages.js'));
{
  ok(/def _well_src\(\)/.test(py) && /well-stages\.js/.test(py) && /mouthCm/.test(py) && /depthCm/.test(py) && /stoneCm/.test(py),
     '① `_well_src()` 가 `server/well-stages.js` 의 WELL_SRC 를 읽는다');
  const code = py.split('\n').filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s#.*$/, '')).join('\n');
  const well = code.slice(code.indexOf('def _well_src'), code.indexOf('JOBS = ['));
  //   (0.55·1.1 은 뺀다 — 아가리 수와 같은 글자가 흙덩이 눌림 `1.3·1.3·0.55`·돌 눌림 `1.1·1.1·0.78`(가마·노 문법)으로 따로 쓰인다)
  const lits = ['110', '79', '61', '1.10', '0.79', '0.61', '0.395', '0.305'].filter((n) => new RegExp(`(^|[^\\w.])${n.replace('.', '\\.')}([^\\w.]|$)`).test(well));
  ok(lits.length === 0, '① 우물 빌더 코드에 출토 수 **리터럴 0**(아가리·깊이는 읽은 값으로만)', lits.join(' ') || '없음');
  const per = Math.ceil(Math.PI * ((WS.WELL_SRC.mouthCm[0] + WS.WELL_SRC.mouthCm[1]) / 2) / ((WS.WELL_SRC.stoneCm[0] + WS.WELL_SRC.stoneCm[1]) / 2));
  ok(per * WS.WELL_SRC.tiers === WS.WELL_PEBBLES && /math\.ceil\(math\.pi \* S\["mean_mouth"\] \/ S\["mean_stone"\]\)/.test(py),
     '① 그림의 단마다 자갈 = 서버 `WELL_PEBBLES` 와 **같은 식**(⌈π·평균지름 ÷ 돌 평균⌉) — 그림 속 돌 40 = 서버가 먹는 자갈 40', `${per} × ${WS.WELL_SRC.tiers} = ${WS.WELL_PEBBLES}`);
}

console.log('\n② 단계 그림 셋 — 2×2 틀 · 앵커 · 세 자리');
{
  const meta = JSON.parse(rd('public/assets/buildings/building_anchors.json'));
  const ref = meta.furn_s1;
  for (const k of KEYS) {
    const f = path.join(BLD, k + '.png');
    ok(fs.existsSync(f), `② ${k}.png 가 배포돼 있다`);
    if (!fs.existsSync(f)) continue;
    const im = png(f);
    ok(im.width === ref.w && im.height === ref.h && meta[k] && meta[k].ox === ref.ox && meta[k].oy === ref.oy,
       `② ${k}: 틀·앵커가 노 터(furn_s1)와 같다 — 같은 2×2 계약`, `${im.width}×${im.height} (${meta[k] && meta[k].ox},${meta[k] && meta[k].oy})`);
  }
  const vis = rd('public/client/20-r2-visibility.js');
  const A = (vis.match(/const A = \{([^}]+)\}/) || [])[1] || '';
  ok(KEYS.every((k) => new RegExp(`\\b${k}:\\s*\\[`).test(A)), '② 클라 앵커 표 `A` 에 세 키가 있다(수 대조는 `test-building-anchor`)');
  const jobs = py.slice(py.indexOf('JOBS = ['), py.indexOf('\n]\n', py.indexOf('JOBS = [')) + 2);
  ok(KEYS.every((k) => new RegExp(`\\("${k}", ${k}, 2\\.0, 2\\.0, 0\\.30\\)`).test(jobs)), '② 굽는 표 JOBS 에 셋 다 2×2 · top 0.30(노 터·가마 구덩이와 같은 틀)');
  const ta = rd('scripts/test-building-anchor.js');
  ok(KEYS.every((k) => new RegExp(`\\b${k}: anchor\\(2, 2, 0\\.30\\)`).test(ta)), '② `test-building-anchor` 굽는 표 사본에도 셋 다 있다');
}

console.log('\n③ 그림이 말하는 것 — 물 · 돌');
{
  const WATER = [42, 80, 120];
  const count = (k, pred) => { const im = png(path.join(BLD, k + '.png')); let n = 0;
    for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] === 255 && pred(im.data[i], im.data[i + 1], im.data[i + 2])) n++; return n; };
  const isWater = (r, g, b) => Math.abs(r - WATER[0]) <= 2 && Math.abs(g - WATER[1]) <= 2 && Math.abs(b - WATER[2]) <= 2;
  const w = KEYS.map((k) => count(k, isWater));
  ok(w[2] >= 60 && w[0] === 0 && w[1] === 0, '③ 완성 우물에만 **게임 물 색**(42·80·120 = `10-r1-terrain` 깊은 물 화면색)이 있다 — 터 둘엔 0', `s1 ${w[0]} · s2 ${w[1]} · 완성 ${w[2]}`);
  ok(/WELL_WATER_SRGB = \(42, 80, 120\)/.test(py), '③ 물 색은 한 자리(`WELL_WATER_SRGB`)에서 온다');
  const isStone = (r, g, b) => r > 110 && Math.abs(r - g) < 14 && Math.abs(g - b) < 16;   // 회색 자갈(흙은 붉고 물은 푸르다)
  const s = KEYS.map((k) => count(k, isStone));
  ok(s[1] > s[0] + 40 && s[2] > s[0] + 40, '③ 쌓는 중·완성은 착공 구덩이보다 **돌이 많다**(착공엔 자갈이 없다)', `회색 화소 s1 ${s[0]} · s2 ${s[1]} · 완성 ${s[2]}`);
  // ★자명 통과 금지 — 물 판정이 실제로 무는가
  ok(isWater(42, 80, 120) && !isWater(90, 70, 50), '③ 자명 통과 금지 — 물 판정은 물 색을 물고 흙 색은 안 문다');
}

console.log('\n④ 클라 — 그림 고르기 · 공정 수 · 라벨이 거짓말을 안 한다');
{
  const b = rd('public/client/36-r2-building.js');
  const i0 = b.indexOf("if (type === 'well_site' || type === 'well')");
  const blk = i0 >= 0 ? b.slice(i0, b.indexOf('return;', b.indexOf('ctx.textAlign = \'left\';', i0)) + 7) : '';
  ok(!!blk && /_bldSpr\[done \? 'well' : \('well_s' \+ st\)\]/.test(blk), "④ `36-r2-building` 이 터는 `well_s{stage}` · 완공은 `well` 을 고른다");
  ok(/\(_d\.x0 - 0\.5\) \* CL_BUILDING_SIZE - building\.x/.test(blk), '④ 앵커는 노·숯가마와 같은 델타 변환(북서 오버행 모서리)');
  const m = blk.match(/우물 터 \$\{st\}\/(\d+)단계/);
  ok(!!m && +m[1] === WS.WELL_STAGES.length, '④ 라벨의 공정 수 = `WELL_STAGES.length`(사본을 여기서 못 박는다)', m ? `${m[1]} = ${WS.WELL_STAGES.length}` : '라벨 없음');
  const net = rd('public/client/30-n-net.js'), verbs = rd('public/client/46-h-verbs.js');
  const wired = /well_advance/.test(net) || /well_advance/.test(verbs);
  ok(wired || !/클릭=/.test(blk), '④ ★터를 누르는 배선이 없는 동안 라벨이 "(클릭=…)" 을 약속하지 않는다', wired ? '배선 있음' : '배선 없음 · 약속 없음');
  ok(/'well'/.test(rd('public/client/43-i-icon.js')), "④ 아이콘 목록 `ICON_RENDERED` 에 `'well'`");
}

console.log('\n⑤ 아이콘 하나 · 잠금표');
{
  const f = path.join(ROOT, 'public', 'assets', 'icons', 'well.png');
  ok(fs.existsSync(f), '⑤ icons/well.png 가 있다');
  if (fs.existsSync(f)) {
    const im = png(f); let clear = 0, solid = 0;
    for (let i = 3; i < im.data.length; i += 4) { if (im.data[i] === 0) clear++; else if (im.data[i] === 255) solid++; }
    ok(im.width === 96 && im.height === 96 && clear > 200 && solid > 200, '⑤ 96×96 · 알파가 살아 있다', `${im.width}×${im.height} · 투명 ${clear} · 불투명 ${solid}`);
  }
  const lock = JSON.parse(rd('public/assets/icons.lock.json'));
  const L = require('./asset-lock.js');
  const want = [['buildings', 'well_s1'], ['buildings', 'well_s2'], ['buildings', 'well'], ['icons', 'well']];
  const bad = want.filter(([g, k]) => !lock[g] || lock[g][k] !== L.lockValue(path.join(ROOT, 'public', 'assets', g, k + '.png')).hash);
  ok(bad.length === 0, '⑤ 잠금표에 넷(건물 셋 · 아이콘 하나) — 화소 해시가 같다', bad.map((x) => x.join('/')).join(' ') || '넷 다');
  ok(/ICON_BUILD = \[\("well", well\)\]/.test(py) && /BLD_ICONS/.test(py), '⑤ 아이콘은 **같은 빌더**를 아이콘 프리셋으로 굽는다(새 형상 0 · `BLD_ICONS=1`)');
}

console.log('\n⑥ 우물가 E 문구 = 물가 E 문구 (실서버 함수 왕복 · 손잡이 켬)');
{
  const zsrc = rd('server/zone.js');
  ok(/doneHint: `우물가에서 E — 목을 축이고, \$\{ITEM_LABEL_SERVER\[Salt\.VESSEL\]\}이 있으면 민물을 담는다`/.test(zsrc),
     '⑥ 완공 안내의 그릇 이름은 이름표 정본(`ITEM_LABEL_SERVER[Salt.VESSEL]`)에서 — 물가 문구와 같은 문법');
  const TMP = `/tmp/test-well-art-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.T509_WELL = '1';
  process.env.ZONE_ID = 'hanbando'; process.env.PORT = String(38100 + (process.pid % 300)); process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  console.log = _l; console.warn = _w; console.error = _e;
  const SZ = H.BUILDING_SIZE;
  ok(H.WELL_SPEC.doneHint === '우물가에서 E — 목을 축이고, 물병이 있으면 민물을 담는다', '⑥ 글자 무변 — 정본에서 지은 안내가 종전 글자와 같다', H.WELL_SPEC.doneHint);
  let _pid = 0;
  const mk = (name, o = {}) => { const notices = []; const ws = { readyState: 1, send: (s) => { try { const m = JSON.parse(s); if (m.type === 'notice') notices.push(m.text); } catch (e) {} } };
    return { playerId: `twa_${++_pid}`, pid: `pwa_${_pid}`, name, ws, x: 0, y: 0, floor: 0, inventory: Object.assign({}, o.inv || {}),
      toolItems: (o.tools || []).map((t, i) => ({ id: `twa${_pid}_${i}`, type: t, d: 100, max: 100 })), equipped: null, tribeId: null,
      hunger: 100, thirst: o.thirst == null ? 100 : o.thirst, oreCarry: {}, lots: {}, notices, persistent: false }; };
  // 물가 — 민물 칸(바다 아님) 서쪽의 마른 땅
  let wat = null;
  for (let cy = 200; cy < 2500 && !wat; cy++) for (let cx = 200; cx < 2500 && !wat; cx++) {
    const px = cx * SZ + SZ / 2, py2 = cy * SZ + SZ / 2;
    if (!H.isWaterTileLocal(px, py2) || H.isSeaTileLocal(px, py2)) continue;
    if (H.isWaterTileLocal(px - SZ, py2) || H.isTerrainBlockedLocal(px - SZ, py2)) continue;
    wat = { x: px - SZ, y: py2 };
  }
  ok(!!wat, '⑥ [상황] 민물 칸 옆 마른 땅', wat ? `${wat.x},${wat.y}` : 'null');
  // 우물 — `test-well` 과 같은 자리 찾기(물·바위 없는 6×6)
  let spot = null;
  for (let cy = 300; cy < 1500 && !spot; cy += 3) for (let cx = 300; cx < 1500 && !spot; cx += 3) {
    let clear = true;
    for (let x = cx - 4; x <= cx + 5 && clear; x++) for (let y = cy - 4; y <= cy + 5 && clear; y++) {
      if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) || H.isWaterTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear = false;
    }
    if (clear) spot = { cx, cy };
  }
  const P = mk('우물꾼', { inv: { pebble: WS.WELL_PEBBLES }, tools: ['pickaxe'] });
  for (let x = spot.cx; x <= spot.cx + 1; x++) for (let y = spot.cy; y <= spot.cy + 1; y++) {
    H.claims.set(H.newClaimId(), { id: 'c' + x + '_' + y, ownerPid: P.playerId, ownerName: P.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', guildTribeId: null, createdAt: 0 });
  }
  P.x = (spot.cx + 1) * SZ; P.y = (spot.cy + 1) * SZ;
  console.log = () => {};                                   // 착공·완공 로그 한 줄씩 — 판정 출력에 안 섞는다
  const site = H.tryWellStart(P, spot.cx * SZ + 1, spot.cy * SZ + 1);
  const done = site && H.tryWellAdvance(P, site.id);
  console.log = _l;
  ok(!!done && done.type === 'well', '⑥ [상황] 우물이 섰다(켬 · 사유지 · 곡괭이 · 자갈)');
  const well = { x: (spot.cx - 1) * SZ + SZ / 2, y: spot.cy * SZ + SZ / 2 };
  const E = (at, o) => { const p = mk('E', o); p.x = at.x; p.y = at.y; H.tryGather(p); return { t: p.notices.join(' | '), inv: p.inventory, th: p.thirst }; };
  const wd = E(wat, { thirst: 50 }), ud = E(well, { thirst: 50 });
  ok(wd.th === 80 && ud.th === 80 && wd.t === ud.t, '⑥ 목마를 때 E — 물가·우물 **같은 문구 · 같은 수**', `"${ud.t}"`);
  const wf = E(wat, { thirst: 100, inv: { water_bottle: 2 } }), uf = E(well, { thirst: 100, inv: { water_bottle: 2 } });
  const norm = (t) => t.replace(/^(\S*\s*)?(물가|우물)에서/, '$1<곳>에서');
  ok((uf.inv.fresh_water || 0) === 1 && (wf.inv.fresh_water || 0) === 1 && norm(wf.t) === norm(uf.t) && /우물에서/.test(uf.t) && /물가에서/.test(wf.t),
     '⑥ 목이 차고 병이 있으면 E — 같은 문구에 **곳만** 다르다(물가 ↔ 우물)', `"${wf.t}" ↔ "${uf.t}"`);
  const lab = H.ITEM_LABEL_SERVER;
  ok(uf.t.includes(lab.fresh_water) && H.WELL_SPEC.doneHint.includes(lab.water_bottle), '⑥ 담긴 것·그릇의 이름은 이름표 정본 그대로(민물 한 되 · 물병)', `${lab.fresh_water} · ${lab.water_bottle}`);
  // ★자명 통과 금지 — 비교가 실제로 무는가(곳 말고 다른 낱말이 갈리면 잡는다)
  ok(norm('물가에서 민물 한 되 1') !== norm('우물에서 짠물 1'), '⑥ 자명 통과 금지 — 곳 말고 다른 낱말이 갈리면 비교가 문다');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
process.exit(fail ? 1 : 0);
