'use strict';
process.env.T1243_FARM_ON='1';
const path=require('path'),root=process.argv[2],E=require(path.join(root,'sim/economy-sim')),K=require(path.join(root,'server/kcal'));
const ids=['food','fish','meat','cooked_food','rice','wheat','barley','foxtail_millet','soybean','fruit','vegetable','mushroom','dried_fish','dried_fruit','smoked_meat','pickled_veg','seed_rice','flax','tool'];
const make=storage=>({storage,npcs:[{}],_world:{cropFoodEq:{foxtail_millet:K.econUnitsOf('foxtail_millet',1),soybean:K.econUnitsOf('soybean',1),flax:0}},land:{}});
const out={};for(const id of ids){const v=make({[id]:100});out[id]={storage:E.totalFoodEquivalent(v),production:E.totalFoodProductionEquivalent({[id]:100},v),productionWithoutVillage:E.totalFoodProductionEquivalent({[id]:100})};}
console.log(JSON.stringify(out));
