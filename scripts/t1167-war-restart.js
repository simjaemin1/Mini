#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1167 계측기 · 제품 무변 · 판 하나 수 분)
// === scripts/t1167-war-restart.js — 진행 중 전쟁 재기동 실서버 판(행군 중 · 포위 중 · 교전 중 · 귀환 중 — 징발 중) ==========================
//   node scripts/t1167-war-restart.js <판> --want march|siege|battle|return [--seed 1020] [--min 366] [--after 30] [--off]
//   ① p1: 서버 판 자(T740 조건 + 전쟁 팔 front `T1041_WAR_BODY=1` — 전쟁 마을만 몸 무제한)로 띄워, 원하는 꼴의 전쟁이 선 날 경계에서
//         얼림 → 마감 · 저장 큐 드레인 → 덤프(`stop`) → 제품 SIGTERM 문(T728 종료 저장 — 마을 행 + 메타 행).
//   ② p2: 같은 DB 로 다시 띄운다(날 뜀 끔 `T722_NOJUMP=1` — 빠른 시계 자에선 부팅 시간만으로 수백 날이 뛰어 같은 날에서 못 견준다 · 계측 사본) —
//         준비 순간 덤프(`boot`) · 날마다 전쟁 줄 · `--after` 날 뒤 덤프(`end`).
//   `--off` = 두 판 다 `T1167_WAR_PERSIST=0`(종전 — 대조).
//   ⇒ $T1167_DIR/<판>/ — h.stop.json · h.boot.json · h.end.json · p1.log · p2.log
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const a = process.argv.slice(2);
const TAG = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const SEED = +opt('seed', '1020'), WANT = opt('want', 'march'), MIN = +opt('min', '366'), AFTER = +opt('after', '30'), OFF = a.includes('--off');
const DIR = path.join(process.env.T1167_DIR || path.join(require('os').tmpdir(), 't1167'), TAG);
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'w.db');
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
for (const f of fs.readdirSync(DIR)) if (/^h\./.test(f)) fs.unlinkSync(path.join(DIR, f));
const PRE = ['t722-stop-hook.js', 't1167-war-hook.js'].map((f) => `--require ${path.join(__dirname, f)}`).join(' ');
function boot(phase, extra) {
  return new Promise((resolve) => {
    const out = path.join(DIR, phase);
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(phase === 'p1' ? 36000 : 36001)), DB_PATH: DB,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1', VILLAGE_DAY_MS: '250', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T1041_WAR_BODY: '1',
      T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: '0', T640_BOOT_SLICE: '0',
      T577_SEED: String(SEED), T577_DAYS: '2000', T577_OUT: out + '.json',
      T1167_H_OUT: path.join(DIR, 'h'), T1167_H_WANT: WANT, T1167_H_MIN: String(MIN), T1167_H_AFTER: String(AFTER),
      NODE_OPTIONS: PRE,
    }, OFF ? { T1167_WAR_PERSIST: '0' } : {}, extra);
    const t0 = Date.now();
    const child = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(out + '.log'); child.stdout.pipe(lf); child.stderr.pipe(lf);
    const up = FB.waitUp(child, /zone server up on/, { name: `zone ${phase}`, capMs: 300000 });
    child.on('exit', async (code) => { const u = await up; resolve({ code, up: u.ok, sec: (Date.now() - t0) / 1000 }); });
  });
}
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
(async () => {
  console.log(`=== T1167 ${TAG} — 시드 ${SEED} · 꼴 ${WANT} · ${MIN}날부터 · 뒤 ${AFTER}날 · ${OFF ? '끔(T1167_WAR_PERSIST=0)' : '켬(기본)'} ===`);
  const r1 = await boot('p1', { T1167_H_MODE: 'stop' });
  const S = rd('h.stop.json');
  console.log(`  p1 — 끝 코드 ${r1.code} · ${r1.sec.toFixed(1)}초 · 멈춤 ${S ? `날 ${S.world.day} · 전쟁 ${S.hit}` : '없음(그 꼴의 전쟁이 안 섰다)'}`);
  if (!S) process.exit(3);
  const r2 = await boot('p2', { T1167_H_MODE: 'resume', T722_NOJUMP: '1' });
  const B = rd('h.boot.json'), E = rd('h.end.json');
  console.log(`  p2 — 끝 코드 ${r2.code} · ${r2.sec.toFixed(1)}초 · 다시 뜬 날 ${B ? B.world.day : '-'} · 끝 날 ${E ? E.world.day : '-'}`);
  const show = (t, X) => { if (!X) { console.log(`  [${t}] 없음`); return; } const w = X.world;
    console.log(`  [${t}] 날 ${w.day} · 전쟁 ${w.wars} · 징발 표 ${w.marks}(고아 ${w.orphan} · 낡은 pid ${w.stalePid}) · 곳간 무기 ${w.weapon} + 원정 장부 ${w.ledger} = ${w.weaponAll} · 거울 ${w.armsOut}`);
    for (const r of X.wars) console.log(`      #${r.id} ${r.atk}→${r.def} ${r.phase}/${r.op} eta ${r.eta} · 징발 공 ${r.draftA} 방 ${r.draftD} · 팩 ${r.packRem}일 · 짐꾼 ${r.bearers}(짐 ${r.bag}) · 무기 장부 ${r.arms} 몸 ${r.armsBody}(${r.armsPack}) · 몸 ${r.body ? JSON.stringify(r.body) : '-'}`); };
  show('멈춤', S); show('다시 뜸', B);
  if (E && E.daily) for (const d of E.daily.slice(0, 6)) show('뒤 ' + d.day, d);
  show('끝', E);
  if (B && B.world.t1167) console.log('  t1167', JSON.stringify(B.world.t1167));
  if (E && E.world.t1167) console.log('  t1167(끝)', JSON.stringify(E.world.t1167));
})().catch((e) => { console.error(e); process.exit(1); });
