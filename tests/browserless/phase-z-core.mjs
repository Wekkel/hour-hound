import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.';
const source=fs.readFileSync(root+'/js/core.js','utf8');
const code=source.slice(source.indexOf('/* ---------- model ---------- */'),source.indexOf('const i7='));
const state={dossiers:[]};
const context=vm.createContext({HH:{state:{read:()=>state}}});
vm.runInContext(code+';globalThis.lookup=dosOf;',context);
const lookup=context.lookup;
let failed=0;
function test(name,fn){try{fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
test('missing dossier returns undefined',()=>assert.equal(lookup('missing'),undefined));
test('duplicate IDs retain the first dossier',()=>{
  state.dossiers=[{id:'a',naam:'first'},{id:'a',naam:'second'}];
  assert.equal(lookup('a'),state.dossiers[0]);
});
test('replacement array exposes edited dossier',()=>{
  state.dossiers=[{id:'a',naam:'edited'}];assert.equal(lookup('a').naam,'edited');
});
test('deletion and imported replacement invalidate prior lookup',()=>{
  state.dossiers=[];assert.equal(lookup('a'),undefined);
  state.dossiers=[{id:'b'}];assert.equal(lookup('a'),undefined);assert.equal(lookup('b'),state.dossiers[0]);
});
test('object field updates remain visible',()=>{
  lookup('b');state.dossiers[0].naam='changed';assert.equal(lookup('b').naam,'changed');
});
test('repeated lookup avoids repeated linear dossier scans',()=>{
  let reads=0;
  state.dossiers=Array.from({length:100},(_,i)=>({get id(){reads++;return 'd'+i;}}));
  assert.equal(lookup('d99'),state.dossiers[99]);reads=0;
  for(let i=0;i<100;i++)assert.equal(lookup('d99'),state.dossiers[99]);
  assert.ok(reads<100,'repeated lookup read '+reads+' IDs');
});
if(failed)process.exitCode=1;
