#!/bin/bash
# T1438 다시 — 만진 판에서 빨갰던 장부 하네스 다섯(이 카드 글자 · 고침 뒤) + 우클릭 · hp 문 e2e 둘(글자 자가 zone · 46-h-verbs 를 읽는다) — 하네스 · 그림 판이 끝난 뒤 혼자
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438
while [ ! -e $D/harn.done ] || [ ! -e $D/pix.done ]; do sleep 30; done
cd /home/claude/mini
echo "다시2 시작 $(date -u +%FT%TZ) · 머리 $(git rev-parse --short HEAD) · 작업 트리 바뀜 $(git status --short | wc -l)" > $D/ev/하네스_다시2_차례.txt
bash scripts/run-regress.sh -j 1 test-coll-grid.js test-granary-add.js test-hp-src.js test-indoor-on.js test-move-soa.js test-t1438-decay.js test-t1118-rack-age.js test-winter-fx.js test-client-globals.js test-doors.js test-guest-identity.js e2e-verbs.js e2e-hp.js > $D/ev/하네스_다시2.txt 2>&1; echo "RC=$?" >> $D/ev/하네스_다시2.txt
echo "다시2 끝 $(date -u +%FT%TZ)" >> $D/ev/하네스_다시2_차례.txt
echo done > $D/re.done
