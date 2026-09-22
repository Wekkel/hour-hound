import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=process.argv[2]||'.',ctx=vm.createContext({console});
vm.runInContext(fs.readFileSync(root+'/js/ui/manage-view.js','utf8'),ctx);
const group=ctx.groepeerBeheerWerk;
let passed=0,failed=0;function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
const ds=[{id:'real',naam:'Project',nummer:'42'},{id:'alias',naam:'Voorlopig project',dvnTo:'real'},{id:'other',naam:'Project',nummer:'43',archief:true}];
test('canonical aliases share a dossier group without mutating data',()=>{const input={dossiers:ds,rules:[{id:'r',dossierId:'alias'}],corrections:[{receiptId:'c',currentOptions:[{sourceIds:['r']}]}],dvnTasks:[{dossierId:'real'},{dossierId:'alias'}]},before=JSON.stringify(input),out=group(input);assert.equal(out.length,1);assert.equal(out[0].id,'real');assert.equal(out[0].corrections.length,1);assert.equal(out[0].dvnTasks.length,2);assert.equal(JSON.stringify(input),before);});
test('same display name or i7 target does not merge unrelated matters',()=>{const out=group({dossiers:ds,dvnTasks:[{dossierId:'real'},{dossierId:'other'}]});assert.equal(out.length,2);});
test('deleted source uses saved source dossier identity',()=>{const out=group({dossiers:ds,corrections:[{receiptId:'gone',currentOptions:[],beforeSnapshots:[{sourceIds:['deleted'],sources:[{id:'deleted',dossierId:'real'}]}]}]});assert.equal(out[0].id,'real');assert.equal(out[0].corrections[0].receiptId,'gone');});
test('one split receipt spanning dossiers remains one review task',()=>{const out=group({dossiers:ds,rules:[{id:'a',dossierId:'real'},{id:'b',dossierId:'other'}],corrections:[{receiptId:'split',currentOptions:[{sourceIds:['a']},{sourceIds:['b']}]}]});assert.equal(out.length,1);assert.equal(out[0].uncertain,true);assert.equal(out[0].corrections.length,1);});
test('cycles and missing links remain visible for review',()=>{const out=group({dossiers:[{id:'a',dvnTo:'b'},{id:'b',dvnTo:'a'},{id:'lost',dvnTo:'missing'}],dvnTasks:[{dossierId:'a'},{dossierId:'lost'}]});assert.equal(out.reduce((n,g)=>n+g.dvnTasks.length,0),2);assert.ok(out.every(g=>g.uncertain));});
test('overbooking with missing rules retains its recorded dossier',()=>{const out=group({dossiers:ds,overbookings:[{id:'o',targetDossierId:'real',sourceRuleIds:['missing']} ]});assert.equal(out[0].id,'real');assert.equal(out[0].overbookings.length,1);});
test('moved overbooking source cannot silently change target group',()=>{const out=group({dossiers:ds,rules:[{id:'r',dossierId:'other'}],overbookings:[{id:'o',targetDossierId:'real',sourceRuleIds:['r']}]});assert.equal(out[0].uncertain,true);assert.equal(out[0].overbookings.length,1);});
test('old proof without source identities is not guessed from dossier number',()=>{const out=group({dossiers:ds,corrections:[{receiptId:'old',before:{targetNumber:'42'},currentOptions:[]}]});assert.equal(out[0].uncertain,true);});
console.log(`${passed}/${passed+failed} grouping checks passed`);if(failed)process.exitCode=1;
