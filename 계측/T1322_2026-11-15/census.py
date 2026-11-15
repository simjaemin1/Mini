import re,glob,collections,sys
F=['canadiaVillage','nextDecisionAt','simEvacUntil','behavior','npcHomeX','npcHomeY','npcBedX','npcBedY','simLonOff','_t720','targetX','targetY','gatherTarget','harvestTarget','canadiaTask','path','_t791P','_t791Pn','_t791Px','_t791Py','pathIndex','x','y','_t670TkX','_t670TkY','_t670Tk','_pathFor','_stuckN','vx','vy','hp','_stuckPos','simVillageId','simJob']
pat=re.compile(r'\b(npc|p|b|body|pp|q|o|ep|m|n|w|e|rec|bd|u|t|c)\.('+'|'.join(map(re.escape,F))+r')\s*(=(?!=)|\+\+|--|\+=|-=)')
fn=re.compile(r'^\s*(?:async\s+)?function\s+([\w$]+)|^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*(?:\([^)]*\)|[\w$]+)\s*=>|^\s*([\w$]+)\s*\([^)]*\)\s*\{\s*$')
out=collections.Counter(); per=collections.defaultdict(set)
for f in sorted(glob.glob('server/*.js')):
    cur='(top)'
    for i,l in enumerate(open(f,encoding='utf8')):
        m=fn.match(l)
        if m and not l.startswith('    '*3): cur=next(g for g in m.groups() if g)
        for mm in pat.finditer(l):
            out[(f.split('/')[-1],cur)]+=1; per[(f.split('/')[-1],cur)].add(mm.group(2))
tot=sum(out.values()); print('쓰기 자리',tot,'함수',len(out))
for (f,c),v in sorted(out.items(), key=lambda x:-x[1])[:int(sys.argv[1]) if len(sys.argv)>1 else 40]: print(f'{v:4d} {f}:{c}  {",".join(sorted(per[(f,c)]))[:120]}')
