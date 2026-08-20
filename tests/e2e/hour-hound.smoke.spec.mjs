/*
  Hour Hound Playwright-smoketests

  Doel
  ----
  Deze tests bewaken de belangrijkste gebruikersflows in een echte browser. Ze zijn
  bewust breder en minder talrijk dan de browserloze regressiesuite. Gebruik ze als
  rookmelder na patches: als deze flows stukgaan, is er waarschijnlijk een zichtbare
  regressie in de app.

  Wanneer aanpassen?
  ------------------
  Pas deze tests aan wanneer de UX-tekst of het bewuste productcontract wijzigt. Laat
  ze niet slapper worden om een bug te maskeren. Voeg liever een nieuwe smoketest toe
  wanneer een nieuw kernproces ontstaat, bijvoorbeeld een echte Intapp-integratie.
*/
import { test, expect } from '@playwright/test';

const DB_NAME = 'hourhound';
const DB_VERSION = 3;

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}
function todayLocal() { return ymd(new Date()); }

async function openAndSeed(page, seed) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/');
  await page.evaluate(async ({ dbName, dbVersion, seedData }) => {
    await new Promise(resolve => {
      const del = indexedDB.deleteDatabase(dbName);
      del.onsuccess = del.onerror = del.onblocked = () => resolve();
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, dbVersion);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('days')) d.createObjectStore('days', { keyPath: 'date' });
        if (!d.objectStoreNames.contains('matters')) d.createObjectStore('matters', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('codes')) d.createObjectStore('codes', { keyPath: 'code' });
        if (!d.objectStoreNames.contains('dossiers')) d.createObjectStore('dossiers', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('regels')) {
          const s = d.createObjectStore('regels', { keyPath: 'id' });
          s.createIndex('datum', 'datum');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['dossiers', 'regels', 'codes', 'meta'], 'readwrite');
      seedData.dossiers.forEach(row => tx.objectStore('dossiers').put(row));
      seedData.regels.forEach(row => tx.objectStore('regels').put(row));
      seedData.codes.forEach(row => tx.objectStore('codes').put(row));
      for (const [key, value] of Object.entries(seedData.meta || {})) {
        if (value === undefined || value === null) tx.objectStore('meta').delete(key);
        else tx.objectStore('meta').put(value, key);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('seed transaction aborted'));
    });
  }, { dbName: DB_NAME, dbVersion: DB_VERSION, seedData: seed });
  await page.reload();
  await expect(page.locator('#v-nu')).toBeVisible();
}

const baseCodes = [
  { code: 'COM', naam: 'Commercieel' },
  { code: 'ADM', naam: 'Praktijkorganisatie/administratie' }
];

test('meldt een lopende taak van een eerdere dag en laat bewust doorlopen', async ({ page }) => {
  const today = todayLocal();
  const old = addDays(today, -1);
  const runningRule = {
    id: 'r-old-open', datum: old, start: '15:20', eind: null,
    dossierId: 'd-normal', code: null, omschrijving: 'oude lopende taak', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
  };
  await openAndSeed(page, {
    dossiers: [{ id: 'd-normal', nummer: '304000001', naam: 'Normaal dossier', lang: 'nl', codes: [], c: 1 }],
    regels: [runningRule],
    codes: baseCodes,
    meta: { running: runningRule.id }
  });

  await expect(page.getByText('Lopende taak van eerdere dag')).toBeVisible();
  await expect(page.getByText('Stop deze taak op de startdatum van de regel')).toBeVisible();
  await page.getByRole('button', { name: 'Door laten lopen' }).click();
  await expect(page.getByText('Lopende taak van eerdere dag')).toBeHidden();
  await expect(page.locator('#l-who')).toContainText('Normaal dossier');
});

test('wijzigt een bestaande tijdregel via de bewuste bewerkingssheet', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [{ id: 'd-normal', nummer: '304000002', naam: 'Bewerk dossier', lang: 'nl', codes: [], c: 1 }],
    regels: [{
      id: 'r-edit', datum: today, start: '09:00', eind: '09:30', dossierId: 'd-normal',
      code: null, omschrijving: 'oude omschrijving', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await page.getByRole('button', { name: 'Dag' }).click();
  await expect(page.getByText('oude omschrijving')).toBeVisible();
  await page.getByRole('button', { name: 'bewerk' }).first().click();
  await expect(page.getByText('Tijdregel bewerken')).toBeVisible();
  await page.locator('#er-oms').fill('nieuwe bewuste omschrijving');
  await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click();
  await expect(page.getByText('Tijdregel bewerken')).toBeHidden();
  await expect(page.getByText('nieuwe bewuste omschrijving')).toBeVisible();
});

test('kent een dossiernummer toe aan DVN en markeert de DVN als ingevoerd', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [{
      id: 'd-dvn', nummer: null, naam: 'KanAm - Malo X', lang: 'nl', codes: [], c: 1,
      voorlopig: true, isI7: true, dvn: true
    }],
    regels: [{
      id: 'r-dvn', datum: today, start: '10:00', eind: '11:00', dossierId: 'd-dvn',
      code: 'COM', omschrijving: `${today.split('-').reverse().join('.')} · KanAm - Malo X · fee quote`,
      soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await page.getByRole('button', { name: 'Beheer' }).click();
  await expect(page.getByText('DVN naar Intapp')).toBeVisible();
  await page.locator('#dvn-intapp').getByRole('button', { name: 'Dossiernummer toekennen' }).click();
  await expect(page.getByText('Dossiernummer toekennen aan DVN')).toBeVisible();
  await page.locator('#dn-num').fill('304999999');
  await page.locator('#dn-name').fill('KanAm - Malo X final');
  await page.getByRole('button', { name: 'Dossiernummer opslaan' }).click();
  await expect(page.getByText('Dossiernummer toekennen aan DVN')).toBeHidden();
  await expect(page.locator('#dvn-intapp')).toContainText('Nog invoeren');
  await expect(page.locator('#dvn-intapp')).toContainText('304999999');

  await page.locator('#dvn-intapp').getByRole('button', { name: 'Markeer als ingevoerd' }).click();
  await expect(page.getByText('DVN markeren als ingevoerd')).toBeVisible();
  await page.getByRole('button', { name: 'Markeer als ingevoerd' }).click();
  await expect(page.getByText('DVN markeren als ingevoerd')).toBeHidden();
  await expect(page.locator('#dvn-intapp')).toContainText('Ingevoerd in Intapp');
});
