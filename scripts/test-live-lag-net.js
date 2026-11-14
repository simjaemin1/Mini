#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-live-lag-net.js — `live-lag.sh` 망 줄이 존을 **브라우저 길**로 재는가(T1292 · 2026-11-13) ===================
//
// ★왜(T1292 곁): `update-live` ⑦ live-lag 가 "망 — 맥→도쿄:3021 닿지 않음" 을 경보로 쳤다. 오라클 도쿄 방화벽은 3021 을 서울 /32 만 연다(존끼리 넘기기 · 의도).
//   사람(브라우저)은 central `/zones` 가 주는 `wss://<이름>` — Caddy 443 으로 붙는다. 맥은 그 길을 재야 한다(존 포트가 아니라).
// 판(`test-disk-check` 문법 — 판정 사본 0 · **진짜 live-lag.sh 를 돌린다**):
//   가짜 `ssh`(별칭 seoul · tokyo — `-G` 는 흉내 주소 · `bash -s` 는 받은 PROBE 를 이 상자 bash 로 그대로 · 호스트 몫 컨테이너 이름은 `LAG_NAMES`)
//   가짜 `docker`(PROBE 가 부르는 꼴만 · 모르는 꼴은 크게 죽는다 · `exec … node -` 는 이 상자 node 로 **진짜 ZJS** 를 흉내 서버에 돌린다)
//   흉내 central(`/zones` = 진짜 `zone-config` `publicZoneMap` · env 만 라이브 꼴: WS_PROTO=wss · ZONE_HOST_<ID> = 이름) · 흉내 존 둘(`/health` · `/perf`)
//   가짜 `curl`(주소를 적는다 · `block` 의 glob 에 맞으면 닿지 않음 — 오라클 방화벽 흉내 = 맥→도쿄:3021)
// 지키는 것:
//   ⓐ wss 판 — 도쿄 nippon 은 https(443) 로 재서 닿는다 · 한반도도 https · central 은 종전 포트(3010) · 도쿄 3021 은 한 번도 안 두드린다
//      · 판정에 "닿지 않음" 0 · 존 주소 값(이름)은 표 · JSON 어디에도 0(T1077 경계 줄과 같이 길만)
//   ⓑ 브라우저 길이 실제로 막히면(Caddy 443 닿지 않음) 그대로 경보 — 고침이 경보를 느슨하게 만들지 않는다
//   ⓒ ws 판(central 이 wss 를 안 준다 = 브라우저도 존 포트로 간다) → 종전대로 포트 · 3021 닿지 않음 경보(맞는 경보)
//   ⓓ 서울이 안 닿으면(central /zones 를 못 읽음) 종전대로 포트(이름 추측 0)
//   미끼(소스 사본 · 같은 ⓐ 판) ① 망 고리의 길 고르기를 뺀 사본 ② central 이 /zones 주소를 안 싣는 사본 ③ 맥이 주소표를 안 만드는 사본
//     → 셋 다 종전 꼴 "망 — 맥→도쿄:3021 닿지 않음"(빨강) — 자가 ⑦ 경보를 실제로 다시 낸다
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'live-lag.sh');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'livelag-net-'));
const BIN = path.join(TMP, 'bin');
fs.mkdirSync(BIN, { recursive: true });
const SEOUL_IP = '10.77.0.1', TOKYO_IP = '10.77.0.2';
const NAME = { hanbando: 'kr-t1292.example.test', nippon: 'jp-t1292.example.test', gate: 'gate-t1292.example.test' };

// ── 흉내 서버 셋(central · 존 둘) — 같은 프로세스 · lib-port ─────────────────────────────────────────────
const base = require('./lib-port').ports(3, 26400);
const P = { central: base, hanbando: base + 1, nippon: base + 2 };
let ZONES_JSON = null;   // 판마다 다시 굽는다(wss / ws)
function zonesFor(env) {   // 진짜 zone-config — central `/zones` 의 `publicZoneMap(PUBLIC_HOST)` 와 같은 부름
  const e = Object.assign({}, process.env, env);
  for (const k of Object.keys(e)) if (/^(ZONE_HOST_|ZONE_HOSTS$|WS_PROTO$|HTTP_PROTO$|PUBLIC_HOST$|ENABLED_ZONES$)/.test(k) && !(k in env)) delete e[k];
  return execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({ zones: require(process.argv[1]).publicZoneMap(process.env.PUBLIC_HOST || "localhost") }))', path.join(ROOT, 'server', 'zone-config.js')], { env: e }).toString();
}
const perf = () => JSON.stringify({ now: Date.now(), tick: { ms: { n: 3000, p50: 4.1, p95: 9.2, max: 21 }, lagPct: 0, dropN: 0 }, loop: { p95: 3, max: 9, n: 500 }, events: [] });
const servers = [];
function serve(kind) {
  const s = http.createServer((req, res) => {
    const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
    if (req.url === '/health') return send(kind === 'central' ? { ok: true, players: 7 } : { ok: true, humans: 2, villages: 40, day: 12, uptime: 100 });
    if (kind === 'central' && req.url === '/zones') return send(ZONES_JSON);
    if (kind !== 'central' && req.url === '/perf') return send(perf());
    res.writeHead(404); res.end('{}');
  });
  servers.push(s);
  return new Promise((r) => s.listen(P[kind], '127.0.0.1', r));
}

// ── 가짜 셋 ────────────────────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(BIN, 'ssh'), `#!/usr/bin/env bash
# 흉내 ssh — 별칭 seoul · tokyo 만. -G = 흉내 주소 · 그 밖 = 받은 명령을 이 상자 bash 로(호스트 몫 컨테이너 이름은 LAG_NAMES)
G=0
while [ $# -gt 0 ]; do case "$1" in -G) G=1; shift ;; -[oipFlJ]) shift 2 ;; -*) shift ;; *) break ;; esac; done
h=$1; shift
echo "$h G=$G $*" >> "${TMP}/ssh.log"
if [ "$G" = 1 ]; then case "$h" in seoul) echo "hostname ${SEOUL_IP}" ;; tokyo) echo "hostname ${TOKYO_IP}" ;; *) exit 255 ;; esac; exit 0; fi
[ -f "${TMP}/down.$h" ] && { echo "ssh: connect to host $h port 22: Operation timed out" >&2; exit 255; }
case "$h" in seoul) export LAG_NAMES="durango-central durango-zone-hanbando" ;; tokyo) export LAG_NAMES="durango-zone-nippon" ;; *) echo "모르는 별칭 $h" >&2; exit 255 ;; esac
exec bash -c "$*"
`);
fs.writeFileSync(path.join(BIN, 'docker'), `#!/usr/bin/env node
'use strict';
// 흉내 docker — live-lag PROBE 가 부르는 꼴만(모르는 꼴은 크게 죽는다)
const fs = require('fs'); const { spawnSync } = require('child_process');
const a = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(path.join(TMP, 'docker.log'))}, a.join(' ') + '\\n');
const die = (m) => { process.stderr.write('흉내 docker: 모르는 꼴 — ' + m + '\\n'); process.exit(99); };
const ALL = ['durango-central', 'durango-zone-hanbando', 'durango-zone-nippon'];
const HP = { 'durango-central': 3010, 'durango-zone-hanbando': 3020, 'durango-zone-nippon': 3021 };
const IP = { 'durango-central': ${P.central}, 'durango-zone-hanbando': ${P.hanbando}, 'durango-zone-nippon': ${P.nippon} };
const fmt = () => { const i = a.findIndex((x) => x === '--format' || x === '-f'); return i >= 0 ? a[i + 1] : null; };
if (a[0] === 'info') process.exit(0);
else if (a[0] === 'ps' && fmt() === '{{.Names}}') console.log(ALL.join('\\n'));
else if (a[0] === 'stats' && a.includes('--no-stream')) { for (const n of a.filter((x) => ALL.includes(x))) console.log(n + '|1.50%|120MiB / 1.9GiB'); }
else if (a[0] === 'inspect' && /RestartCount/.test(fmt() || '')) { const n = a[a.length - 1]; if (!ALL.includes(n)) die(a.join(' ')); console.log('0|2026-11-13T00:00:00.000000000Z|' + HP[n] + ' '); }
else if (a[0] === 'exec') {
  let i = 1; const env = Object.assign({}, process.env);
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy']) delete env[k];
  for (; i < a.length; i++) { if (a[i] === '-i') continue; if (a[i] === '-e') { const kv = a[++i]; env[kv.split('=')[0]] = kv.slice(kv.indexOf('=') + 1); continue; } break; }
  const n = a[i], cmd = a.slice(i + 1);
  if (!ALL.includes(n) || cmd.join(' ') !== 'node -') die(a.join(' '));
  env.PORT = String(IP[n]); env.ZONE_ID = n.startsWith('durango-zone-') ? n.slice(13) : '';
  const r = spawnSync(process.execPath, ['-'], { stdio: 'inherit', env }); process.exit(r.status == null ? 1 : r.status);
} else die(a.join(' '));
`);
fs.writeFileSync(path.join(BIN, 'curl'), `#!/usr/bin/env bash
# 흉내 curl — 주소(끝 인자)를 적고 · block 의 glob 에 맞으면 닿지 않음(진짜 curl -m 3 꼴: -w 는 찍히고 rc 28)
u="\${@: -1}"
echo "$u" >> "${TMP}/curl.log"
if [ -f "${TMP}/block" ]; then while IFS= read -r pat; do [ -n "$pat" ] || continue; case "$u" in $pat) printf '0.000000 3.001000'; exit 28 ;; esac; done < "${TMP}/block"; fi
printf '0.031000 0.052000'
`);
for (const f of ['ssh', 'docker', 'curl']) fs.chmodSync(path.join(BIN, f), 0o755);

// ── 한 판 ─────────────────────────────────────────────────────────────────────────────────────────────
const ENV_WSS = { WS_PROTO: 'wss', PUBLIC_HOST: NAME.gate, ZONE_HOST_HANBANDO: NAME.hanbando, ZONE_HOST_NIPPON: NAME.nippon };
const ENV_WS = { PUBLIC_HOST: NAME.gate, ZONE_HOST_HANBANDO: NAME.hanbando, ZONE_HOST_NIPPON: NAME.nippon };   // WS_PROTO 없음 = ws://이름:포트
function run(script, { zoneEnv, block, down, json }) {
  ZONES_JSON = zonesFor(zoneEnv);
  for (const f of ['curl.log', 'ssh.log', 'docker.log', 'block', 'down.seoul', 'down.tokyo']) { try { fs.unlinkSync(path.join(TMP, f)); } catch (e) {} }
  fs.writeFileSync(path.join(TMP, 'block'), (block || []).join('\n') + '\n');
  for (const h of down || []) fs.writeFileSync(path.join(TMP, 'down.' + h), '');
  const env = Object.assign({}, process.env, { PATH: BIN + ':' + process.env.PATH, LAG_SEOUL: 'seoul', LAG_TOKYO: 'tokyo', TMPDIR: TMP });
  return new Promise((resolve) => {
    const c = spawn('bash', [script].concat(json ? ['--json'] : []), { env, cwd: ROOT });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (rc) => {
      const curls = fs.existsSync(path.join(TMP, 'curl.log')) ? fs.readFileSync(path.join(TMP, 'curl.log'), 'utf8').trim().split('\n').filter(Boolean) : [];
      const dk = fs.existsSync(path.join(TMP, 'docker.log')) ? fs.readFileSync(path.join(TMP, 'docker.log'), 'utf8') : '';
      let J = null; if (json) { try { J = JSON.parse(out.trim().split('\n').pop()); } catch (e) {} }
      resolve({ rc, out, err, curls, dk, J });
    });
  });
}
const cnt = (a, re) => a.filter((u) => re.test(u)).length;
const netRows = (J) => (J && J.rows || []).filter((r) => r.k === 'net');
const NAMES_RE = new RegExp([NAME.hanbando, NAME.nippon, NAME.gate].map((s) => s.replace(/\./g, '\\.')).join('|'));
// 판정(새 글자가 맞으면 빈 배열) — 미끼는 이 판정에서 빨강이어야 한다
function judgeWss(r) {
  const bad = [];
  const net = netRows(r.J), nip = net.find((x) => x.name === 'durango-zone-nippon'), han = net.find((x) => x.name === 'durango-zone-hanbando'), cen = net.find((x) => x.name === 'durango-central');
  if (r.rc !== 0 || !r.J) bad.push(`rc ${r.rc} · JSON ${!!r.J}`);
  if (!nip || nip.via !== 'https' || nip.port !== 443 || (nip.conn || []).length !== 5) bad.push('도쿄 nippon 이 https 443 으로 5번 닿지 않았다 ' + JSON.stringify(nip || null));
  if (!han || han.via !== 'https' || (han.conn || []).length !== 5) bad.push('한반도가 https 로 안 쟀다 ' + JSON.stringify(han || null));
  if (!cen || cen.via !== 'port' || cen.port !== 3010 || (cen.conn || []).length !== 5) bad.push('central 이 종전 포트(3010)가 아니다 ' + JSON.stringify(cen || null));
  if (cnt(r.curls, /:3021\//) !== 0) bad.push(`도쿄 3021 을 ${cnt(r.curls, /:3021\//)}번 두드렸다`);
  if (cnt(r.curls, new RegExp('^https://' + NAME.nippon.replace(/\./g, '\\.') + '/health$')) !== 5) bad.push('https://<도쿄 이름>/health 5번이 아니다');
  const fl = (r.J && r.J.flags) || [];
  if (fl.some((f) => /닿지 않음/.test(f))) bad.push('판정에 닿지 않음: ' + fl.join(' / '));
  return bad;
}

(async () => {
  for (const k of ['central', 'hanbando', 'nippon']) await serve(k);
  const zw = JSON.parse(zonesFor(ENV_WSS)).zones;
  ok(zw.nippon && zw.nippon.wsUrl === 'wss://' + NAME.nippon && zw.hanbando.wsUrl === 'wss://' + NAME.hanbando,
    '흉내 central /zones 가 라이브 꼴 — 진짜 publicZoneMap · WS_PROTO=wss · ZONE_HOST_<ID> = 이름 → wss://<이름>(포트 없음)', `nippon ${zw.nippon && zw.nippon.wsUrl.replace(NAME.nippon, '<이름>')}`);

  console.log('== ⓐ wss 판(라이브 꼴 · 도쿄 3021 은 맥에서 막힘) ==');
  const A = await run(SCRIPT, { zoneEnv: ENV_WSS, block: [`http://${TOKYO_IP}:3021/*`], json: true });
  const aBad = judgeWss(A);
  ok(aBad.length === 0, '도쿄 nippon = https 443 · 5번 닿음 · 한반도 https · central 3010 그대로 · 3021 두드림 0 · 판정 "닿지 않음" 0', aBad.join(' | '));
  const nA = netRows(A.J).map((x) => `${x.host} ${x.name} ${x.via}:${x.port} ${x.conn.length}`).join(' · ');
  console.log('    망 줄: ' + nA);
  ok(!NAMES_RE.test(A.out) && !NAMES_RE.test(A.err), '존 주소 값(이름)은 --json 출력 어디에도 0(길 · 컨테이너 이름만)');
  const At = await run(SCRIPT, { zoneEnv: ENV_WSS, block: [`http://${TOKYO_IP}:3021/*`], json: false });
  ok(/도쿄 nippon https:443 최소/.test(At.out) && /서울:3010 최소/.test(At.out) && !NAMES_RE.test(At.out), '표 글: "도쿄 nippon https:443 …" · "서울:3010 …"(central 종전 꼴) · 이름 값 0',
    (At.out.split('\n').find((l) => /\[망\]/.test(l)) || '').trim().slice(0, 160));
  //   판정 줄의 **망** 몫만 본다 — 호스트 줄(CPU · 메모리 · 디스크)은 PROBE 가 이 상자의 진짜 /proc 을 읽어 상자 짐에 따라 선다(이 하네스가 재는 것이 아니다)
  const vline = (At.out.trim().split('\n').pop() || '').trim();
  ok(/^판정: /.test(vline) && !/망 — /.test(vline), '판정 줄에 망 경보 0(⑦ 의 거짓 경보 "도쿄:3021 닿지 않음"이 없다 · 호스트 줄은 이 상자 짐이라 안 본다)', vline.slice(0, 140));
  ok(!/모르는 꼴/.test(A.err + At.err) && /exec -i -e LAG_KIND=central durango-central node -/.test(A.dk) && /exec -i -e LAG_KIND=zone durango-zone-nippon node -/.test(A.dk),
    'PROBE 는 진짜 그대로 돌았다(흉내 docker 가 모르는 꼴 0 · 컨테이너마다 ZJS exec)');

  console.log('== ⓑ 브라우저 길이 실제로 막힘(도쿄 Caddy 443 닿지 않음) ==');
  const B = await run(SCRIPT, { zoneEnv: ENV_WSS, block: [`http://${TOKYO_IP}:3021/*`, `https://${NAME.nippon}/*`], json: true });
  const bf = (B.J && B.J.flags) || [];
  ok(bf.some((f) => f === '망 — 맥→도쿄 nippon https:443 닿지 않음') && cnt(B.curls, /:3021\//) === 0, '경보 그대로 — "망 — 맥→도쿄 nippon https:443 닿지 않음"(고침이 경보를 느슨하게 만들지 않는다)', bf.join(' / '));

  console.log('== ⓒ ws 판(central 이 wss 를 안 준다 = 브라우저도 존 포트) ==');
  const C = await run(SCRIPT, { zoneEnv: ENV_WS, block: [`http://${TOKYO_IP}:3021/*`], json: true });
  const cf = (C.J && C.J.flags) || [], cn = netRows(C.J).find((x) => x.name === 'durango-zone-nippon');
  ok(cn && cn.via === 'port' && cn.port === 3021 && cf.includes('망 — 맥→도쿄:3021 닿지 않음') && cnt(C.curls, /^https:/) === 0,
    '종전대로 존 포트 · "망 — 맥→도쿄:3021 닿지 않음"(그 길이 브라우저 길 — 맞는 경보) · https 0', cf.join(' / '));

  console.log('== ⓓ 서울이 안 닿음(central /zones 못 읽음) ==');
  const D = await run(SCRIPT, { zoneEnv: ENV_WSS, block: [`http://${TOKYO_IP}:3021/*`], down: ['seoul'], json: true });
  const df = (D.J && D.J.flags) || [], dn = netRows(D.J).find((x) => x.name === 'durango-zone-nippon');
  ok(dn && dn.via === 'port' && df.some((f) => /서울 호스트 닿지 않음/.test(f)) && cnt(D.curls, /^https:/) === 0,
    '이름을 추측하지 않는다 — 종전대로 포트(서울 닿지 않음 경보와 함께)', df.join(' / '));

  console.log('== 미끼 — 같은 판(ⓐ)에서 빨강이어야 ==');
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const bait = (name, from, to) => {
    if (!src.includes(from)) return null;
    const f = path.join(TMP, `bait-${name}.sh`); fs.writeFileSync(f, src.replace(from, to)); return f;
  };
  const b1 = bait('pick', `case "$n" in durango-zone-*) pub="$(awk`, `case "$n" in durango-zone-NOPE) pub="$(awk`);
  const b2 = bait('pubs', 'o.pubs = pubs;', 'o.pubs = {};');
  const b3 = bait('table', `> "$TMP/pubs" 2>/dev/null`, `> /dev/null 2>/dev/null`);
  for (const [nm, f] of [['① 망 고리의 길 고르기 뺌', b1], ['② central 이 /zones 주소를 안 실음', b2], ['③ 맥이 주소표를 안 만듦', b3]]) {
    if (!f) { ok(false, `미끼 ${nm} — 바꿀 글자를 못 찾았다(하네스가 낡았다)`); continue; }
    const R = await run(f, { zoneEnv: ENV_WSS, block: [`http://${TOKYO_IP}:3021/*`], json: true });
    const bad = judgeWss(R), rf = (R.J && R.J.flags) || [];
    ok(bad.length > 0 && rf.includes('망 — 맥→도쿄:3021 닿지 않음'), `미끼 ${nm} → 빨강(판정 ${bad.length}건 · "망 — 맥→도쿄:3021 닿지 않음")`, rf.filter((x) => /망/.test(x)).join(' / '));
  }

  for (const s of servers) s.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
