import {test,expect} from '@playwright/test';
async function ready(page){await page.goto('/');await page.waitForFunction(()=>globalThis.HH?.state.read().db&&!schrijfOvergang&&HH.storage.indexedDB.hasWriteAccess());}
test('gewijzigd dossiernummer toont correctie met oude en nieuwe inhoud',async({page})=>{
 await ready(page);await page.evaluate(async()=>{
  const date='2026-09-01',d={id:'w-d',nummer:'111111111',naam:'Testdossier',codes:[]},r={id:'w-r',datum:date,start:'09:00',eind:'10:00',dossierId:d.id,omschrijving:'Werk',code:null,uren:1,soort:'werk'};
  await put('dossiers',d);await put('regels',r);await herlaad(true);HH.state.commit({viewDate:date});
  const row=sumVan([r])[0],out=await HH.services.admin.setRegularBooking({snapshot:bookingSnapshotVan(row,date),fingerprint:row.fp,enabled:true,receiptId:'w-p',nowIso:new Date().toISOString(),aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,validateRules:valideerBoekData});
  if(!out.ok)throw Error(out.error);await put('dossiers',{...d,nummer:'222222222'});await herlaad(true);HH.app.showTab('beheer');
 });
 await expect(page.locator('#booking-corrections')).toContainText('Gewijzigd na boeken');
 await expect(page.locator('#booking-corrections')).toContainText('111111111');
 await expect(page.locator('#booking-corrections')).toContainText('222222222');
 page.once('dialog',dialog=>dialog.accept());await page.locator('[data-booking-resolve]').click();
 await expect(page.locator('#booking-corrections')).toContainText('Geen boekingscorrecties');
 await page.reload();await page.waitForFunction(()=>globalThis.HH?.state.read().db&&!schrijfOvergang);
 expect(await page.evaluate(()=>HH.state.read().bookingHistory.resolutions.length)).toBe(1);
});
test('verwijderde bron blijft als correctie zichtbaar',async({page})=>{
 await ready(page);await page.evaluate(async()=>{
  const date='2026-09-01',d={id:'w-del-d',nummer:'333333333',naam:'Dossier',codes:[]},r={id:'w-del-r',datum:date,start:'09:00',eind:'10:00',dossierId:d.id,omschrijving:'Verwijderd werk',code:null,uren:1,soort:'werk'};
  await put('dossiers',d);await put('regels',r);await herlaad(true);
  const row=sumVan([r])[0],out=await HH.services.admin.setRegularBooking({snapshot:bookingSnapshotVan(row,date),fingerprint:row.fp,enabled:true,receiptId:'w-del-p',nowIso:new Date().toISOString(),aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,validateRules:valideerBoekData});
  if(!out.ok)throw Error(out.error);await del('regels',r.id);await herlaad(true);HH.app.showTab('beheer');
 });
 await expect(page.locator('#booking-corrections')).toContainText('Verwijderd werk');
 await expect(page.locator('#booking-corrections')).toContainText('Regels verwijderd');
});
