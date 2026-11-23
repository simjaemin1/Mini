#!/usr/bin/env node
'use strict';
// Explicit path only. Preview opens SQLite read-only and creates no backup/file.
const fs = require('fs'), path = require('path');
const FIELDS = ['ore', 'oreMix', 'oreP', 'oreDist', 'tin'];
const pick = land => Object.fromEntries(FIELDS.filter(k => Object.hasOwn(land, k)).map(k => [k, land[k]]));
function replaceOre(land, value) {
  const next = { ...land };
  for (const k of FIELDS) { if (Object.hasOwn(value, k)) next[k] = value[k]; else delete next[k]; }
  return next;
}
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function reader(zone) {
  process.env.ENABLE_VILLAGES = '0';
  const T = require('../server/terrain'), { ZONES } = require('../server/zone-config');
  const P = require('../server/villages').__labProbe, z = ZONES[zone];
  if (!z) throw Error('Unknown zone: ' + zone);
  T.setZonesMeta(ZONES); P.setZoneId(zone);
  const sz = P.SZ, inside = (x,y) => x>=0 && y>=0 && x<z.zoneWidth && y<z.zoneHeight;
  const water = (x,y) => !inside(x,y) || T.isWaterCellLocal(zone,Math.floor(x/sz)*sz+sz/2,Math.floor(y/sz)*sz+sz/2);
  const ta = P.makeTerrainAdapter(T,z,{isTerrainBlockedLocal:(x,y)=>water(x,y)||T.isRockCellLocal(zone,x,y),isWaterTileLocal:water});
  return row => {
    const lp = P.extractLandParamsApprox(ta,row.cx,row.cy,{territory:[]});
    if (!Number.isFinite(lp.ore)) throw Error('Canonical ore missing: ' + row.id);
    return {ore:lp.ore,oreMix:lp.oreMix||{},oreP:lp.oreP||0,oreDist:lp.oreDist||0,tin:lp.tin||0};
  };
}
function migrate({dbPath,apply=false,backupPath,rollbackPath,zone='hanbando',compute}) {
  if (!dbPath || !fs.existsSync(dbPath)) throw Error('Existing --db path is required');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath,{readOnly:!apply});
  try {
    const rows = db.prepare('SELECT id,name,cx,cy,zone,econ_state FROM villages WHERE zone=? ORDER BY id').all(zone);
    const restore = rollbackPath ? JSON.parse(fs.readFileSync(rollbackPath,'utf8')) : null;
    if (restore && (restore.version!==1 || restore.zone!==zone)) throw Error('Backup version/zone mismatch');
    const calc = restore ? null : (compute || reader(zone));
    const changes = [];
    for (const row of rows) {
      let e;try {e=JSON.parse(row.econ_state);} catch {throw Error('Invalid econ_state: '+row.id);}
      if (!e || !e.land) throw Error('Missing land: '+row.id);
      const before=pick(e.land), saved=restore?.changes.find(x=>x.id===row.id);
      if (restore && !saved) continue;
      if (saved && !equal(before,saved.after) && !equal(before,saved.before)) throw Error('Ore fields changed since backup: '+row.id);
      const after=saved?saved.before:calc(row);
      if (equal(before,after)) continue;
      const land=replaceOre(e.land,after);
      changes.push({id:row.id,name:row.name,before,after});
    }
    if (apply && changes.length) {
      if (!restore) {
        if (!backupPath) throw Error('--apply requires --backup path');
        // Exclusive creation: never overwrite the only pre-migration values.
        fs.writeFileSync(backupPath,JSON.stringify({version:1,zone,dbPath:path.resolve(dbPath),changes},null,2)+'\n',{flag:'wx'});
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const get=db.prepare('SELECT econ_state FROM villages WHERE id=? AND zone=?'),put=db.prepare('UPDATE villages SET econ_state=? WHERE id=? AND zone=?');
        for (const c of changes) {
          const e=JSON.parse(get.get(c.id,zone).econ_state);
          if (!equal(pick(e.land),c.before)) throw Error('Concurrent ore edit: '+c.id);
          e.land=replaceOre(e.land,c.after);
          put.run(JSON.stringify(e),c.id,zone);
        }
        db.exec('COMMIT');
      } catch(e) {db.exec('ROLLBACK');throw e;}
    }
    return {mode:apply?'apply':'preview',zone,scanned:rows.length,changed:changes.length,changes};
  } finally {db.close();}
}
if (require.main===module) {
  const a=process.argv.slice(2),arg=k=>{const i=a.indexOf('--'+k);return i<0?undefined:a[i+1];};
  try {console.log(JSON.stringify(migrate({dbPath:arg('db'),apply:a.includes('--apply'),backupPath:arg('backup'),rollbackPath:arg('rollback'),zone:arg('zone')||'hanbando'}),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={FIELDS,pick,replaceOre,migrate,canonicalOreReader:reader};
