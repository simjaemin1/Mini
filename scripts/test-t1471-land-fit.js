#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 6   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1471-land-fit.js — 지금 산 · 물인 칸의 마을 땅을 부팅이 바로잡는다 — 건물 · 일터는 옮긴다 [T1471 2026-11-25 · 덧붙임 셋 11-27 · S5] ==========
//
// ★사건: T1296(11-13)이 닛폰 원 고개 둘을 골짜기로 바꾸자 이미 선 세계의 사키농촌 영토 1,131칸 · 집 한 채 부지 · 그 집 사람 다섯의 몸이 도로 산맥 칸 안에 남았다
//   (주민이 산 앞에 뭉친다 — 보고/T1471). 손잡이 `T1471_LAND_FIT`(끔 기본)이 부팅 때 바로잡는다 — 재민 판정 84: 걷지 말고 **가장 가까운 갈 수 있는 칸으로 옮긴다**.
//
// ★재는 것(씨앗 한반도 세계 사본에 산 · 물 칸 행을 심는다 — 지도를 고친 것과 같은 꼴)
//   ① 끔 = main 과 같다 — 심은 사본을 이 가지(끔) · main 나무로 띄운 마을 상태 지문이 마을마다 같다(영토 · 논밭 · 밭 · 존닝 차례까지) · 심은 행 10 은 끔에선 그대로 산 · 물 위.
//   ② 켬 — 영토는 심은 산 · 물 칸만큼 준다(땅 — 옮기지 않는다) · 집 둘(산 속 · 발자국만 걸린 것) · 곳간 · 논 · 밭은 수 그대로 자리만 바뀐다 · 그 마을 행 가운데 걸린 것 0 ·
//      옮긴 집에 살던 몸이 새 집의 같은 침대 자리를 받는다(집주인이 따라간다) · 다른 마을 = 끔과 같은 지문 · 로그 · 셈.
//   ③ 켬 뒤 DB — 옛 칸 행 0 · 집 · 곳간 · 논 · 밭 행 수 그대로 · 논 존닝(개간 예정 표시)만 걷음 · 의뢰 집(플레이어 것) · 들 칸 영토 · 도랑 그대로.
//   ③ⓑ 자리가 없을 때만 걷는다 — 옮길 자리를 못 찾게 한 사본: 집 두 채를 걷고 한 채 재료(집 짓는 표)씩 곳간에 넣는다.
//   ④ 켬으로 한 번 더 띄우면 바로잡을 것 0 · 지문이 ② 와 같다.
//   ⑤ 미끼(자명 통과 금지) — 물 칸을 안 보는 사본 · 발자국 대신 가운데 칸만 보는 사본 · 옮긴 집 행을 DB 에 안 적는 사본 · 끔에서도 도는 사본 · 옮긴 집을 명부 끝에 붙이는 사본 · 몸을 안 옮기는 사본이 각각 문다.
//   ⑥ 몸 — 저장 자리가 산 속인 몸 셋(사본 안에서만 심는다)이 켬 부팅 뒤 집 앞에 선다.
//
// 실행: node scripts/test-t1471-land-fit.js     env: T1471_MAIN(대조 나무 · 기본 = `git worktree` 로 merge-base 를 /tmp 에)
'use strict';
const path = require('path'), fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { ensureSeed } = require('./slicer-seed.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WD = fs.mkdtempSync('/tmp/t1471fit-');
const cpDb = (src, dst) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dst + s); } catch (e) {} try { fs.copyFileSync(src + s, dst + s); } catch (e) {} } };
let PORT = require('./lib-port').ports(440, 25310) - 20;   // 부팅마다 이어진 20 자리(central · 존)
async function boot(tree, dbIn, env, tag) {
  const port = (PORT += 20), dir = path.join(WD, tag); fs.mkdirSync(dir, { recursive: true });
  const zdb = path.join(dir, 'z.db'), cdb = path.join(dir, 'c.db'), out = path.join(dir, 'rec.json'), logf = path.join(dir, 'zone.log');
  cpDb(dbIn, zdb);
  const SECRET = 't1471-' + process.pid;
  const c = spawn(process.execPath, [path.join(tree, 'server/central.js')], { cwd: tree, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET, NODE_OPTIONS: '' }) });
  const lf = fs.openSync(logf, 'w');
  const z = spawn(process.execPath, ['-r', path.join(__dirname, 't1471-fit-probe.js'), path.join(tree, 'server/zone.js')], { cwd: tree, stdio: ['ignore', lf, lf],
    env: Object.assign({}, process.env, { T1471_FIT_OUT: out, PORT: String(port + 10), ZONE_ID: 'hanbando', DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(port), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', NODE_OPTIONS: '', T1471_LAND_FIT: '0' }, env) });
  let exit = null; z.on('exit', (code, sig) => { exit = { code, sig }; });
  let R = null;
  for (let i = 0; i < 600 && !exit; i++) { try { R = JSON.parse(fs.readFileSync(out, 'utf8')); if (R.dump && (!env.T1471_FIT_BODY || R.body)) break; } catch (e) {} await sleep(500); }
  await sleep(1500);   // 걷기 · 거래가 끝난 뒤(경도 시차 줄은 마을 적재 뒤 — 걷기는 그 앞)
  try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {}
  await sleep(600);
  try { R = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
  if (!R || !R.dump) { console.log(`  [${tag}] 부팅 실패 · exit ${JSON.stringify(exit)} · 로그 끝:\n` + fs.readFileSync(logf, 'utf8').split('\n').slice(-15).join('\n')); }
  return { R: R || {}, db: zdb, log: fs.readFileSync(logf, 'utf8') };
}
const FIELDS = ['terr', 'terrH', 'terrO', 'pot', 'potH', 'potO', 'farm', 'farmH', 'farmO', 'dry', 'dryH', 'dryO', 'gran', 'granH', 'house', 'houseH', 'ditch', 'ditchH', 'phouse', 'phouseH', 'psite', 'psiteH', 'housesPx', 'pend', 'shelter', 'farmN', 'dryN', 'maxRPx'];
function diff(A, B, skip) {
  const out = []; const bm = new Map((B || []).map((v) => [v.id, v]));
  if (!A || !B || A.length !== B.length) return ['마을 수 ' + (A && A.length) + ' vs ' + (B && B.length)];
  for (const a of A) { if (skip && skip.has(a.id)) continue; const b = bm.get(a.id); if (!b) { out.push(a.name + ' 없음'); continue; } for (const f of FIELDS) if (String(a[f]) !== String(b[f])) out.push(`${a.name}.${f} ${a[f]}≠${b[f]}`); }
  return out;
}

(async () => {
  console.log('[T1471] 지금 산 · 물인 칸의 마을 땅을 부팅이 바로잡는다 — 건물 · 일터는 옮긴다(판정 84)');
  const S = await ensureSeed({ log: (s) => console.log(s) });
  if (!S.ok) { ok(false, '씨앗 DB', S.why); process.exit(1); }
  let MAIN = process.env.T1471_MAIN;
  if (!MAIN) {
    MAIN = path.join(WD, 'main');
    const base = execFileSync('git', ['-C', ROOT, 'merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', MAIN, base], { stdio: 'ignore' });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(MAIN, 'node_modules'));   // 나무에 꾸러미가 없다 — 같은 꾸러미
  }
  const W0 = path.join(WD, 'w0.db'); cpDb(S.z, W0);
  // ── 0. 정찰(끔) — 지형 정본으로 마을 곁 산 · 물 · 발자국 걸림 칸을 고른다 ──
  const B0 = await boot(ROOT, W0, { T1471_FIT_SCOUT: '1' }, 'scout');
  const sc = (B0.R.scout || []).filter((v) => v.rock.length >= 33 && v.water.length >= 5 && v.foot.length >= 1 && v.free.length >= 2);
  ok(sc.length > 0, '정찰 — 산 33 · 물 5 · 발자국 걸림 1 칸을 곁에 가진 마을이 있다', sc.length ? `${sc[0].name} 외 ${sc.length - 1}` : JSON.stringify((B0.R.scout || []).slice(0, 2)));
  if (!sc.length) { console.log(`\n결과: ${pass} 통과 · ${fail} 실패`); process.exit(1); }
  const V = sc[0];
  // ── 1. 심기 — 그 마을 행으로(지도를 고쳐 산 · 물이 된 칸과 같은 꼴) ──
  const W1 = path.join(WD, 'w1.db'); cpDb(W0, W1);
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(W1);
  const ins = d.prepare('INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)');
  const now = Date.now(), put = (t, x, y, data) => ins.run(V.id, t, x, y, data || null, now);
  const rock = V.rock, wat = V.water.slice(0, 5);
  for (const [x, y] of rock.slice(0, 25)) put('terr', x, y);
  for (const [x, y] of wat) put('terr', x, y);
  put('house', rock[25][0], rock[25][1]); put('housesite', rock[25][0], rock[25][1]);   // 산 속 집(완공 — 집터 행 같은 칸)
  put('house', V.foot[0][0], V.foot[0][1]);   // 가운데는 들 · 발자국이 산 · 물에 걸린 집
  put('granary', rock[26][0], rock[26][1]);
  put('yard', rock[27][0], rock[27][1]); put('garden', rock[28][0], rock[28][1]); put('plaza', rock[29][0], rock[29][1]);
  put('farmland', rock[0][0], rock[0][1]); put('dryfield', rock[1][0], rock[1][1]); put('nongzone', rock[2][0], rock[2][1]);
  put('phouse', rock[3][0], rock[3][1], JSON.stringify({ owner: 'p_t1471' }));   // 플레이어 의뢰 집 — 안 건드린다
  put('terr', V.free[0][0], V.free[0][1]); put('ditch', V.free[1][0], V.free[1][1]);   // 들 칸 — 그대로
  const rowsOf = (db, t, x, y) => db.prepare('SELECT COUNT(*) n FROM village_buildings WHERE village_id = ? AND type = ? AND cx = ? AND cy = ?').get(V.id, t, x, y).n;
  d.close();
  const PLANT = [['terr', 30], ['house', 2], ['housesite', 1], ['granary', 1], ['yard', 1], ['garden', 1], ['plaza', 1], ['farmland', 1], ['dryfield', 1], ['nongzone', 1]];
  console.log(`  심은 마을 ${V.name}(#${V.id}) — 영토 산 25 · 물 5 · 산 속 집 1(+집터) · 발자국 걸린 집 1 · 곳간 · 마당 · 텃밭 · 광장 · 논 · 밭 · 존닝 각 1 · 의뢰 집 1 · 들 칸 영토 · 도랑 각 1`);

  // ── ① 끔 = main ──
  const BENV = { T1471_FIT_BODY: V.name, T1471_FIT_ROWS: String(V.id) };
  const A = await boot(ROOT, W1, BENV, 'off');
  const M = await boot(MAIN, W1, {}, 'main');
  const dOM = diff(A.R.dump, M.R.dump);
  ok(A.R.dump && dOM.length === 0, '① 끔 = main — 마을마다 상태 지문이 같다(영토 · 논밭 · 밭 · 존닝 차례 · 집 · 곳간 · 집터 · 쉼터)', dOM.slice(0, 4).join(' · '));
  ok(A.R.lines.length === 0, '① 끔 — [T1471] 로그 줄 0', A.R.lines.length);
  ok((A.R.badRows || []).filter((r) => r[0] !== 'phouse').length === 10, '① 끔 — 심은 걸린 행 10이 그대로 산 · 물 위(대조)', JSON.stringify(A.R.badRows));
  const a = (A.R.dump || []).find((v) => v.id === V.id) || {};
  // ── ② 켬 — 옮긴다 ──
  const C = await boot(ROOT, W1, Object.assign({ T1471_LAND_FIT: '1' }, BENV), 'on');
  const c = (C.R.dump || []).find((v) => v.id === V.id) || {};
  const pairs = []; for (const l of C.R.lines) for (const m of l.matchAll(/집 \((\d+),(\d+)\) → \((\d+),(\d+)\)/g)) pairs.push(m.slice(1, 5).map(Number));
  ok(a.terr - c.terr === 30, '② 켬 — 심은 마을 영토가 심은 산 · 물 칸(30)만큼 준다(영토는 땅 — 옮기지 않는다)', `${a.terr} → ${c.terr}`);
  ok(c.house === a.house && c.housesPxN === a.housesPxN && pairs.length === 2, '② 켬 — 산 속 집 · 발자국이 걸린 집 둘이 옮겨진다(집 수 그대로 · 옮긴 쌍 2)', `${a.house}→${c.house} · 쌍 ${JSON.stringify(pairs)}`);
  ok(c.gran === a.gran && c.granH !== a.granH, '② 켬 — 산 속 곳간이 옮겨진다(수 그대로 · 자리 바뀜)', `${a.gran} → ${c.gran}`);
  ok(a.farmN === c.farmN && a.dryN === c.dryN && a.farm === c.farm && c.farmH !== a.farmH, '② 켬 — 산 속 논 · 밭이 옮겨진다(수 · 칸 수 그대로 · 자리 바뀜)', `논 ${a.farmN}→${c.farmN} · 밭 ${a.dryN}→${c.dryN} · 칸 ${a.farm}→${c.farm}`);
  const cb = (C.R.badRows || []).filter((r) => r[0] !== 'phouse');
  ok(C.R.badRows && cb.length === 0, '② 켬 — 그 마을 행 가운데 산 · 물에 걸린 것 0(의뢰 집 빼고)', JSON.stringify(cb.slice(0, 5)));
  ok(c.pend == null || !rock.some(([x, y]) => c.pend === x + ',' + y), '② 켬 — 산 속 집터가 진행 중 집터로 남지 않는다', String(c.pend));
  //   집주인이 따라간다 — 끔 판에서 옮긴 집에 살던 몸(명부 차례)이 켬 판에선 새 집의 같은 침대 자리에
  const AB = (A.R.body || {}).rows || [], CB = (C.R.body || {}).rows || [];
  let fol = 0, folBad = 0;
  //   몸마다 끔 판 집 자리에서 가장 가까운 집(끔 판 집 목록 전부 — 옮긴 집이 그 집일 때만 센다 · 집 둘이 붙어 있어도 한 집에만)
  const aH = (a.houseL || []).map((k) => k.split(',').map(Number));
  //   주인 집 = 집 자리 − 집 가운데가 정확히 `HOME_SLOTS`(villages.js — 몸 배치가 쓰는 그 여섯 자리) 하나인 집 · 둘 넘게 맞으면(붙은 집) 세지 않는다
  const HS = [[-4, -1], [-2, -1], [0, -1], [-5, 0], [-3, 0], [-1, 0]];
  const owner = (hx, hy) => { const m = aH.filter(([x, y]) => HS.some(([dx, dy]) => x * 32 + 16 + dx * 32 === hx && y * 32 + 16 + dy * 32 === hy)); return m.length === 1 ? m[0] : null; };
  const follow = (XB) => { let n = 0, bad = 0; for (let i = 0; i < AB.length && i < XB.length; i++) { const o = owner(AB[i][1], AB[i][2]); const P = o && pairs.find((q) => q[0] === o[0] && q[1] === o[1]); if (!P) continue; n++; if (XB[i][1] - AB[i][1] !== (P[2] - P[0]) * 32 || XB[i][2] - AB[i][2] !== (P[3] - P[1]) * 32) bad++; } return [n, bad]; };
  [fol, folBad] = follow(CB);
  ok(fol > 0 && folBad === 0, '② 켬 — 옮긴 집에 살던 몸이 새 집의 같은 자리를 받는다(집주인이 따라간다)', `몸 ${fol} · 어긋남 ${folBad}`);
  const dOn = diff(A.R.dump, C.R.dump, new Set([V.id]));
  ok(C.R.dump && dOn.length === 0, '② 켬 — 다른 마을은 끔과 같은 지문(새 세계엔 걸린 칸이 없다)', dOn.slice(0, 4).join(' · '));
  ok(C.R.lines.some((l) => l.indexOf(V.name) >= 0 && /영토 30칸 뺐다/.test(l)) && C.R.lines.some((l) => /옮김/.test(l)), '② 켬 — 로그(영토 30칸 뺐다 · 옮김 줄)', C.R.lines.join(' / ').slice(0, 400));
  ok(C.R.stat && C.R.stat.on === true && C.R.stat.terr === 30 && C.R.stat.moved === 2 && C.R.stat.dropped === 0 && C.R.stat.pBad === 1, '② 켬 — 셈(영토 30 · 집 옮김 2 · 걷음 0 · 의뢰 집 1 은 셈만)', JSON.stringify(C.R.stat));
  // ── ③ 켬 뒤 DB ──
  const KEEP = path.join(WD, 'w2.db'); cpDb(C.db, KEEP);
  const d2 = new DatabaseSync(KEEP, { readOnly: true });
  const left = []; const at = { terr: rock.slice(0, 25).concat(wat), house: [rock[25], V.foot[0]], housesite: [rock[25]], granary: [rock[26]], yard: [rock[27]], garden: [rock[28]], plaza: [rock[29]], farmland: [rock[0]], dryfield: [rock[1]], nongzone: [rock[2]] };
  for (const t of Object.keys(at)) for (const [x, y] of at[t]) if (rowsOf(d2, t, x, y)) left.push(`${t}@${x},${y}`);
  ok(left.length === 0, '③ 켬 뒤 DB — 옛 산 · 물 칸에 남은 행 0', left.slice(0, 5).join(' · '));
  const cntT = (db, t) => db.prepare('SELECT COUNT(*) n FROM village_buildings WHERE village_id = ? AND type = ?').get(V.id, t).n;
  const d1 = new DatabaseSync(W1, { readOnly: true });
  const same = ['house', 'granary', 'farmland', 'dryfield'].filter((t) => cntT(d1, t) !== cntT(d2, t));
  ok(same.length === 0 && cntT(d2, 'nongzone') === cntT(d1, 'nongzone') - 1, '③ 켬 뒤 DB — 집 · 곳간 · 논 · 밭 행 수 그대로(옮김) · 논 존닝만 하나 걷음', same.join(','));
  d1.close();
  ok(rowsOf(d2, 'phouse', rock[3][0], rock[3][1]) === 1, '③ 켬 뒤 DB — 의뢰 집(플레이어 것)은 그대로(회부)');
  ok(rowsOf(d2, 'terr', V.free[0][0], V.free[0][1]) === 1 && rowsOf(d2, 'ditch', V.free[1][0], V.free[1][1]) === 1, '③ 켬 뒤 DB — 들 칸 영토 · 도랑은 그대로');
  d2.close();
  void PLANT;
  // ── ③ⓑ 자리가 없을 때만 걷는다 — 집 재료가 곳간으로(옮길 자리를 못 찾게 한 사본) ──
  {
    const X = await boot(ROOT, W1, Object.assign({ T1471_LAND_FIT: '1', T1471_FIT_MUT: JSON.stringify(['server/villages.js', 'const pick = near(h.cx, h.cy, (x, y) =>', 'const pick = null && near(h.cx, h.cy, (x, y) =>']) }, BENV), 'nosite');
    const x = (X.R.dump || []).find((v) => v.id === V.id) || {}, st = X.R.stat || {};
    const matN = st.mat ? Object.values(st.mat).reduce((p, q) => p + q, 0) : 0;
    ok(X.R.mut && st.dropped === 2 && matN > 0 && a.house - x.house === 2 && (X.R.badRows || []).filter((r) => r[0] !== 'phouse').length === 0, '③ⓑ 자리가 없으면 걷고 집 두 채 재료를 곳간에 넣는다', `걷음 ${st.dropped} · 재료 ${JSON.stringify(st.mat)}`);
  }
  // ── ④ 켬으로 한 번 더 ──
  const D = await boot(ROOT, KEEP, Object.assign({ T1471_LAND_FIT: '1' }, BENV), 'on2');
  const dCD = diff(C.R.dump, D.R.dump);
  ok(D.R.lines.filter((l) => /뺐다|옮김/.test(l)).length === 0, '④ 켬 두 번째 부팅 — 바로잡을 것 0(뺐다 · 옮김 줄 0)', D.R.lines.join(' / ').slice(0, 200));
  ok(D.R.dump && dCD.length === 0, '④ 켬 두 번째 부팅 — 지문이 첫 켬과 같다(되읽어도 같은 세계)', dCD.slice(0, 4).join(' · '));
  // ── ⑤ 미끼 ──
  const VJ = 'server/villages.js';
  const bait = async (tag, mut, env, bites) => {
    const X = await boot(ROOT, W1, Object.assign({ T1471_FIT_MUT: JSON.stringify([VJ, mut[0], mut[1]]) }, BENV, env), tag);
    return { bit: !!(X.R.mut && X.R.mut.n === 1 && bites(X)), n: X.R.mut ? X.R.mut.n : 0, X };
  };
  let b;
  b = await bait('물-안-봄', ['function _t1471Bad(ta, x, y) { return ta.isRock(x, y) || (ta.isWater(x, y) && ta.isBlocked(x, y)); }', 'function _t1471Bad(ta, x, y) { return ta.isRock(x, y); }'], { T1471_LAND_FIT: '1' },
    (X) => { const x = (X.R.dump || []).find((v) => v.id === V.id) || {}; return a.terr - x.terr !== 30; });
  ok(b.bit, `⑤ 미끼 물-안-봄(물 칸을 안 보는 사본) — 문다(바꾼 자리 ${b.n})`);
  b = await bait('가운데만', ['_T1471_FOOT.has(r.type) ? _t1471FootBad(ta, r.type, r.cx, r.cy)', '_T1471_FOOT.has(r.type) ? _t1471Bad(ta, r.cx, r.cy)'], { T1471_LAND_FIT: '1' },
    (X) => (X.R.badRows || []).filter((r) => r[0] !== 'phouse').length > 0);
  ok(b.bit, `⑤ 미끼 가운데만(발자국 대신 가운데 칸만 보는 사본) — 문다(바꾼 자리 ${b.n})`);
  {
    const X = await boot(ROOT, W1, Object.assign({ T1471_LAND_FIT: '1', T1471_FIT_MUT: JSON.stringify([VJ, '        upd.run(x, y, h.id);\n', '']) }, BENV), '옮김-안-적음');
    const X2 = X.R.mut ? await boot(ROOT, X.db, { T1471_LAND_FIT: '1' }, '옮김-안-적음-2') : { R: { lines: [] } };
    ok(!!(X.R.mut && X2.R.lines.filter((l) => /옮김/.test(l)).length > 0), `⑤ 미끼 옮김-안-적음(집 행을 DB 에 안 옮기는 사본) — 문다(바꾼 자리 ${X.R.mut ? X.R.mut.n : 0} · 다음 부팅이 또 옮긴다)`, X2.R.lines.length);
  }
  b = await bait('끔에서도', ['if (T1471_LAND_FIT) {   // ★[T1471] 켬', 'if (true) {   // ★[T1471] 켬'], {},
    (X) => diff(M.R.dump, X.R.dump).length > 0);
  ok(b.bit, `⑤ 미끼 끔에서도(끔에서도 도는 사본) — 문다(바꾼 자리 ${b.n})`);
  b = await bait('집주인-안-따라감', ['if (pxI >= 0) vil.housesPx[pxI] = { x: x * SZ + SZ / 2, y: y * SZ + SZ / 2 };', 'if (pxI >= 0) { vil.housesPx.splice(pxI, 1); vil.housesPx.unshift({ x: x * SZ + SZ / 2, y: y * SZ + SZ / 2 }); }'], { T1471_LAND_FIT: '1' },
    (X) => follow((X.R.body || {}).rows || [])[1] > 0);
  ok(b.bit, `⑤ 미끼 집주인-안-따라감(옮긴 집을 명부 앞에 붙이는 사본 — 집 차례가 밀린다) — 문다(바꾼 자리 ${b.n})`);
  // ── ⑥ 몸 — 다시 뜬 판이 저장 자리로 되돌린 몸이 지금 산 속이면 집 앞으로(라이브 사키농촌 베가 · 카이 · 루나 · 아라 다섯의 꼴) ──
  //   몸 심기: 걷기 함수 머리에서 그 마을 첫 몸 셋을 산 칸 가운데로 옮겨 둔다(저장 자리가 산 속인 판과 같은 꼴 · 사본 안에서만)
  const RK = rock.slice(30, 33).map(([x, y]) => [x * 32 + 16, y * 32 + 16]);
  const PLANT_B = ['server/villages.js', 'function _t1471Bodies() {\n  const ta = state.ta, P = state.deps && state.deps.players; if (!ta || !P) return;',
    `function _t1471Bodies() {\n  const ta = state.ta, P = state.deps && state.deps.players; if (!ta || !P) return;\n  { const v = state.byDbId.get(${V.id}), RK = ${JSON.stringify(RK)}; for (let i = 0; i < 3; i++) { const b = P.get(v.npcPids[i]); if (b) { if (T1145_XY_COLS) BC.w(b, RK[i][0], RK[i][1]); else { b.x = RK[i][0]; b.y = RK[i][1]; } } } }`];
  const E = await boot(ROOT, KEEP, { T1471_LAND_FIT: '1', T1471_FIT_BODY: V.name, T1471_FIT_MUT: JSON.stringify([PLANT_B]) }, 'body');
  const eb = E.R.body || {};
  ok(E.R.mut && E.R.mut.n === 1 && E.R.lines.some((l) => /주민 3명을 집 앞으로/.test(l)) && eb.bodyBad === 0 && eb.homeBad === 0, '⑥ 켬 — 산 칸에 서 있던 몸 셋이 집 앞으로 옮겨진다(몸 · 집 자리 산 칸 0)', `${E.R.lines.filter((l) => /주민/.test(l)).join(' / ')} · ${JSON.stringify({ n: eb.n, bodyBad: eb.bodyBad, homeBad: eb.homeBad })}`);
  const F = await boot(ROOT, KEEP, { T1471_LAND_FIT: '1', T1471_FIT_BODY: V.name, T1471_FIT_MUT: JSON.stringify([PLANT_B, ['server/villages.js', 'if (T1145_XY_COLS) BC.w(b, x, y); else { b.x = x; b.y = y; }\n      b.targetX = x;', 'b.targetX = x;']]) }, 'body-bait');
  ok(F.R.mut && F.R.mut.n === 2 && (F.R.body || {}).bodyBad === 3, `⑤ 미끼 안-옮김(몸 자리를 안 옮기는 사본) — 문다(바꾼 자리 ${F.R.mut ? F.R.mut.n : 0} · 산 칸 몸 ${(F.R.body || {}).bodyBad})`);
  console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
  if (!process.env.T1471_MAIN) { try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', MAIN], { stdio: 'ignore' }); } catch (e) {} }
  try { fs.rmSync(WD, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
