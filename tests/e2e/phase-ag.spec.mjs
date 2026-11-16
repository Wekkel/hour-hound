/* Patch AG in een echte browser: spookregels, DVN-omschrijving zonder datum, het
   boekvenster per dossier vanuit Beheer en de ingedeelde werkvoorraad. Elke test
   start met een lege IndexedDB (nieuwe browsercontext) en gebruikt de echte app. */
import {test,expect} from '@playwright/test';
const SHOTS=process.env.HH_SHOTS||'';
const shot=async(page,name)=>{if(SHOTS)await page.screenshot({path:SHOTS+'/'+name+'.png'});};
async function ready(page){
  page.on('dialog',dialog=>dialog.accept());
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/');
  await page.waitForFunction(()=>globalThis.HH?.state.read().db&&!schrijfOvergang&&HH.storage.indexedDB.hasWriteAccess());
}
const CODES=[{code:'I700000000-701',naam:'Praktijkorganisatie/administratie',favoriet:true},
  {code:'I700000000-704',naam:'Commercieel',favoriet:true}];
async function seed(page,data){
  await page.evaluate(async({data,codes})=>{
    for(const c of codes)await put('codes',c);
    for(const d of data.dossiers||[])await put('dossiers',d);
    for(const r of data.regels||[])await put('regels',r);
    await herlaad(true);HH.state.commit({codes:await getAll('codes')});HH.app.render();
  },{data,codes:CODES});
}
const regel=(id,o)=>Object.assign({id,datum:'2026-09-04',start:'09:00',eind:'10:00',dossierId:'n',code:null,
  omschrijving:'review docs',uren:1,urenHand:false,soort:'werk'},o);

test('onafgemaakte Nieuwe taak laat geen lege regel achter (N, N, daarna bestaande taak)',async({page})=>{
  await ready(page);
  const klok=await page.evaluate(()=>({nu:nowHM(),min:hm2m(nowHM()),vandaag:today()}));
  test.skip(klok.min<45,'te kort na middernacht voor een eerdere regel op dezelfde dag');
  await seed(page,{dossiers:[{id:'g',nummer:'304111222',naam:'Levering Kerkstraat',codes:[],lang:'nl'}],
    regels:[regel('eerder',{datum:klok.vandaag,start:await page.evaluate(m=>m2hm(m-40),klok.min),
      eind:await page.evaluate(m=>m2hm(m-10),klok.min),dossierId:'g',omschrijving:'bespreking'})]});
  await page.locator('#b-switch').click();
  await expect(page.locator('#nt-wizard')).toContainText('Wat voor taak?');
  await page.locator('#b-switch').click();           // nogmaals N zonder iets te kiezen
  await expect(page.locator('#nt-wizard')).toContainText('Wat voor taak?');
  let regels=await page.evaluate(()=>HH.state.read().rules.map(r=>({d:r.dossierId,e:r.eind})));
  expect(regels.filter(r=>!r.d).length).toBe(1);     // nog steeds precies één lege, lopende regel
  await shot(page,'1-nieuwe-taak-onafgemaakt');
  await page.locator('#recent [data-taak]').first().click();   // bestaande taak aanklikken
  await expect(page.locator('#l-who')).toHaveText('Levering Kerkstraat');
  regels=await page.evaluate(()=>getAll('regels'));
  expect(regels.length).toBe(2);
  expect(regels.filter(r=>!r.dossierId).length).toBe(0);
  expect(regels.filter(r=>!r.eind).length).toBe(1);
  await page.locator('#tabs [data-v="dag"]').click();
  await expect(page.locator('#d-probs')).not.toContainText('geen dossier gekozen');
  await shot(page,'2-dag-zonder-spookregel');
});

test('Dag: bestaande lege regels blokkeren het boeken en zijn met één knop op te ruimen',async({page})=>{
  await ready(page);
  await seed(page,{dossiers:[{id:'g',nummer:'304111222',naam:'Levering Kerkstraat',codes:[],lang:'nl'}],
    regels:[regel('vol',{dossierId:'g',omschrijving:'bespreking'}),
      regel('spook',{start:'10:51',eind:'10:52',dossierId:null,omschrijving:'',uren:0.1})]});
  await page.evaluate(()=>{HH.state.commit({viewDate:'2026-09-04'});HH.app.showTab('dag');});
  await expect(page.locator('#d-probs')).toContainText('geen dossier gekozen');
  await expect(page.locator('[data-leeg-opruimen]')).toBeVisible();
  await shot(page,'3-dag-lege-regel-knop');
  await page.locator('[data-leeg-opruimen]').click();
  await expect(page.locator('#d-probs')).not.toContainText('geen dossier gekozen');
  expect(await page.evaluate(async()=>(await getAll('regels')).map(r=>r.id).join())).toBe('vol');
  await page.locator('#d-boek').click();
  await expect(page.locator('#boek')).toHaveClass(/on/);
  await expect(page.locator('#bk-kaart')).toContainText('bespreking');
});

test('DVN krijgt een nummer en wordt geboekt via hetzelfde boekvenster als Dag, zonder datum in de omschrijving',async({page})=>{
  await ready(page);
  await seed(page,{dossiers:[
      {id:'v',nummer:null,naam:'Bouwfonds Zuid',voorlopig:true,dvn:true,codes:[],lang:'nl'},
      {id:'w',nummer:null,naam:'Wachtende zaak',voorlopig:true,dvn:true,codes:[],lang:'nl'}],
    regels:[
      regel('a',{dossierId:'v',code:'I700000000-704',omschrijving:'04.09.2026 · Bouwfonds Zuid · review docs'}),
      regel('b',{dossierId:'v',code:'I700000000-704',datum:'2026-09-08',start:'13:00',eind:'14:30',uren:1.5,
        omschrijving:'08.09.2026 · Bouwfonds Zuid · concept akte'}),
      regel('c',{dossierId:'w',code:'I700000000-704',datum:'2026-09-09',start:'11:00',eind:'11:30',uren:0.5,
        omschrijving:'09.09.2026 · Wachtende zaak · bellen'})]});
  await page.locator('#tabs [data-v="beheer"]').click();
  await expect(page.locator('#manage-worklist')).toContainText('Wacht op dossiernummer');
  await expect(page.locator('#manage-worklist')).toContainText('Wacht op nummer: 2 boekregels · 2,5 u');
  await shot(page,'4-beheer-wacht-op-nummer');
  // nummer toekennen via de stappen van het dossier
  await page.locator('.manage-row',{hasText:'Bouwfonds Zuid'}).locator('[data-manage-open]').click();
  await page.locator('[data-manage-confirm]').click();
  await expect(page.locator('#dvnnum')).toHaveClass(/on/);
  await page.locator('#dn-num').fill('304555666');
  await page.locator('#dn-save').click();
  await expect(page.locator('#dvnnum')).not.toHaveClass(/on/);
  // opgeslagen regels: geen datum en geen DVN-naam meer
  expect(await page.evaluate(async()=>(await getAll('regels')).filter(r=>r.dossierId==='v').map(r=>r.omschrijving).sort().join('|')))
    .toBe('concept akte|review docs');
  // na het toekennen opent het boekvenster vanzelf; Esc sluit het zonder iets te boeken
  await expect(page.locator('#boek')).toHaveClass(/on/);
  await expect(page.locator('#bk-kaart .oms')).toHaveText('review docs');
  await page.keyboard.press('Escape');
  await expect(page.locator('#boek')).not.toHaveClass(/on/);
  expect(await page.evaluate(async()=>((await get('meta','bookingHistory'))||{receipts:[]}).receipts.length)).toBe(0);
  await expect(page.locator('#manage-flow [data-manage-book]').first()).toBeVisible();
  await shot(page,'5-beheer-na-nummer');
  await page.locator('[data-manage-back]').first().click();
  await expect(page.locator('[data-manage-group="book"]')).toContainText('304555666 · Bouwfonds Zuid');
  await expect(page.locator('[data-manage-group="book"]')).toContainText('Te boeken: 2 boekregels · 2,5 u');
  await expect(page.locator('[data-manage-group="number"]')).toContainText('Wachtende zaak');
  await shot(page,'6-beheer-werkvoorraad');
  // boeken met het toetsenbord, zoals onder Dag
  await page.locator('[data-manage-book]').first().click();
  await expect(page.locator('#boek')).toHaveClass(/on/);
  await expect(page.locator('#bk-titel')).toContainText('304555666 · Bouwfonds Zuid');
  await expect(page.locator('#bk-kaart .werkdatum')).toContainText('04-09-2026');
  await expect(page.locator('#bk-kaart .oms')).toHaveText('review docs');
  await expect(page.locator('#bk-kaart .nr')).toHaveText('304555666');
  await shot(page,'7-boekvenster-dossier');
  await page.keyboard.press('l');
  await expect(page.locator('#bk-lijst .bkrow')).toHaveCount(2);
  await shot(page,'8-boekvenster-lijst');
  await page.keyboard.press('l');
  await page.keyboard.press('Enter');
  await expect(page.locator('#bk-kaart .werkdatum')).toContainText('08-09-2026');
  await expect(page.locator('#bk-kaart .oms')).toHaveText('concept akte');
  await page.keyboard.press('Enter');
  await expect(page.locator('#bk-titel')).toContainText('klaar');
  await page.keyboard.press('Enter');
  await expect(page.locator('#boek')).not.toHaveClass(/on/);
  // Beheer is bijgewerkt en Dag toont dezelfde bevestiging
  await expect(page.locator('[data-manage-group="book"]')).toHaveCount(0);
  const bewijs=await page.evaluate(async()=>(await get('meta','bookingHistory')).receipts.map(r=>
    r.snapshot.date+'|'+r.snapshot.targetNumber+'|'+r.snapshot.description+'|'+r.snapshot.hours));
  expect(bewijs.sort()).toEqual(['2026-09-04|304555666|review docs|1','2026-09-08|304555666|concept akte|1.5']);
  await page.evaluate(()=>{HH.state.commit({viewDate:'2026-09-08'});HH.app.showTab('dag');});
  await expect(page.locator('#d-boekstat')).toContainText('Volledig geboekt in Intapp');
  await shot(page,'9-dag-na-boeken');
});
