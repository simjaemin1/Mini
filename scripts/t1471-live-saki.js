// (@regress 없음 — 러너 밖 · T1471 재기 · 제품 무변) 라이브 DB 사본에서 뽑은 JSON(맥 `~/Mini/_runs/t1471/`)을 읽는다 — node <이 파일> [terrain.js 경로] [지도 txt]
const S = require(process.argv[2] || '/root/minirepo/server/terrain.js');
const L = JSON.parse(require('fs').readFileSync('/mnt/user-data/uploads/Mini/_runs/t1471/live1112.json', 'utf8'));
const Z = 'nippon', rock = (x, y) => S.isRockCellLocal(Z, x * 32 + 16, y * 32 + 16);
const v = L.vils.find((q) => q.name === '사키농촌'), bs = L.vb[String(v.id)];
const inR = {}, tot = {}; let minD = null;
for (const [t, x, y] of bs) { tot[t] = (tot[t] || 0) + 1; if (rock(x, y)) inR[t] = (inR[t] || 0) + 1; }
console.log('건물 행 종류(앞 두 글자)', JSON.stringify(tot)); console.log('바위 안', JSON.stringify(inR));
// 바위 발치에서 가장 가까운 집(ho) · 회관(ha) · 곳간(gr) — 바위 아닌 칸 중
const near = (types) => { let best = null; for (const [t, x, y] of bs) { if (!types.includes(t) || rock(x, y)) continue; for (let R = 1; R <= 30; R++) { let f = false; for (let yy = y - R; yy <= y + R && !f; yy++) for (let xx = x - R; xx <= x + R; xx++) { if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== R) continue; if (rock(xx, yy)) { f = true; break; } } if (f) { if (best == null || R < best) best = R; break; } } } return best; };
console.log('바위까지 — 집', near(['ho']), '· 회관', near(['ha']), '· 곳간', near(['gr']), '· 마당(pl/ya)', near(['pl', 'ya']), '· 밭(dr/fa/ga)', near(['dr', 'fa', 'ga']));
// 지도(가운데 둘레) — 글자 지도 70칸
const T = new Set(bs.filter((b) => b[0] === 'te').map((b) => b[1] + ',' + b[2])), B = new Map(); for (const [t, x, y] of bs) if (t !== 'te') B.set(x + ',' + y, t[0].toUpperCase());
const lines = []; for (let y = v.cy - 45; y <= v.cy + 45; y++) { let s = ''; for (let x = 0; x <= v.cx + 40; x++) { const k = x + ',' + y, r = rock(x, y); s += (x === v.cx && y === v.cy) ? '@' : (B.has(k) ? (r ? '!' : B.get(k)) : (r ? (T.has(k) ? '^' : '#') : (T.has(k) ? ',' : ' '))); } lines.push(s); }
require('fs').writeFileSync(process.argv[3] || '/tmp/claude-0/t1471/saki_map.txt', '@ 가운데 · 대문자 = 마을 건물 행 첫 글자 · ! = 바위 칸 위 건물 · # 바위 · ^ 영토인 바위 · , 영토 · x 0 ~ ' + (v.cx + 40) + ' · y ' + (v.cy - 45) + ' ~ ' + (v.cy + 45) + '\n' + lines.join('\n') + '\n');
