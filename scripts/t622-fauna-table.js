#!/usr/bin/env node
// === scripts/t622-fauna-table.js — T622 짐승 존 칸 표(보고용 계측기 · 제품 무접촉) ===================================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// 내는 것(카드 T622 ③):
//   ⓐ 존 칸 표 — 게임 종 8줄(T607 칸 그대로) · 새 종 후보 8 · 곰 두 줄(짝 미정)
//   ⓑ 존별 출현 종 — 첫 스폰 목록(카탈로그 · biome) ∪ 야생 블록(랩 다섯 종 → 본체 종) · 끔/켬
//   ⓒ 실부팅 첫 스폰 마릿수(한반도 · 닛폰 × 끔/켬 · 임시 DB) → 사냥 드롭 바뀜(카탈로그 drops × 마릿수)
//   ⓓ region-profiles TV 짐승 줄 끔/켬
//   ⓔ 재민 칸 — 표 밖 종을 다르게 읽으면(곰 = 불곰 · 범위 밖 "양쪽 다 없음" 적용) 무엇이 빠지나(목록 셈 · 제품 무접촉)
//
// 쓰는 법: node scripts/t622-fauna-table.js [out.json]          (실부팅 넷 — 2코어에서 3~5분)
//          T622_PROBE=boot ZONE_ID=nippon [T622_ZONE_FAUNA=1] [T622_ROOT=<다른 트리>] node scripts/t622-fauna-table.js
//            → 그 존 하나를 띄워 종별 마릿수 + 지문(sha256 · 종·자리·hp 정렬)을 한 줄 JSON 으로(끔 = main 바이트 대조용)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = process.env.T622_ROOT || path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

if (process.env.T622_PROBE === 'boot') {
  const TMP = `/tmp/t622-table-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.PORT = String(42100 + (process.pid % 800));
  process.env.DB_PATH = TMP;
  const _log = console.log, logs = [];
  console.log = (...a) => { logs.push(a.join(' ')); };
  console.warn = () => {}; console.error = () => {};
  const t0 = Date.now();
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const cnt = {}, rows = [];
  for (const m of H.mobs.values()) { cnt[m.type] = (cnt[m.type] || 0) + 1; rows.push(`${m.type}|${Math.round(m.x * 100)}|${Math.round(m.y * 100)}|${m.hp}|${String(m.packId || '').replace(/_[a-z0-9]*$/, '')}`); }   // 팩 id 끝 4자는 Math.random(씨 밖) — 뺀다
  rows.sort();
  const fp = crypto.createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16);
  console.log = _log;
  console.log(JSON.stringify({ zone: process.env.ZONE_ID, knob: process.env.T622_ZONE_FAUNA || null, root: ROOT, bootMs: Date.now() - t0, n: H.mobs.size, cnt, fp,
    t622: logs.filter((s) => /T622 존 칸/.test(s)) }));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

const A = require(SV('animals.js'));
const RP = require(SV('region-profiles.js'));
const ZC = require(SV('zone-config.js'));
const WSRC = fs.readFileSync(SV('wildlife.js'), 'utf8');
const withEnv = (env, fn) => { const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } } };
delete process.env.T622_ZONE_FAUNA;
const ZONES = ['hanbando', 'nippon'];
const ko = (id) => (A.ANIMALS[id] ? A.ANIMALS[id].ko : id);
// 야생 블록의 랩 → 본체 종(wildlife.js MAIN_TYPE 정본을 글자로 읽는다 · 사본 0)
const MAIN = (() => { const m = WSRC.match(/const MAIN_TYPE = (\{[^}]*\});/); return m ? Object.values(Function('return ' + m[1])()) : []; })();

const res = { at: new Date().toISOString(), table: {}, lists: {}, boot: {}, drops: {}, tv: {}, alt: {} };
// ⓐ 표
res.table = {
  rows: A.ZONE_FAUNA.map((r) => ({ id: r.id, ko: ko(r.id), t607: r.t607, hb: r.hb, np: r.np, st: r.st, diff: !!r.diff })),
  newCand: A.FAUNA_NEW.map((r) => ({ t607: r.t607, hb: r.hb, np: r.np, diff: !!r.diff, note: r.note || '' })),
  bear: A.FAUNA_BEAR.map((r) => ({ t607: r.t607, hb: r.hb, np: r.np, note: r.note || '' })),
};
// ⓑ 목록
const listOf = (z, on) => withEnv({ T622_ZONE_FAUNA: on ? '1' : null }, () => {
  const cat = A.huntableInBiome(ZC.ZONES[z].biome, z);
  const wild = MAIN.filter((id) => !(on && A.faunaCell(id, z) === '없음'));
  const all = [...new Set([...cat, ...wild])];
  return { biome: ZC.ZONES[z].biome, cat, wild, all };
});
for (const z of ZONES) res.lists[z] = { off: listOf(z, false), on: listOf(z, true) };
// T607 있음인데 지금 안 나는 게임 종(재민 칸 — 이 카드는 없음 = 안 남만 한다 · 있음 = 남은 안 한다)
res.lists.presentButAbsent = {};
for (const z of ZONES) res.lists.presentButAbsent[z] = A.ZONE_FAUNA.filter((r) => r[A.FAUNA_ZONES[z]] === '있음' && !res.lists[z].off.all.includes(r.id)).map((r) => r.id);
// ⓓ TV
res.tv = { off: RP.tvTable().fauna, on: withEnv({ T622_ZONE_FAUNA: '1' }, () => RP.tvTable().fauna) };
// ⓔ 재민 칸 — 다르게 읽으면(목록 셈 · 첫 스폰 식 그대로: 평화 300 은 밀도 비례 · 공격 150 은 팩 고르게 뽑기 → 기대 마릿수 ∝ pack)
const expect = (ids) => {
  const pe = ids.filter((id) => !A.ANIMALS[id].aggressive), ag = ids.filter((id) => A.ANIMALS[id].aggressive), out = {};
  if (pe.length) { const td = pe.reduce((s, id) => s + (A.ANIMALS[id].spawn_density || 0.03), 0); for (const id of pe) out[id] = Math.max(1, Math.round(300 * (A.ANIMALS[id].spawn_density || 0.03) / td)); }
  else out.sheep = 50;   // zone.js 폴백(평화 0종이면 양 50)
  if (ag.length) { const tp = ag.reduce((s, id) => s + (A.ANIMALS[id].pack || 1), 0); for (const id of ag) out[id] = +(150 * (A.ANIMALS[id].pack || 1) / tp).toFixed(1); }
  return out;
};
const OUT_OF_SCOPE = Object.keys(A.ANIMALS).filter((id) => !A.ANIMALS[id].breeding && !A.ZONE_FAUNA.some((r) => r.id === id) && id !== 'bear' && id !== 'ibex');
for (const z of ZONES) {
  const base = res.lists[z].on.cat;
  res.alt[z] = {
    asIs: { list: base, exp: expect(base) },
    bearBrown: (() => { const l = A.FAUNA_BEAR[1][A.FAUNA_ZONES[z]] === '없음' ? base.filter((id) => id !== 'bear') : base; return { list: l, exp: expect(l), note: A.FAUNA_BEAR[1][A.FAUNA_ZONES[z]] }; })(),
    outScope: (() => { const l = base.filter((id) => !OUT_OF_SCOPE.includes(id) && id !== 'ibex'); return { list: l, cut: base.filter((id) => !l.includes(id)), exp: expect(l) }; })(),
  };
}
res.outOfScope = OUT_OF_SCOPE;

// ⓒ 실부팅 넷(둘씩)
const run = (env) => new Promise((ok) => {
  const p = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', () => {});
  p.on('close', () => { try { ok(JSON.parse(out.trim().split('\n').pop())); } catch (e) { ok({ err: out.slice(-300) }); } });
});
(async () => {
  for (const z of ZONES) {
    const [off, on] = await Promise.all([run({ T622_PROBE: 'boot', ZONE_ID: z, T622_ZONE_FAUNA: '' }), run({ T622_PROBE: 'boot', ZONE_ID: z, T622_ZONE_FAUNA: '1' })]);
    res.boot[z] = { off, on };
    // 사냥 드롭 — 카탈로그 drops × 첫 스폰 마릿수(사체 도살 한 번씩)
    const pool = (cnt) => { const o = {}; for (const [id, n] of Object.entries(cnt || {})) for (const [it, q] of Object.entries((A.ANIMALS[id] || {}).drops || {})) o[it] = (o[it] || 0) + q * n; return o; };
    const pOff = pool(off.cnt), pOn = pool(on.cnt);
    const items = [...new Set([...Object.keys(pOff), ...Object.keys(pOn)])].sort();
    res.drops[z] = { off: pOff, on: pOn, items, setSame: Object.keys(pOff).sort().join() === Object.keys(pOn).sort().join(),
      lost: Object.keys(pOff).filter((k) => !(k in pOn)), gained: Object.keys(pOn).filter((k) => !(k in pOff)),
      tigerDrops: A.ANIMALS.tiger.drops };
  }
  const outPath = process.argv[2];
  const js = JSON.stringify(res, null, 1);
  if (outPath) fs.writeFileSync(outPath, js); else console.log(js);
})();
