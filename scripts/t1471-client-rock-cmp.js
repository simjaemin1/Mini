// (@regress 없음 — 러너 밖 · T1471 재기 · 제품 무변) 라이브 DB 사본에서 뽑은 JSON(맥 `~/Mini/_runs/t1471/`)을 읽는다 — node <이 파일> [terrain.js 경로] [지도 txt]
const S = require('/root/minirepo/server/terrain.js');
const HC = require('/root/minirepo/server/hanbando-terrain.json');
const ZONES = require('/root/minirepo/server/zone-config').ZONES;
const run = (zones) => { delete require.cache[require.resolve('/root/minirepo/public/terrain.js')]; const C = require('/root/minirepo/public/terrain.js'); C.setZonesMeta(ZONES); for (const z of zones) C.setHardcoded(z, HC[z]); return C; };
const Z = 'nippon', x0 = 0, x1 = 120, y0 = 1840, y1 = 2000;
const cnt = (C) => { let srv = 0, cli = 0, diff = 0, srvOnly = 0, cliOnly = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x * 32 + 16, py = y * 32 + 16; const a = S.isRockCellLocal(Z, px, py), b = C.isRockCellLocal(Z, px, py); if (a) srv++; if (b) cli++; if (a !== b) { diff++; if (a) srvOnly++; else cliOnly++; } } return { srv, cli, diff, srvOnly, cliOnly }; };
console.log('A nippon only', JSON.stringify(cnt(run([Z]))));
console.log('B all', JSON.stringify(cnt(run(Object.keys(HC)))));
// 존 전체(닛폰 · 4칸 간격 표본)
const C = run(Object.keys(HC)); const z = ZONES.nippon; let n = 0, d = 0; for (let y = 0; y < z.zoneHeight / 32; y += 4) for (let x = 0; x < z.zoneWidth / 32; x += 4) { const px = x * 32 + 16, py = y * 32 + 16; n++; if (S.isRockCellLocal(Z, px, py) !== C.isRockCellLocal(Z, px, py)) d++; }
console.log('nippon 전체 표본', n, '어긋남', d);
