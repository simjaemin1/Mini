# 줄: arm:seed ... (FX5 = 고침 셋 + T1276 + T1284 · ON = 지금 밭 켬 + 작물 철)
for x in "$@"; do a=${x%%:*}; s=${x#*:}; grep -q "done $a $s 800 rc=0" /tmp/t1374/q/done.log 2>/dev/null && continue
 case $a in FX5) e="T1179_CROP_SEASON=1 T1276_FARM_K=1 T1284_FARM_YIELD=1 T1374_NO_BYGRAIN=1 T1374_BIRTH_HARV=1 T1374_FAMINE_HARV=1";; ON) e="T1179_CROP_SEASON=1";; *) e="";; esac
 bash /tmp/t1374/q/run.sh $a $s 800 $e; done
