import {test,expect} from '@playwright/test';

async function openWriter(page){
  await page.goto('/');
  await page.waitForFunction(()=>globalThis.HH?.storage.indexedDB.hasWriteAccess()&&
    !schrijfOvergang&&!document.body.classList.contains('read-only')&&globalThis.HH.state.read().db);
}

test('één schrijfvenster, coöperatieve overname en volledige status-sync',async({context})=>{
  const first=await context.newPage(),second=await context.newPage();await openWriter(first);
  await second.goto('/');await expect(second.locator('#writer-banner')).toBeVisible();
  expect(await second.evaluate(async()=>{
    try{await HH.storage.indexedDB.put('regels',{id:'verboden'});return false;}
    catch(e){return e.code==='read_only';}
  })).toBe(true);
  await second.locator('#writer-takeover').click();
  await expect(second.locator('#writer-banner')).toBeHidden();
  await expect(first.locator('#writer-banner')).toBeVisible();
  await second.evaluate(async()=>{
    await HH.storage.indexedDB.putKey('meta',{'2026-09-01':['bevestigd']},'geboekt');
    await HH.storage.indexedDB.putKey('meta','regel','rondMode');
  });
  await expect.poll(()=>first.evaluate(()=>HH.state.read().booked['2026-09-01'])).toEqual(['bevestigd']);
  await expect.poll(()=>first.evaluate(()=>HH.state.read().roundingMode)).toBe('regel');
});

test('overname weigert open invoer en kan daarna opnieuw',async({context})=>{
  const first=await context.newPage(),second=await context.newPage();await openWriter(first);
  await first.evaluate(()=>{
    const input=document.createElement('input');input.id='pending-test-input';document.body.append(input);input.focus();
  });
  await second.goto('/');await expect(second.locator('#writer-banner')).toBeVisible();
  await second.locator('#writer-takeover').click();
  await expect(second.locator('#toast')).toContainText('Rond de invoer');
  expect(await first.evaluate(()=>HH.storage.indexedDB.hasWriteAccess())).toBe(true);
  await first.evaluate(()=>document.getElementById('pending-test-input').remove());
  await second.locator('#writer-takeover').click();await expect(second.locator('#writer-banner')).toBeHidden();
});

test('echte IndexedDB sluit plus vult eenmaal aan en draait fout volledig terug',async({page})=>{
  await openWriter(page);
  const result=await page.evaluate(async()=>{
    const g=HH.storage.indexedDB,date='2026-09-01',dossier=(await g.getAll('dossiers')).find(d=>d.isI7),
      rule={id:'test-rule',datum:date,start:'09:00',eind:'10:00',uren:1,urenHand:false,
        soort:'werk',omschrijving:'Werk',dossierId:dossier.id,code:'ADM'};
    await g.put('regels',rule);
    const input={date,end:'17:00',fill:true,isWorkday:true,i7Dossier:dossier,code:'ADM',
      autoFillId:'test-fill',batchId:'batch',operationId:'close-test',nowMs:1,nowIso:date+'T17:00:00Z'};
    const outcomes=await Promise.all([HH.services.dayRules.closeDay(input),HH.services.dayRules.closeDay(input)]);
    let failed=false;
    try{await g.atomicWrite({stores:['regels']},(_,w)=>{w.put('regels',{...rule,id:'must-rollback'});throw Error('test rollback');});}
    catch{failed=true;}
    return {outcomes,failed,rules:await g.getAll('regels'),end:await g.get('meta','dagEinde')};
  });
  expect(result.outcomes.every(x=>x.ok)).toBe(true);expect(result.failed).toBe(true);
  expect(result.rules.some(r=>r.id==='must-rollback')).toBe(false);
  expect(result.rules.filter(r=>r.id==='test-fill')).toHaveLength(1);
  expect(result.rules.reduce((n,r)=>n+r.uren,0)).toBe(8);expect(result.end['2026-09-01']).toBe('17:00');
});
