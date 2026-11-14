#!/bin/bash
# T1293 표.md — 판이 다 끝난 뒤(계측 폴더 JSON 만 읽는다)
R=/root/minirepo; S=$R/scripts; O=$R/계측/T1293_2026-11-13
cd $R
{
echo "# T1293 표 — 광부 포화 값 0 · 100날 · 시드 1020 · 7 (2026-11-13 · S3)"
echo
echo "판 머리: 끔 = 손잡이 셋 끔 · T1266+T1271 = \`T1266_ORE_BODY=1 T1271_ORE_CAP=1\` · +T1293 = 거기에 \`T1293_ORE_SAT=1\` · F = 실험(+T1293 의 포화 문턱을 값표 목표 대신 흐름 × 30 으로 — \`F-patch.py\` · 측정만)."
echo "코드 \`2fbed191d\`(베이스 land1070) · 판 꼴 \`run93.sh\` · F-7 은 날 90 까지(컨테이너 재시작으로 날 93 에 끊김 — 관찰기 마지막 쓰기 날 90)."
echo
echo "## A. 시드 1020 — 10날 표 · 판 요약 — \`t1293-arms.js\`"
echo
node $S/t1293-arms.js 끔=$O/OFF-1020 T1266+T1271=$O/FIX-1020 +T1293=$O/SAT-1020 F=$O/F-1020 --json $O/팔-1020.json
echo
echo "## B. 시드 7 — 10날 표 · 판 요약"
echo
node $S/t1293-arms.js 끔=$O/OFF-7 T1266+T1271=$O/FIX-7 +T1293=$O/SAT-7 F=$O/F-7 --json $O/팔-7.json
echo
echo "## C. 끝 날 광산 마을 — 곳간 · 값표 목표 · 흐름 목표 · 넘은 몫 — \`t1293-arms.js --vil\`"
echo
node $S/t1293-arms.js +T1293·1020=$O/SAT-1020 T1266+T1271·1020=$O/FIX-1020 +T1293·7=$O/SAT-7 T1266+T1271·7=$O/FIX-7 --vil | sed -n '/####/,$p'
echo
echo "## D. 잠김 — 값표 목표가 세계 몫 상한에 걸린 날 · 넘음 · 그날 캔 것 0 — \`t1293-lock.js\`"
node $S/t1293-lock.js 끔·1020=$O/OFF-1020 T1266+T1271·1020=$O/FIX-1020 +T1293·1020=$O/SAT-1020 F·1020=$O/F-1020 끔·7=$O/OFF-7 T1266+T1271·7=$O/FIX-7 +T1293·7=$O/SAT-7 F·7=$O/F-7
echo
echo "## E. 몸 모양(날마다 새 모양만) — \`t1277-shape.js\`"
echo
echo '```'
for r in OFF-1020 FIX-1020 SAT-1020 OFF-7 FIX-7 SAT-7; do echo "--- $r"; node $S/t1277-shape.js $O/$r | grep -v "^날 [0-9]*: 몸 [0-9]* · 모양 [0-9]*(npc 모양 [0-9]*) · 가장 흔한 [0-9/]*$"; done
echo '```'
echo
echo "## F. 같음 — \`t1277-same.js\`(T1277 판과 같은 세계인가)"
echo
echo '```'
echo "T1266+T1271·1020 ↔ T1277 FIX2(+고침 끝 코드):"; node $S/t1277-same.js $O/FIX-1020 계측/T1277_2026-11-12/FIX2-1020 60
echo "+T1293·1020 ↔ T1277 실험 E:"; node $S/t1277-same.js $O/SAT-1020 계측/T1277_2026-11-12/EXP-1020 60
echo "끔·1020 ↔ T1277 OFF:"; node $S/t1277-same.js $O/OFF-1020 계측/T1277_2026-11-12/OFF-1020 60
echo "끔·1020 ↔ T1266+T1271·1020(날 1 ~ 10 — 광부가 서기 전):"; node $S/t1277-same.js $O/OFF-1020 $O/FIX-1020 10
echo '```'
} > $O/표.md 2>&1
echo done
