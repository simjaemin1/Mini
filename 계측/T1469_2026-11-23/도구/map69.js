// map69.js — 한 시드의 소굴이 옮겨 다닌 길(T1469 · 숲 · 마을 · 은거지 · 옮김 화살)
//   node map.js <run 폴더> <tag> <seed> <out.svg> [ROOT] [제목]
'use strict';
const fs = require('fs'), path = require('path');
const [DIR, TAG, SEED, OUTF, ROOT0, TITLE] = process.argv.slice(2);
const ROOT = ROOT0 || path.join(__dirname, '../../..');
const J = JSON.parse(fs.readFileSync(path.join(DIR, `${TAG}-${SEED}.json.t1460.json`), 'utf8'));
const LOG = fs.readFileSync(path.join(DIR, `${TAG}-${SEED}.log`), 'utf8');
const vils = []; for (const m of LOG.matchAll(/\[([^\]\s]+)\] 시딩: 중심 셀\((\d+),(\d+)\)/g)) vils.push({ name: m[1], cx: +m[2], cy: +m[3] });
const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {};
let forests = [], ZW = 4063, ZH = 4063;
try { const ZC = require(path.join(ROOT, 'server/zone-config')); const T = require(path.join(ROOT, 'server/terrain')); const Z = ZC.ZONES.hanbando; ZW = Z.zoneWidth / 32; ZH = Z.zoneHeight / 32; forests = ((T.ZONE_TERRAIN || {}).hanbando || {}).forests || []; } finally { console.log = _l; console.warn = _w; }
const G = J.gangs;
const xs = G.map((g) => g.camp[0]).concat(vils.map((v) => v.cx)), ys = G.map((g) => g.camp[1]).concat(vils.map((v) => v.cy));
const pad = 200, x0 = Math.max(0, Math.min(...xs) - pad), y0 = Math.max(0, Math.min(...ys) - pad), x1 = Math.min(ZW, Math.max(...xs) + pad), y1 = Math.min(ZH, Math.max(...ys) + pad);
const W = 1100, sc = W / (x1 - x0), H = Math.round((y1 - y0) * sc) + 170;
const X = (x) => ((x - x0) * sc).toFixed(1), Y = (y) => ((y - y0) * sc + 70).toFixed(1);
const endDay = J.w[J.w.length - 1][0];
const life = (g) => g.last - g.first + 1;
const col = (L) => { const t = Math.max(0, Math.min(1, L / endDay)); const r = Math.round(200 - 150 * t), gg = Math.round(80 + 60 * t), b = Math.round(60 + 160 * t); return `rgb(${r},${gg},${b})`; };
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`);
out.push(`<rect width="${W}" height="${H}" fill="#f7f5ee"/>`);
out.push(`<text x="16" y="28" font-size="20" font-weight="bold">${TITLE || ''}</text>`);
out.push(`<text x="16" y="50" font-size="13" fill="#444">초록 = 숲(지형 숲 타원) · 회색 점 = 마을(엷은 원 = 마을 생활권 140칸) · 색 원 = 은거지(크기 ∝ 가장 컸던 무리 · 색 = 수명 짧음 빨강 → 김 파랑)</text>`);
out.push(`<text x="16" y="66" font-size="13" fill="#444">점선 = 은거지 둘레 140칸 · 글 = 단 번호 · 가장 큰 무리 · 수명(날) · 둘레가 먹이는 수(맨손 · 석기) · 파란 화살 = 소굴을 옮긴 길(차례 · 날 · 단 · 사람)</text>`);
for (const f of forests) { const cx = f.center[0] / 32, cy = f.center[1] / 32, rx = f.rx / 32, ry = f.ry / 32; if (cx + rx < x0 || cx - rx > x1 || cy + ry < y0 || cy - ry > y1) continue; out.push(`<ellipse cx="${X(cx)}" cy="${Y(cy)}" rx="${(rx * sc).toFixed(1)}" ry="${(ry * sc).toFixed(1)}" fill="#9cc79a" fill-opacity="0.45"/>`); }
for (const v of vils) { if (v.cx < x0 || v.cx > x1 || v.cy < y0 || v.cy > y1) continue; out.push(`<circle cx="${X(v.cx)}" cy="${Y(v.cy)}" r="${(140 * sc).toFixed(1)}" fill="#888" fill-opacity="0.07"/><circle cx="${X(v.cx)}" cy="${Y(v.cy)}" r="3" fill="#555"/><text x="${+X(v.cx) + 4}" y="${+Y(v.cy) - 4}" font-size="9" fill="#555">${v.name}</text>`); }
const seen = new Map();
for (const g of G) {
  const k = g.camp.join(','); const t = (g.t60 || [])[0] || {};
  out.push(`<circle cx="${X(g.camp[0])}" cy="${Y(g.camp[1])}" r="${(140 * sc).toFixed(1)}" fill="none" stroke="#a33" stroke-dasharray="3 3" stroke-opacity="0.5"/>`);
  out.push(`<circle cx="${X(g.camp[0])}" cy="${Y(g.camp[1])}" r="${(4 + 2.2 * Math.sqrt(g.nMax)).toFixed(1)}" fill="${col(life(g))}" stroke="#222" stroke-width="0.8"/>`);
  const i = seen.get(k) || 0; seen.set(k, i + 1);
  out.push(`<text x="${+X(g.camp[0]) + 10}" y="${+Y(g.camp[1]) + 4 + i * 12}" font-size="11">#${g.id} 무리 ${g.nMax} · ${life(g)}날 · 먹임 ${t.capReal != null ? t.capReal : '—'} · ${t.capRealStone != null ? t.capRealStone : '—'}</text>`);
}
const MV = [...LOG.matchAll(/D(\d+) 도적단#(\d+) 털 것이 없어 소굴을 옮긴다 \((\d+),(\d+)\) → \((\d+),(\d+)\) · (\d+)명/g)].map((m) => ({ d: +m[1], id: +m[2], a: [+m[3], +m[4]], b: [+m[5], +m[6]], n: +m[7] }));
out.push('<defs><marker id="ar" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#1a4fa0"/></marker></defs>');
MV.forEach((m, i) => { out.push(`<line x1="${X(m.a[0])}" y1="${Y(m.a[1])}" x2="${X(m.b[0])}" y2="${Y(m.b[1])}" stroke="#1a4fa0" stroke-width="2.2" marker-end="url(#ar)"/>`); const mx = (+X(m.a[0]) + +X(m.b[0])) / 2, my = (+Y(m.a[1]) + +Y(m.b[1])) / 2; out.push(`<text x="${mx + 6}" y="${my - 4}" font-size="12" fill="#1a4fa0" font-weight="bold">${i + 1}) D${m.d} #${m.id} ${m.n}명</text>`); });
out.push(`<text x="16" y="${H - 14}" font-size="12" fill="#444">판 ${TAG} 시드 ${SEED} · ${endDay}날 · 은거지 ${G.length}곳(본 단 전부) · 먹이는 수 = 그 둘레 땅(남의 칸 뺌)이 단 몫 0.5 를 대는 가장 큰 사람 수(숙련 0 · 맨손 · 석기)</text>`);
out.push('</svg>');
fs.writeFileSync(OUTF, out.join('\n'));
console.log(`${OUTF} · 마을 ${vils.length} · 은거지 ${G.length} · 숲 ${forests.length}`);
