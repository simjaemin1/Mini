#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1382] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1382-resume-body.js — 몸 세계를 껐다 켜도 같은 세계: 마을 몸 pid · 길 닳음 · 몹 집(T1382 · T1372 회부) ==========================
//
// ★무엇을 보나(몸 세계 `T577_BODY=1` · 가상 시계 · 시드 1020 · 8날 · 4날에 끊고 잇는다 — 판 넷 · 끊은 판 셋 함께 + 한 번에 돈 판은 B 가 다시 뜨는 대로)
//   끊고 이은 판(B · 마디 4 + 4)이 다시 뜬 **첫 틱**과, 그 V 에서 한 번에 돈 판(A · 마디 하나)의 같은 틱을 견준다
//   (`t1340-moment-hook` 의 마을 몸 pid 줄 · `t1372-moment-hook` 의 몹 칸 · 길 닳음 칸).
//   ⓐ 마을 몸 pid — 마을마다 몸 줄(`npcPids`)의 pid 가 한 번에 돈 판과 100% 같다 · 8날 판 끝 econ 날 지문 8/8(몸 자리 지문은 기록)
//   ⓑ 길 닳음 · 몹 집 — 길 칸(등급 · 닳은 날) 갈림 0 · 한쪽에만 0 · 몹(DB 행 몹) 집(homeX · homeY) · 무리(packId) · 배회(wanderUntil) 갈림 0
//   ⓒ 미끼 둘(이 파일이 프리로드로 실린다 · `T1382_BAIT`): 종료 저장 줄에서 **한 자리**만 뺀 사본 — 뺀 수를 세고 그 물음만 빨강:
//      `pid` = 마을 몸 행의 저장 pid(`_t747Body.rows[].$p` · 몸 번호 `np`) → ⓐ 빨강 · ⓑ 초록 / `road` = 길 닳음 줄(T742 `zone.t1382Roads`) → ⓑ 빨강 · ⓐ 의 pid 초록
// 실행: node scripts/test-t1382-resume-body.js   (판 넷 · 약 15분 — 몸 세계라 CI 옛 코드 빨강 시한 600초 안에 못 든다: 거기선 '모름(시한)')
'use strict';
const path = require('path');
const fs = require('fs');

// ── 미끼 프리로드(아이 존 프로세스에서만 — `T1382_BAIT` 가 있고 이 파일이 `-r` 로 실렸을 때) ─────────────────────────────────
if (require.main !== module) {
  const B = process.env.T1382_BAIT;
  if (B && process.env.T577_OUT && /server[\\/]zone\.js$/.test(process.argv[1] || '')) {
    const Module = require('module'), ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
    const DBF = path.join(ROOT, 'server', 'zone-local-db.js'), _p = Module._extensions['.js'];
    const K = { n: 0, rows: 0 };
    Module._extensions['.js'] = function (m, filename) {
      const r = _p(m, filename);
      if (filename === DBF && m.exports && typeof m.exports.saveVillagesAndMeta === 'function') {
        const f = m.exports.saveVillagesAndMeta;
        m.exports.saveVillagesAndMeta = function (rows, zone, metaJson, day) {
          try {
            if (B === 'pid') {
              let hit = 0;
              rows = rows.map((row) => {
                let E; try { E = JSON.parse(row.econ); } catch (e) { return row; }
                const T = E && E._t747Body; if (!T || !Array.isArray(T.rows)) return row;
                let c = 0; for (const o of T.rows) if (o && '$p' in o) { delete o.$p; c++; }
                if ('np' in T) { delete T.np; c++; }
                if (!c) return row;
                hit++; K.rows += c;
                return Object.assign({}, row, { econ: JSON.stringify(E) });
              });
              if (hit) K.n = 1;
            }
            if (B === 'road') { const M = JSON.parse(metaJson); if (M.t742 && M.t742['zone.t1382Roads'] != null) { delete M.t742['zone.t1382Roads']; K.n++; } metaJson = JSON.stringify(M); }
            fs.writeFileSync(process.env.T577_OUT + '.t1382-bait.json', JSON.stringify({ bait: B, n: K.n, rows: K.rows }));
          } catch (e) { console.error('[t1382 미끼] 저장 줄 읽기 실패', e.message); }
          return f.call(this, rows, zone, metaJson, day);
        };
      }
      return r;
    };
  }
  return;
}

const os = require('os');
const { spawn, execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 't1382-'));
const HOOKS = ['t650-print.js', 't1308-bodyprint.js', 't1340-moment-hook.js', 't1372-moment-hook.js'].map((f) => `-r ${path.join(__dirname, f)}`).join(' ');
const ENV = Object.assign({}, process.env, { T577_BODY: '1', T745_VCLOCK: '1', T1308_KEEP: '0', NODE_OPTIONS: HOOKS });
for (const k of ['T1382_BAIT', 'T1372_BAIT', 'T1340_AT_V', 'T1308_BAIT_RNG', 'T1340_BAIT', 'T1340_RESUME_EXACT', 'VILLAGE_CARAVAN_MAX', 'T400_BUILD_ACT']) delete ENV[k];
const DAYS = '8', SEED = '1020', CUT = '4';
const run = (dir, every, extra) => new Promise((res) => {
  const c = spawn(process.execPath, [path.join(__dirname, 't1308-long-run.js'), DAYS, SEED, '--every', every, '--tag', 'X', '--dir', path.join(BASE, dir)], { env: Object.assign({}, ENV, extra || {}), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => res({ code, out }));
});
const D = (n) => path.join(BASE, n);
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const mom = (a, b, tag) => { const j = path.join(BASE, `mom-${tag}.json`); try { execFileSync(process.execPath, [path.join(__dirname, 't1372-moment-cmp.js'), a, b, '--json', j], { stdio: 'ignore' }); } catch (e) { return null; } return rd(j); };
const cmp = (a, b) => { const j = path.join(BASE, `cmp-${path.basename(a)}-${path.basename(b)}.json`); try { execFileSync(process.execPath, [path.join(__dirname, 't1308-cmp.js'), a, b, '--json', j], { stdio: 'ignore' }); } catch (e) { return null; } return rd(j); };
const full = (r) => r && r.both > 0 && r.same === r.both;
//   물음(미끼 판이 다시 부른다 — 같은 식)
//   ⓐ pid — 마을마다 몸 줄(자리 i → pid)이 같은 몸 수 / 한 번에 돈 판의 몸 수
const pidQ = (Xa, Yb) => { const r = { n: 0, same: 0, vils: 0 }; if (!Xa || !Yb || !Xa.vils || !Yb.vils) return r;
  for (const [name, v] of Object.entries(Xa.vils)) { r.vils++; const w = Yb.vils[name]; const a = v.pids || [], b = (w && w.pids) || []; for (let i = 0; i < a.length; i++) { r.n++; if (a[i] === b[i]) r.same++; } }
  return r; };
const pidOk = (p) => p.n > 0 && p.same === p.n;
//   ⓑ 길 닳음 칸 · 몹 집 · 무리 · 배회
//   무리 열쇠(`packId`)는 낳을 때 `Math.random` 꼬리가 붙어 **한 번에 돈 판끼리도** 글자가 다르다(캐러밴 몸 `playerId` 와 같은 꼴) — 글자 대신 묶음을 본다:
//   무리마다 첫 몹 번호를 이름으로(몹 번호 차례) · 두 판의 몹마다 그 이름이 같으면 같은 무리
const MOBF = ['homeX', 'homeY', 'wanderUntil'];
const mobDiff = (M) => (M && M.mods && M.mods.mobs ? MOBF.reduce((s, f) => s + (M.mods.mobs.byField[f] || 0), 0) : -1);
const packOf = (D) => { const r = new Map(), first = new Map(); if (!D || !D.mods || !D.mods.mobs) return r;
  const ks = Object.keys(D.mods.mobs).filter((k) => k.endsWith('.packId')).sort((a, b) => (+a.replace(/\D/g, '')) - (+b.replace(/\D/g, '')));
  for (const k of ks) { const mid = k.slice(0, -7), v = D.mods.mobs[k]; if (v === 'null' || v === 'u') { r.set(mid, '-'); continue; } if (!first.has(v)) first.set(v, mid); r.set(mid, first.get(v)); }
  return r; };
const packDiff = (Xa, Yb) => { const a = packOf(Xa), b = packOf(Yb); if (!a.size) return -1; let d = 0; for (const [mid, v] of a) if (b.get(mid) !== v) d++; for (const mid of b.keys()) if (!a.has(mid)) d++; return d; };
const rdDiff = (M) => (M && M.rd ? M.rd.diff + M.rd.onlyA + M.rd.onlyB : -1);
const qRoad = (M) => !!M && !!M.rd && M.rd.nA > 0 && rdDiff(M) === 0;
const qMob = (Xa, M, Yb) => !!M && !!Xa && Xa.mods && Xa.mods.mobN > 0 && M.mods && mobDiff(M) === 0 && packDiff(Xa, Yb) === 0;
const rdS = (M) => (M && M.rd ? `길 칸 A ${M.rd.nA} · B ${M.rd.nB} · 갈림 ${M.rd.diff} · A 에만 ${M.rd.onlyA} · B 에만 ${M.rd.onlyB}` : '길 칸 ?');
const mobS = (Xa, M, Yb) => `몹 ${Xa && Xa.mods ? Xa.mods.mobN : '?'} · 집 · 배회 갈림 ${mobDiff(M)} · 무리 묶음 갈림 ${packDiff(Xa, Yb)}`;

(async () => {
  console.log(`\n=== T1382 몸 세계를 껐다 켜도 같은 세계 — 마을 몸 pid · 길 닳음 · 몹 집 (${BASE}) ===`);
  const pre = HOOKS + ` -r ${__filename}`;
  //   끊은 판 셋을 함께 띄우고 · B 가 다시 뜬 첫 틱을 뜨는 대로(그 V) 한 번에 돈 판 A 를 띄운다(B 끝을 안 기다린다)
  const RBF = path.join(D('B'), `seg-${CUT}.json.t1340-ready.json`);
  const pB = run('B', CUT), pBp = run('Bp', CUT, { T1382_BAIT: 'pid', NODE_OPTIONS: pre }), pBr = run('Br', CUT, { T1382_BAIT: 'road', NODE_OPTIONS: pre });
  let bDone = false; pB.then(() => { bDone = true; });
  let RB = null; while (!(RB = rd(RBF)) && !bDone) await new Promise((r) => setTimeout(r, 2000));
  if (!RB) RB = rd(RBF);
  const V = RB ? RB.V : null;
  const pA = V ? run('A', DAYS, { T1340_AT_V: String(V) }) : Promise.resolve({ code: -1 });
  const [B, Bp, Br, A] = await Promise.all([pB, pBp, pBr, pA]);
  const AT = rd(path.join(D('A'), 'seg-0.json.t1340-at.json'));
  const AT2 = rd(path.join(D('A'), 'seg-0.json.t1372-at.json'));
  ok(B.code === 0 && A.code === 0 && RB && AT && AT2 && AT.V === RB.V, '판 둘이 끝까지 돌았고 같은 순간(다시 뜬 첫 틱 V)을 떴다', `B ${B.code} · A ${A.code} · V ${V}`);
  const R3 = (dir) => rd(path.join(D(dir), `seg-${CUT}.json.t1372-ready.json`));   // 다시 뜬 첫 틱 몹 칸(무리 묶음)
  const momOf = (dir, tag) => (AT2 ? mom(path.join(D('A'), 'seg-0.json.t1372-at.json'), path.join(D(dir), `seg-${CUT}.json.t1372-ready.json`), tag) : null);

  console.log('\nⓐ 마을 몸 pid · econ');
  const P = pidQ(AT, RB);
  ok(P.n > 0 && P.vils > 0, '[전제] 그 순간 마을 몸이 있다(0 이면 아래가 자명 통과다)', `마을 ${P.vils} · 몸 ${P.n}`);
  const R = A.code === 0 && B.code === 0 ? cmp(D('A'), D('B')) : null;
  ok(pidOk(P) && R && full(R.econ) && R.econ.both === 8, 'ⓐ 다시 뜬 첫 틱의 마을 몸 pid 100% 같음 · 8날 econ 날 지문 8/8',
    `pid 같음 ${P.same}/${P.n} · econ ${R && R.econ ? `${R.econ.same}/${R.econ.both}` : '?'} · (기록) 마을 칸 ${R && R.side ? `${R.side.same}/${R.side.both}` : '?'} · 몸 자리 ${R && R.body ? `${R.body.same}/${R.body.both}` : '?'}`);

  console.log('\nⓑ 길 닳음 · 몹 집');
  const M = momOf('B', 'B');
  ok(qRoad(M) && qMob(AT2, M, R3('B')), 'ⓑ 길 닳음 칸(등급 · 닳은 날) 갈림 0 · 몹 집 · 무리 · 배회 갈림 0', `${rdS(M)} · ${mobS(AT2, M, R3('B'))}`);

  console.log('\nⓒ 미끼 — 종료 저장 줄에서 한 자리만 뺀 사본');
  const bait = (dir) => rd(path.join(D(dir), 'seg-0.json.t1382-bait.json'));
  const KP = bait('Bp'), RP = rd(path.join(D('Bp'), `seg-${CUT}.json.t1340-ready.json`)), PP = pidQ(AT, RP), MP = momOf('Bp', 'Bp');
  ok(Bp.code === 0 && KP && KP.n === 1 && KP.rows > 0 && !pidOk(PP) && qRoad(MP) && qMob(AT2, MP, R3('Bp')), '[미끼] 바꾼 자리 1 — 마을 몸 행의 저장 pid($p · 몸 번호)를 뺀 사본은 ⓐ 만 빨강(ⓑ 초록)',
    `뺀 자리 ${KP ? KP.n : '?'}(행 ${KP ? KP.rows : '?'}) · pid 같음 ${PP.same}/${PP.n} · ⓐ ${pidOk(PP) ? '초록' : '빨강'} · ⓑ ${qRoad(MP) && qMob(AT2, MP, R3('Bp')) ? '초록' : '빨강'}`);
  const KR = bait('Br'), RR = rd(path.join(D('Br'), `seg-${CUT}.json.t1340-ready.json`)), PR = pidQ(AT, RR), MR = momOf('Br', 'Br');
  ok(Br.code === 0 && KR && KR.n === 1 && !qRoad(MR) && qMob(AT2, MR, R3('Br')) && pidOk(PR), '[미끼] 바꾼 자리 1 — 길 닳음 줄(zone.t1382Roads)을 뺀 사본은 ⓑ 의 길만 빨강(몹 · ⓐ 의 pid 초록)',
    `뺀 자리 ${KR ? KR.n : '?'} · ${rdS(MR)} · 길 ${qRoad(MR) ? '초록' : '빨강'} · 몹 ${qMob(AT2, MR, R3('Br')) ? '초록' : '빨강'} · pid ${pidOk(PR) ? '초록' : '빨강'}`);

  console.log(`\n=== T1382 결과: ${pass} 통과 · ${fail} 실패 ===`);
  if (!fail) fs.rmSync(BASE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
