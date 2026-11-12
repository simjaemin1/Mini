#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1107-regrow.js — 나무 재생 속도 배수 · 마을 둘레 흩어진 나무(T1107 · ★재민 11-02 문 7) ==================
//
// 지키는 것:
//   ① `T1107_REGROW_K` — 미설정 · `0` · 음수 = 종전 종 시계(`chunk.regrowStageOf` 글자 그대로) · k > 0 = 경과 날 × k(나무만 · 덤불 · 풀 · 군락 무변)
//      ★자명 통과 금지: k 를 준 판의 단계가 실제로 바뀐다(400일 그루터기 → k 8 이면 큰 나무가 되는 종이 있다)
//   ② 생활층 헤드리스 하루의 T341 로지스틱 되살림은 손잡이 켬이면 안 돈다(문 한 줄 · 정본 값을 묻는 자리 하나)
//   ③ `T1107_VILLAGE_TREES` — 미설정 · 그 밖 값 = 청크 산출 **바이트 같음** · `low` ⊂ `mid` ⊂ `high`(같은 씨 키 · 같은 자리) ·
//      나무 몸(종 · 반경 · 키) · 벤 장부가 있으면 종 시계로 그루터기 · 결정론(두 번 같은 답)
//   ④ 굽은 파일 — 마을마다 n 낮음 ≤ n 중간 ≤ n 높음 = 자리 수 · 자리는 물 · 바위 칸이 아니다 · 밀도 셋이 적혀 있다
//
// 실행: node scripts/test-t1107-regrow.js   (존 안 띄움 · 몇 초)
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const sub = (env, code) => {
  const e = Object.assign({}, process.env, env); delete e.NODE_OPTIONS;
  for (const k of ['T1107_REGROW_K', 'T1107_VILLAGE_TREES']) if (!(k in env)) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 256 << 20 }).trim().split('\n').pop());
};
console.log('\n=== T1107 — 나무 재생 속도 배수 · 마을 둘레 흩어진 나무 ===');
// ── ① 종 시계 배수 ──
const STAGES = `const C=require('./server/chunk');const sp=['oak','hazel','pine','willow',null];const o={};for(const s of sp)for(const d of [0,100,400,800,1500,3000,6000,12000]){o[(s||'_')+':'+d]=C.regrowStageOf('tree',d,s);}o.bush=C.regrowStageOf('berry_bush',200,null);o.herb=C.regrowStageOf('herb',100,null);o.k=C.REGROW.REGROW_K();console.log(JSON.stringify(o));`;
const base = sub({}, STAGES), z = sub({ T1107_REGROW_K: '0' }, STAGES), neg = sub({ T1107_REGROW_K: '-2' }, STAGES), k4 = sub({ T1107_REGROW_K: '4' }, STAGES), k8 = sub({ T1107_REGROW_K: '8' }, STAGES);
ok(base.k === 0 && JSON.stringify(z) === JSON.stringify(base) && JSON.stringify(neg) === JSON.stringify(base), '① 미설정 · 0 · 음수 = 종전 종 시계(값 같음)');
{
  let same = 0, n = 0;
  for (const s of ['oak', 'hazel', 'pine', 'willow', '_']) for (const d of [0, 100, 400, 800, 1500, 3000]) { n++; if (k4[s + ':' + d] === base[s + ':' + (d * 4)] || (d * 4 > 12000)) same++; }
  const want = {}; for (const s of ['oak', 'hazel', 'pine', 'willow', '_']) for (const d of [0, 100, 400, 800, 1500, 3000]) if ([0, 100, 400, 800, 1500, 3000, 6000, 12000].indexOf(d * 4) >= 0) want[s + ':' + d] = base[s + ':' + d * 4];
  const keys = Object.keys(want);
  ok(keys.length > 0 && keys.every((k) => k4[k] === want[k]), '① k 4 — 경과 d 의 단계 = 종전 4d 의 단계(같은 함수)', `${keys.length}칸`);
}
ok(k4.bush === base.bush && k4.herb === base.herb && k8.bush === base.bush, '① 덤불 · 풀은 무변(나무만)');
{
  const changed = Object.keys(base).filter((k) => k.includes(':') && base[k] !== k8[k]);
  ok(changed.length > 0 && base['hazel:400'] !== k8['hazel:400'], '① ★자명 통과 금지 — k 8 이면 단계가 실제로 바뀐다', `${changed.length}칸 · hazel 400일 ${base['hazel:400']} → ${k8['hazel:400']}`);
}
// ── ② 로지스틱 되살림 문 ──
{
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/\n    if \(_on && !\(_t1107K\(\) > 0\)\) \{\n      const _r = _lifeEcon\(\)\.woodRegrowR\(/.test(V), '② T341 로지스틱 되살림은 손잡이 켬이면 안 돈다(문 한 줄)');
  ok(/const _t1107K = \(\) => \{ try \{ return require\('\.\/chunk'\)\.REGROW\.REGROW_K\(\); \}/.test(V) && (V.match(/T1107_REGROW_K/g) || []).length <= 3, '② villages 는 env 를 안 읽는다 — 정본(`chunk.REGROW.REGROW_K`)을 묻는다');
  const Cs = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  ok((Cs.match(/process\.env\.T1107_VILLAGE_TREES|'T1107_REGROW_K'/g) || []).length === 2, '② env 를 읽는 자리 둘(배수 · 흩어진 나무 각 하나)');
}
// ── ③ 흩어진 나무 실체화 ──
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'village-trees-hanbando.json'), 'utf8'));
const v0 = DOC.villages.find((v) => v.n && v.n.low > 0);
const kx = Math.floor(v0.t[0][0] / 1024), ky = Math.floor(v0.t[0][1] / 1024);
const GEN = (cut) => `const C=require('./server/chunk');const Z=require('./server/zone-config').ZONES.hanbando;const T=require('./server/terrain');if(T.setZonesMeta)T.setZonesMeta(require('./server/zone-config').ZONES);
const H=new Map(${cut ? `[['vt${DOC.villages.indexOf(v0)}_0', 0]]` : ''});const r=C.generateChunkResources('hanbando',Z.biome,${kx},${ky},1024,H,${cut ? 300 : 'undefined'});console.log(JSON.stringify(r));`;
const off = sub({}, GEN(false)), bad = sub({ T1107_VILLAGE_TREES: '2' }, GEN(false)), low = sub({ T1107_VILLAGE_TREES: 'low' }, GEN(false)), mid = sub({ T1107_VILLAGE_TREES: 'mid' }, GEN(false)), high = sub({ T1107_VILLAGE_TREES: 'high' }, GEN(false)), high2 = sub({ T1107_VILLAGE_TREES: 'high' }, GEN(false));
const vt = (a) => a.filter((r) => /^vt/.test(r.seedKey || ''));
ok(JSON.stringify(bad) === JSON.stringify(off) && vt(off).length === 0, '③ 미설정 · 그 밖 값 = 청크 산출 바이트 같음(흩어진 나무 0)', `${off.length}개`);
ok(JSON.stringify(off) === JSON.stringify(low.filter((r) => !/^vt/.test(r.seedKey || ''))), '③ 켬 판도 원판 개체는 바이트 같음(흩어진 나무만 더한다)');
{
  const ks = (a) => vt(a).map((r) => r.seedKey + '@' + r.x + ',' + r.y);
  const L = ks(low), M = ks(mid), Hh = ks(high);
  ok(L.length > 0 && L.length < M.length && M.length < Hh.length && L.every((k) => M.includes(k)) && M.every((k) => Hh.includes(k)), '③ low ⊂ mid ⊂ high(같은 씨 키 · 같은 자리)', `${L.length} · ${M.length} · ${Hh.length}`);
  ok(JSON.stringify(high) === JSON.stringify(high2), '③ 결정론 — 두 번 같은 답');
  const t = vt(low)[0];
  ok(t && t.type === 'tree' && t.r >= 4 && t.r <= 20 && t.h >= 46 && t.h <= 166 && t.isSeed, '③ 나무 몸 — 다른 나무와 같은 꼴(반경 4~20 · 키 46~166 · 씨 개체)', t ? `${t.sp || '-'} r ${t.r.toFixed(1)}` : '');
}
{
  const cut = sub({ T1107_VILLAGE_TREES: 'low' }, GEN(true));
  const e = cut.find((r) => r.seedKey === `vt${DOC.villages.indexOf(v0)}_0`);
  ok(e && (e.type === 'stump' || e.type === 'sapling'), '③ 벤 장부가 있으면 종 시계 단계(300일 앞에 벤 자리 = 그루터기/어린나무)', e ? e.type : '없음');
}
// ── ④ 굽은 파일 ──
{
  const T = require(path.join(ROOT, 'server', 'terrain')); const ZC = require(path.join(ROOT, 'server', 'zone-config')); if (T.setZonesMeta) T.setZonesMeta(ZC.ZONES);
  let mono = 0, wet = 0, all = 0;
  for (const v of DOC.villages) {
    if (v.n.low <= v.n.mid && v.n.mid <= v.n.high && v.n.high === v.t.length) mono++;
    for (const p of v.t) { all++; if (T.isWaterCellLocal('hanbando', p[0], p[1]) || (T.isRockCellLocal && T.isRockCellLocal('hanbando', p[0], p[1]))) wet++; }
  }
  ok(mono === DOC.villages.length, '④ 마을마다 n 낮음 ≤ 중간 ≤ 높음 = 자리 수', `${mono}/${DOC.villages.length}`);
  ok(all > 0 && wet === 0, '④ 자리는 물 · 바위 칸이 아니다', `${all.toLocaleString('en-US')}자리 · 젖음 ${wet}`);
  ok(DOC.ring === 40 && DOC.density && DOC.density.low > 0 && DOC.density.low < DOC.density.mid && DOC.density.mid < DOC.density.high, '④ 고리 40셀 · 밀도 셋(낮음 < 중간 < 높음)', JSON.stringify(DOC.density));
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
