#!/bin/bash
D=/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1352
cd /home/claude/mini
for f in $D/runs/meta_*.json; do t=$(basename $f .json); t=${t#meta_}; node scripts/t1352-news-analyze.js $D/runs $t --json $D/runs/news_$t.json > /dev/null; done
python3 $D/agg.py natural N0_1020 NL_1020 NS_1020 NLS_1020 N0_7 NL_7 NS_7 NLS_7 N0_42 NL_42 NS_42 NLS_42 NB0_1020 NBLS_1020 > $D/tables/natural.md
python3 $D/agg.py staged S0_1020 SL_1020 SS_1020 SLS_1020 SLS_1020r S0_7 SL_7 SS_7 SLS_7 S0_42 SL_42 SS_42 SLS_42 SB0_1020 SBLS_1020 SB0_7 SBLS_7 SB0_42 SBLS_42 > $D/tables/staged.md
python3 $D/agg.py age S0_1020 SL_1020 SS_1020 SLS_1020 S0_7 SL_7 SS_7 SLS_7 S0_42 SL_42 SS_42 SLS_42 SB0_1020 SBLS_1020 SB0_7 SBLS_7 SB0_42 SBLS_42 > $D/tables/age.md
python3 $D/e2e_table.py > $D/tables/e2e.md
wc -l $D/tables/*.md
