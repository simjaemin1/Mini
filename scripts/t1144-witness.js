#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1144 증인 · 존을 띄운다 · 제품 무변)
// === scripts/t1144-witness.js — T1144 ① 생활 층 사건 때만(`T1144_LIFE_EVENT`) — 같은 값 증인 =====================================
//   ⓐ 글자 — 끔 갈래: `_lifeNextFarmCell` 의 머리 한 줄(손잡이 단락) 뒤 몸은 종전(main) 글자와 같다 · 사건 줄 넷(`_cellTask` · `_lifeDoTask0` · 하루 틱 둘)은
//      `if (T1144_LIFE_EVENT …)` 한 줄뿐 · 손잡이는 `'1'` 만 켬.
//   ⓑ 산 판 — 존 하나(틀 DB · 관측자 하나)를 켬 + 증인 갈래(`T1144_WITNESS=1`)로 띄운다: 농부가 밭 칸을 물을 때마다 **켬 셈(표)** 과 **종전 셈**을 같은 순간에 같이 내고
//      (세계는 종전 답으로 돈다) 답이 다르면 `bad` · 종전 셈이 작물 칸 `e.w` 를 하나라도 옮기면(= 깨끗한 칸의 `_cropSky` 가 무동작이 아니면) `badW`.
//      판 둘 — 실제 날(24 분 · T455 고정 원점 · 아침 앞 `LEAD` 초에 띄워 농부 출근부터) · 짧은 날(`VILLAGE_DAY_MS=4000` — 날 사건 · 하루 틱이 4 초마다).
//      헛물음 셈(칸 물음 중 지난 답을 그대로 쓴 몫 · 다시 잰 칸 중 답이 같았던 몫)을 같이 적는다.
//   ⓒ 미끼(자명 통과 금지) — 사건 ⓑ(그 칸 일)를 일부러 빠뜨린 판(`T1144_WITNESS_BREAK=do`)은 `bad` 가 0 이 아니어야 한다 · 하루 틱 ⓒ 를 빠뜨린 판(`=day`)도 본다.
//   ⓓ 손 판 — 존 없이 정본 함수(`__farmBind`)로 마을 다섯 · 730날: 켬 셈 ↔ 종전 셈 · 미끼 `day`(하루 틱 사건을 빠뜨림 — 산 판에선 날 사건과 같은 순간이라 안 드러난다).
// 실행: node scripts/t1144-witness.js <틀 DB> [--secs 360] [--out <json>] · 손 판만: node scripts/t1144-witness.js - --hand-only
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TPL = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SECS = +arg('--secs', 240), SHORT = +arg('--short-secs', 150), OUT = arg('--out', null), REF = arg('--ref', 'origin/main');
const TMP = process.env.T1144_TMP || path.join(require('os').tmpdir(), 't1144-wit');
fs.mkdirSync(TMP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

// ── ⓐ 글자 ──────────────────────────────────────────────────────────────────
function textCheck() {
  console.log('ⓐ 글자(끔 갈래 = 종전 글자)');
  const OLD = execFileSync('git', ['show', `${REF}:server/villages.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const NEW = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const body = (S, name) => { let i = S.indexOf(`function ${name}(`); if (i < 0) i = S.indexOf(`function* ${name}(`); if (i < 0) throw new Error('없음 ' + name); return S.slice(i, S.indexOf('\n}\n', i) + 3).split('\n'); };
  //   켬 줄을 걷어 낸다 — `if (T1144_LIFE_EVENT …)` 한 줄 · `const _m44 = T1144_LIFE_EVENT …` 한 줄 · 두 식 머리(`_m44 !== undefined ? _m44 : ` · `T1144_LIFE_EVENT ? _t1144Units(_K, _sp) : `) · 꼬리 주석
  const strip = (L) => L.filter((x) => !/^\s*if \(T1144_LIFE_EVENT/.test(x) && !/^\s*const _m44 = T1144_LIFE_EVENT/.test(x))
    .map((x) => x.replace('_m44 !== undefined ? _m44 : ', '').replace('T1144_LIFE_EVENT ? _t1144Units(_K, _sp) : _t1128On() ? _t1128HandUnits(_K, _sp.id, _sp.kg) : (+_K.econUnitsOf(\'fish\', 1, _sp.kg) || 0)', '_t1128On() ? _t1128HandUnits(_K, _sp.id, _sp.kg) : (+_K.econUnitsOf(\'fish\', 1, _sp.kg) || 0)').replace(' · ★[T1144 ③] 켬 = 종마다 한 번', ''));
  for (const fn of ['_lifeNextFarmCell', '_cellTask', '_lifeDoTask0', '_lifeDailySteps', '_t340Try', 'npcLifeTick']) {
    const a = body(OLD, fn), b = strip(body(NEW, fn));
    ok(a.join('\n') === b.join('\n'), `${fn}: 손잡이 줄을 빼면 종전 글자 그대로`, `종전 ${a.length}줄 · 켬 줄 ${body(NEW, fn).length - b.length}`);
  }
  const lab = NEW.indexOf('// 라이브 하루 경계와 같은 줄');
  ok(lab > 0 && /\n\s*if \(T1144_LIFE_EVENT[^)]*\) _t1144DirtyAll\(vil\);/.test(NEW.slice(lab, lab + 300)), '랩 하루 틱 고리 뒤 사건 줄 하나');
  ok(/const T1144_LIFE_EVENT = process\.env\.T1144_LIFE_EVENT === '1';/.test(NEW), "손잡이 = `'1'` 만 켬(기본 끔)");
  const ZN = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'), ZO = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const zs = body(ZO, '_t671Shape'), zn = body(ZN, '_t671Shape');
  ok(zs.join('\n') === strip(zn).join('\n') && zn.some((x) => /^\s*if \(T1144_LIFE_EVENT\) p\._t1144Sp = undefined;/.test(x)), '`_t671Shape`: 켬 줄 하나(`_t1144Sp`)만 더했다 · zone.js 손잡이도 `\'1\'` 만', /const T1144_LIFE_EVENT = process\.env\.T1144_LIFE_EVENT === '1';/.test(ZN) ? '○' : '✗');
}

// ── ⓓ 손 판(존 없이 · 마을 다섯 · 730날) ──────────────────────────────────────
//   `__farmBind` 정본 함수로 밭을 돌린다(`test-cell-memo` 와 같은 마을 꼴 · 논 · 밭 · 칸 252). 날마다 ⓐ 몸 넷이 차례로 묻고(증인 갈래 — 켬 셈 ↔ 종전 셈) · 칸을 잡고 일하고(ⓑ) 놓는다
//   ⓑ 같은 날 하루 틱만(농부 0 인 랩 하루 `tickDay` — 일 0 · `cropDayTick` 고리 + 사건 ⓒ) ⓒ 같은 날 다시 묻는다(병이 선 칸 — 하루 틱이 바꾼 답).
//   미끼 `day`(사건 ⓒ 를 빠뜨림)는 ⓒ 의 다시 묻기에서 문다.
function handChild() {
  process.env.ZONE_ID = 'hanbando';
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const F = V.__farmBind(), P = V.__labProbe && V.__labProbe._cropProbe;
  const mk = (dbId) => {
    const v = { dbId, name: 'm' + dbId, ccx: 100, ccy: 100, _crop: new Map(), _drySet: new Set(), _farmSet: new Set(), _cropClaim: new Set(), econ: { npcs: [1], counts: { farmer: 0 } } };
    for (let x = 0; x < 18; x++) for (let y = 0; y < 14; y++) { const k = (100 + x) + ',' + (100 + y); v._farmSet.add(k); if ((x * 7 + y * 3 + dbId) % 5 < 2) v._drySet.add(k); }
    return v;
  };
  const vils = [3, 7, 11, 42, 1020].map(mk);
  let q = 0, did = 0, seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (let day = 0; day < 730; day++) {
    for (const v of vils) {
      if (day % 37 === 5 && v._farmSet.size < 400) { const y = 100 + 14 + ((v._farmSet.size - 252) / 18 | 0); for (let x = 0; x < 18; x++) { const k = (100 + x) + ',' + y; v._farmSet.add(k); if ((x + day) % 3 === 0) v._drySet.add(k); } }   // 개간 — 밭 칸이 는다(사건 ⓓ)
      for (let r = 0; r < 6; r++) {
        const held = [];
        for (let b = 0; b < 4; b++) {
          const npc = { x: (100 + rnd() * 18) * 32, y: (100 + rnd() * 14) * 32 };
          const k = F._lifeNextFarmCell(v, npc, day); q++;
          if (k) { v._cropClaim.add(k); held.push(k); }
        }
        for (const k of held) { if (rnd() < 0.7) { F._lifeDoTask0(v, null, k, day); did++; } v._cropClaim.delete(k); }
      }
      if (P && P.tickDay) P.tickDay([v], day);   // 농부 0 — 일 0 · 하루 틱 고리 + 사건 ⓒ(같은 날)
      for (let b = 0; b < 4; b++) { F._lifeNextFarmCell(v, { x: (100 + rnd() * 18) * 32, y: (100 + rnd() * 14) * 32 }, day); q++; }
    }
  }
  return { q, did, crops: vils.reduce((s, v) => s + v._crop.size, 0), stat: F.t1144Stat ? F.t1144Stat() : null, on: F.T1144_LIFE_EVENT, probe: !!(P && P.tickDay) };
}
if (process.argv[2] === '--hand') { const o = handChild(); process.stdout.write('\n@@JSON@@' + JSON.stringify(o)); process.exit(0); }
function hand(brk) {
  const env = Object.assign({}, process.env, { T1144_LIFE_EVENT: '1', T1144_WITNESS: '1', T1144_WITNESS_BREAK: brk || '' });
  return JSON.parse(String(execFileSync(process.execPath, [__filename, '--hand'], { env, encoding: 'utf8', maxBuffer: 1 << 26 })).split('@@JSON@@').pop());
}

// ── ⓑ · ⓒ 산 판 ─────────────────────────────────────────────────────────────
async function live(tag, { realDay, secs, brk }) {
  const port = 4110 + (tag.length * 7) % 40, CP = port, ZP = port + 1, SECRET = 't1144';
  const zdb = path.join(TMP, `z-${tag}.db`), cdb = path.join(TMP, `c-${tag}.db`);
  rmdb(zdb); rmdb(cdb);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, zdb + s); } catch (e) {} }
  const DAY = 1440000, LEAD_S = 150;
  const at = (Math.floor(fs.statSync(TPL).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;   // T455 고정 원점(t646 자와 같은 식 — 하루 경계 LEAD 초 앞)
  const clk = realDay ? { NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) } : {};
  const env0 = Object.assign({}, process.env, clk);
  const logf = fs.openSync(path.join(TMP, `${tag}.log`), 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore', detached: false,
    env: Object.assign({}, env0, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(realDay ? DAY : 4000), VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1',
      T1144_LIFE_EVENT: '1', T1144_WITNESS: '1', T1144_WITNESS_BREAK: brk || '' }) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); rmdb(zdb); rmdb(cdb); };
  try {
    const t0 = Date.now();
    for (let i = 0; i < 600; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
    console.log(`  [${tag}] 기동 ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${secs}초 돈다`);
    const t1 = Date.now(); let L = null;
    while (Date.now() - t1 < secs * 1000) { await sleep(15000); L = await getj('/lifedbg'); const S = L && L.totals && L.totals.t1144; if (S) console.log(`  [${tag}] phase ${L.phase} · ${JSON.stringify(S.farm)}`); }
    clearInterval(ping); try { ws.close(); } catch (e) {}
    L = await getj('/lifedbg');
    return (L && L.totals && L.totals.t1144) || null;
  } finally { await kill(); }
}

(async () => {
  const res = { at: new Date().toISOString(), tpl: TPL, secs: SECS, short: SHORT };
  textCheck();
  console.log('ⓓ 손 판(존 없이 · 마을 다섯 · 730날 · 정본 함수)');
  { const H = hand(''), f = H.stat && H.stat.farm; res.hand = H;
    ok(H.on && H.probe && !!f && f.wit > 5000 && H.did > 1000 && H.crops > 0, '손 판이 돈다(켬 · 랩 하루 틱 · 물음 · 일)', f ? `물음 ${f.wit} · 일 ${H.did} · 작물 ${H.crops}` : 'null');
    ok(!!f && f.bad === 0 && f.badW === 0, '★손 판 — 켬 셈 ↔ 종전 셈 다른 물음 0 · 작물 칸 옮김 0', f ? `${f.bad} · ${f.badW} / ${f.wit} · 칸 ${f.cells} · 그대로 ${f.reuse} · 다시 ${f.re}` : '');
    const B = hand('day'), g = B.stat && B.stat.farm; res.handBrkDay = B;
    ok(!!g && g.wit > 0 && g.bad > 0, '★미끼 — 하루 틱 사건 ⓒ 를 빠뜨리면 같은 날 다시 묻기에서 문다', g ? `다름 ${g.bad} / ${g.wit}` : 'null');
    const D = hand('do'), d = D.stat && D.stat.farm; res.handBrkDo = D;
    ok(!!d && d.wit > 0 && d.bad > 0, '★미끼 — 그 칸 일 사건 ⓑ 를 빠뜨리면 문다', d ? `다름 ${d.bad} / ${d.wit}` : 'null');
    const Z = hand('size'), z = Z.stat && Z.stat.farm; res.handBrkSize = Z;
    ok(!!z && z.wit > 0 && z.bad > 0, '★미끼 — 밭 칸이 는 사건 ⓓ 를 빠뜨리면 문다', z ? `다름 ${z.bad} / ${z.wit}` : 'null'); }
  if (process.argv.includes('--hand-only')) { console.log(`\nt1144-witness ${pass}/${fail}`); process.exit(fail ? 1 : 0); }
  if (!TPL || !fs.existsSync(TPL)) { ok(false, '틀 DB 가 없다 — 산 판을 못 돈다', TPL); console.log(`\nt1144-witness ${pass}/${fail}`); process.exit(1); }
  console.log('ⓑ 산 판 — 켬 셈 ↔ 종전 셈(같은 순간)');
  for (const [tag, o] of [['real', { realDay: true, secs: SECS }]]) {   // 짧은 날 판(4 초)은 뺐다 — 농부가 거의 안 나선다(첫 판 물음 42 · 날 사건은 손 판 ⓓ 가 730날로 진다)
    const S = await live(tag, o); res[tag] = S;
    const f = S && S.farm;
    ok(!!f && f.wit > 0, `[${tag}] 견준 물음이 있다(자명 통과 금지)`, f ? `물음 ${f.wit}` : 'null');
    ok(!!f && f.bad === 0, `[${tag}] 답이 다른 물음 0`, f ? `${f.bad}/${f.wit}` : '');
    ok(!!f && f.badW === 0, `[${tag}] 종전 셈이 작물 칸을 옮긴 물음 0(깨끗한 칸 = 무동작)`, f ? `${f.badW}/${f.wit}` : '');
    ok(!!f && f.reuse > 0 && f.re > 0, `[${tag}] 표를 쓴 칸 · 다시 잰 칸이 둘 다 있다`, f ? `칸 ${f.cells} · 그대로 ${f.reuse}(${(100 * f.reuse / Math.max(1, f.cells)).toFixed(1)}%) · 다시 ${f.re}(그중 같은 답 ${f.reSame})` : '');
    const g = S && S.fish, u = S && S.unit;
    ok(!!g && g.wit > 0 && g.bad === 0, `[${tag}] 어부 던짐 종 — 지난 답 ↔ 다시 뽑은 답 다른 것 0`, g ? `견줌 ${g.wit} · 다름 ${g.bad} · 던짐 ${g.casts}(지난 답 ${(100 * g.reuse / Math.max(1, g.casts)).toFixed(1)}%)` : 'null');
    ok(!!u && u.wit > 0 && u.bad === 0, `[${tag}] 물린 한 마리 낱값 — 지난 답 ↔ 다시 잰 답 다른 것 0`, u ? `견줌 ${u.wit} · 다름 ${u.bad} · 부름 ${u.calls}` : 'null');
  }
  console.log('ⓒ 미끼 — 사건을 빠뜨리면 문다');
  for (const [tag, brk, o] of [['brk-do', 'do', { realDay: true, secs: Math.min(SECS, 180) }], ['brk-sp', 'sp', { realDay: true, secs: Math.min(SECS, 180) }]]) {   // 미끼 `day` 는 손 판(ⓓ) — 산 판에선 하루 틱이 날 사건(ⓐ)과 같은 순간이라 안 드러난다
    const S = await live(tag, Object.assign({ brk }, o)); res[tag] = S;
    if (brk === 'sp') { const g = S && S.fish; ok(!!g && g.wit > 0 && g.bad > 0, `[${tag}] 칸 사건을 빠뜨린 종 판은 다름이 난다`, g ? `다름 ${g.bad} / ${g.wit}` : 'null'); continue; }
    const f = S && S.farm;
    ok(!!f && f.wit > 0 && (f.bad > 0 || f.badW > 0), `[${tag}] 사건 ${brk} 을 빠뜨린 판은 어긋남이 난다`, f ? `답 ${f.bad} · e.w ${f.badW} / ${f.wit}` : 'null');
  }
  res.pass = pass; res.fail = fail;
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(`\nt1144-witness ${pass}/${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
