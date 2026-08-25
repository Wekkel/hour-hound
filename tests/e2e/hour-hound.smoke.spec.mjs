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
function previousMonday() {
  const d = new Date();
  const back = d.getDay() === 1 ? 7 : (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return ymd(d);
}

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

const i7Dossier = {
  id: 'd-i7', nummer: 'I700000000', naam: 'Indirecte uren', lang: 'nl',
  codes: [], c: 0, used: 999, isI7: true, voorlopig: false, archief: false
};

test('meldt een lopende taak van een eerdere dag en laat bewust doorlopen', async ({ page }) => {
  const today = todayLocal();
  const old = addDays(today, -1);
  const runningRule = {
    id: 'r-old-open', datum: old, start: '15:20', eind: null,
    dossierId: 'd-normal', code: null, omschrijving: 'oude lopende taak', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
  };
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000001', naam: 'Normaal dossier', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [runningRule],
    codes: baseCodes,
    meta: { running: runningRule.id }
  });

  await expect(page.locator('#oldrun')).toContainText('Lopende taak van eerdere dag');
  await expect(page.locator('#oldrun')).toContainText('Stop deze taak op de startdatum van de regel');
  await page.locator('#xr-continue').click();
  await expect(page.locator('#oldrun')).not.toHaveClass(/on/);
  await expect(page.locator('#l-who')).toContainText('Normaal dossier');
  await expect(page.locator('#l-run')).toContainText('niet doortellen naar vandaag');
});

test('wijzigt een bestaande tijdregel via de bewuste bewerkingssheet', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000002', naam: 'Bewerk dossier', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [{
      id: 'r-edit', datum: today, start: '09:00', eind: '09:30', dossierId: 'd-normal',
      code: null, omschrijving: 'oude omschrijving', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await page.locator('#tabs [data-v="dag"]').click();
  await expect(page.locator('#v-dag')).toBeVisible();
  await expect(page.locator('#d-table input[data-f="omschrijving"]')).toHaveValue('oude omschrijving');
  await expect(page.locator('#d-table input[data-f="omschrijving"]')).toHaveAttribute('readonly', '');
  await page.locator('#d-table').getByRole('button', { name: 'bewerk' }).click();
  await expect(page.locator('#editregel')).toContainText('Tijdregel bewerken');
  await page.locator('#er-oms').fill('nieuwe bewuste omschrijving');
  await page.locator('#er-save').click();
  await expect(page.locator('#editregel')).not.toHaveClass(/on/);
  await expect(page.locator('#d-table input[data-f="omschrijving"]')).toHaveValue('nieuwe bewuste omschrijving');
});

test('doorloopt DVN naar dossiernummer, Intapp en Afgehandeld', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      {
        id: 'd-dvn', nummer: null, naam: 'KanAm - Malo X', lang: 'nl', codes: [], c: 1,
        voorlopig: true, isI7: false, dvn: true
      }
    ],
    regels: [
      {
        id: 'r-dvn-a', datum: today, start: '10:00', eind: '11:00', dossierId: 'd-dvn',
        code: 'COM', omschrijving: `${today.split('-').reverse().join('.')} · KanAm - Malo X · fee quote`,
        soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
      },
      {
        id: 'r-dvn-b', datum: today, start: '11:00', eind: '11:30', dossierId: 'd-dvn',
        code: 'COM', omschrijving: `${today.split('-').reverse().join('.')} · KanAm - Malo X · conceptakte`,
        soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
      }
    ],
    codes: baseCodes,
    meta: {}
  });

  await page.locator('#tabs [data-v="beheer"]').click();
  await expect(page.locator('#dvn-intapp')).toBeVisible();
  await page.locator('#dvn-intapp').getByRole('button', { name: 'Dossiernummer toekennen' }).click();
  await expect(page.locator('#dvnnum')).toContainText('Dossiernummer toekennen aan DVN');
  await page.locator('#dn-num').fill('304999999');
  await page.locator('#dn-name').fill('KanAm - Malo X final');
  await page.locator('#dn-save').click();
  await expect(page.locator('#dvnnum')).not.toHaveClass(/on/);
  await expect(page.locator('#dvn-open')).toContainText(/nog boeken in Intapp/i);
  await expect(page.locator('#dvn-intapp')).toContainText('304999999');

  await page.locator('#tabs [data-v="week"]').click();
  await expect(page.locator('#w-prov')).toContainText('304999999');
  await expect(page.locator('#w-prov')).toContainText(/alleen-lezen/i);
  await expect(page.locator('#w-prov button')).toHaveCount(0);
  await page.locator('#tabs [data-v="beheer"]').click();

  await page.locator('#dvn-open').getByRole('button', { name: 'Boeken in Intapp' }).click();
  await expect(page.locator('#dvnpost')).toContainText('Boeken in Intapp');
  await expect(page.locator('#dp-meta')).toContainText('304999999');
  await expect(page.locator('#dp-meta')).toContainText('KanAm - Malo X final');
  await expect(page.locator('#dp-lines tbody tr')).toHaveCount(2);
  await expect(page.locator('#dp-lines')).toContainText('fee quote');
  await expect(page.locator('#dp-lines')).toContainText('conceptakte');
  await expect(page.locator('#dp-total')).toContainText('1,5 uur');
  await expect(page.locator('#dp-save')).toHaveText('Alles ingevoerd in Intapp');
  await page.locator('#dp-save').click();
  await expect(page.locator('#dvnpost')).not.toHaveClass(/on/);
  await expect(page.locator('#dvn-open [data-dvn-card="d-dvn"]')).toHaveCount(0);
  await expect(page.locator('#dvn-open')).not.toContainText('Boeken in Intapp');
  await expect(page.locator('#dvn-done')).toContainText('Afgehandeld (1)');
  await page.locator('#dvn-done > summary').click();
  await expect(page.locator('#dvn-done [data-dvn-card="d-dvn"]')).toContainText(/afgehandeld/i);
  await expect(page.locator('#dvn-done [data-dvn-card="d-dvn"]')).toContainText('2 regel(s) · 1,5 u');

  await page.locator('#tabs [data-v="dag"]').click();
  await page.locator('#d-table').getByRole('button', { name: 'bewerk' }).first().click();
  await expect(page.locator('#editregel')).toContainText(/controle nodig/i);
  await page.locator('#er-oms').fill('fee quote herzien');
  await page.locator('#er-save').click();
  await expect(page.locator('#editregel')).not.toHaveClass(/on/);
  await page.locator('#tabs [data-v="beheer"]').click();
  await expect(page.locator('#dvn-open')).toContainText(/controle nodig/i);
  await expect(page.locator('#dvn-open')).toContainText('Boeken in Intapp');
  await expect(page.locator('#dvn-done')).toHaveCount(0);
});

test('sluit een werkdag af via de sheet zonder stilzwijgend Diversen aan te vullen', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000003', naam: 'Afsluit dossier', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [{
      id: 'r-close', datum: today, start: '09:00', eind: '12:00', dossierId: 'd-normal',
      code: null, omschrijving: 'ochtendwerk', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await page.locator('#b-end').click();
  await expect(page.locator('#dayclose')).toContainText('Dag afsluiten');
  await expect(page.locator('#dc-nofill')).toBeVisible();
  await page.locator('#dc-nofill').click();
  await expect(page.locator('#dayclose')).not.toHaveClass(/on/);
  await expect(page.locator('#d-status')).toContainText(/Afgesloten/i);
});





test('afsluiten van een eerdere open dag ruimt de open-dagmelding direct op', async ({ page }) => {
  const old = addDays(todayLocal(), -1);
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000007', naam: 'Oude open dag', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [{
      id: 'r-old-day', datum: old, start: '09:00', eind: '12:00', dossierId: 'd-normal',
      code: null, omschrijving: 'oude dag', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await expect(page.locator('#open-days')).toHaveClass(/on/);
  await expect(page.locator('#open-days')).toContainText(/Nog niet afgesloten/i);
  await page.locator('#open-days [data-open-close]').click();
  await expect(page.locator('#dayclose')).toContainText('Dag afsluiten');
  await page.locator('#dc-nofill').click();
  await expect(page.locator('#dayclose')).not.toHaveClass(/on/);
  await expect(page.locator('#open-days')).not.toHaveClass(/on/);
  await expect(page.locator('#d-status')).toContainText(/Afgesloten/i);
});

test('weekendregels blijven bruikbaar zonder afsluitplicht', async ({ page }) => {
  const monday = previousMonday();
  const friday = addDays(monday, -3);
  const saturday = addDays(monday, -2);
  const sunday = addDays(monday, -1);
  const stamp = Date.now();
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-weekend', nummer: '304000008', naam: 'Weekenddossier', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [
      { id: 'r-friday', datum: friday, start: '09:00', eind: '10:00', dossierId: 'd-weekend',
        code: null, omschrijving: 'vrijdagwerk', soort: 'werk', gemaakt: stamp, gewijzigd: stamp },
      { id: 'r-saturday', datum: saturday, start: '10:00', eind: '11:00', dossierId: 'd-weekend',
        code: null, omschrijving: 'zaterdagwerk', soort: 'werk', gemaakt: stamp, gewijzigd: stamp },
      { id: 'r-sunday', datum: sunday, start: '11:00', eind: '12:00', dossierId: 'd-weekend',
        code: null, omschrijving: 'zondagwerk', soort: 'werk', gemaakt: stamp, gewijzigd: stamp }
    ],
    codes: baseCodes,
    meta: {}
  });

  await expect(page.locator('#open-days')).toHaveClass(/on/);
  await expect(page.locator('#open-days')).toContainText(friday.split('-').reverse().join('.'));
  await expect(page.locator('#open-days')).not.toContainText(/oudere dag\(en\) daarna/i);

  await page.locator('#tabs [data-v="week"]').click();
  await page.evaluate(anchor => { weekAnchor = anchor; renderWeek(); }, monday);
  await expect(page.locator(`#w-grid [data-day="${saturday}"]`)).toContainText('weekend');
  await expect(page.locator(`#w-grid [data-day="${saturday}"]`)).not.toContainText(/tot norm|norm gehaald/i);
  await page.locator(`#w-grid [data-day="${saturday}"]`).click();
  await expect(page.locator('#d-table')).toContainText('zaterdagwerk');
  await expect(page.locator('#d-status')).toContainText('Weekenddag');
  await expect(page.locator('#d-status')).toContainText('geen 8,0-uursnorm');
  await expect(page.locator('#d-status')).not.toContainText(/open eerdere werkdag|nog nodig/i);
  await expect(page.locator('#d-status [data-close-current]')).toHaveCount(0);
  await expect(page.locator('#d-fill')).not.toBeVisible();
  await page.locator('#d-table').getByRole('button', { name: 'bewerk' }).click();
  await expect(page.locator('#editregel')).toContainText('zaterdagwerk');
  await page.locator('#er-cancel').click();

  await page.locator('#tabs [data-v="week"]').click();
  await page.evaluate(anchor => { weekAnchor = anchor; renderWeek(); }, monday);
  await page.locator(`#w-grid [data-day="${sunday}"]`).click();
  await expect(page.locator('#d-table')).toContainText('zondagwerk');
  await expect(page.locator('#d-status')).toContainText('Weekenddag');
  await expect(page.locator('#d-status')).not.toContainText(/open eerdere werkdag|nog nodig/i);
});
test('auto-aanvullen vult exact het administratieve tekort tot 8,0 uur', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000005', naam: 'Aanvul dossier', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [{
      id: 'r-fill', datum: today, start: '09:00', eind: '14:54', dossierId: 'd-normal',
      code: null, omschrijving: 'inhoudelijk werk', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await page.locator('#b-end').click();
  await expect(page.locator('#dayclose')).toContainText('Dag afsluiten');
  await expect(page.locator('#dc-done')).toHaveText('5,9 u');
  await expect(page.locator('#dc-miss')).toHaveText('2,1 u');
  await expect(page.locator('#dc-help')).toContainText(/precies het ontbrekende aantal uren/i);
  await page.locator('#dc-fill').click();
  await expect(page.locator('#dayclose')).not.toHaveClass(/on/);
  await expect(page.locator('#d-table .autobadge')).toHaveCount(1);
  await expect(page.locator('#d-tot')).toHaveText('8,0');
  await expect(page.locator('#toast')).toContainText(/2,1 uur Diversen toegevoegd/i);
  await expect(page.locator('#d-table')).toContainText('admin.');
});

test('auto-aanvullen doet niets als al 8,0 uur is verantwoord', async ({ page }) => {
  const today = todayLocal();
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000006', naam: 'Volle dag', lang: 'nl', codes: [], c: 1 }
    ],
    regels: [{
      id: 'r-full', datum: today, start: '09:00', eind: '17:00', dossierId: 'd-normal',
      code: null, omschrijving: 'volle werkdag', soort: 'werk', gemaakt: Date.now(), gewijzigd: Date.now()
    }],
    codes: baseCodes,
    meta: {}
  });

  await page.locator('#b-end').click();
  await expect(page.locator('#dc-done')).toHaveText('8,0 u');
  await expect(page.locator('#dc-miss')).toHaveText('0,0 u');
  await expect(page.locator('#dc-help')).toContainText(/voegt daarom niets toe/i);
  await page.locator('#dc-fill').click();
  await expect(page.locator('#dayclose')).not.toHaveClass(/on/);
  await expect(page.locator('#d-table .autobadge')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText(/geen Diversen toegevoegd/i);
});
test('recente takenlijst toont alle taken maar alleen sneltoetsen 1-4', async ({ page }) => {
  const today = todayLocal();
  const regels = Array.from({ length: 6 }, (_, i) => ({
    id: `r-t${i}`, datum: today, start: `0${i + 1}:00`, eind: `0${i + 1}:10`,
    dossierId: 'd-normal', code: null, omschrijving: `taak ${i}`, soort: 'werk',
    gemaakt: Date.now(), gewijzigd: Date.now()
  }));
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000004', naam: 'Recente dossier', lang: 'nl', codes: [], c: 1 }
    ],
    regels,
    codes: baseCodes,
    meta: {}
  });

  await expect(page.locator('#recent button.taak')).toHaveCount(6);
  await expect(page.locator('#recent kbd')).toHaveCount(4);
  await expect(page.locator('#recent')).toHaveClass(/recent-scroll/);
});

test('DVN-nummer en Beheer-mutaties laten recente taken direct zichtbaar', async ({ page }) => {
  const today = todayLocal();
  const stamp = Date.now();
  const gewoneRegels = Array.from({ length: 4 }, (_, i) => ({
    id: `r-recent-${i}`, datum: today, start: `${pad(i + 8)}:00`, eind: `${pad(i + 8)}:20`,
    dossierId: 'd-normal', code: null, omschrijving: `recente taak ${i + 1}`, soort: 'werk',
    gemaakt: stamp, gewijzigd: stamp
  }));
  await openAndSeed(page, {
    dossiers: [
      i7Dossier,
      { id: 'd-normal', nummer: '304000009', naam: 'Gewoon recent dossier', lang: 'nl', codes: [], c: 1 },
      { id: 'd-dvn-recent', nummer: null, naam: 'Recente DVN', lang: 'nl', codes: [], c: 2,
        voorlopig: true, isI7: false, dvn: true }
    ],
    regels: gewoneRegels.concat([{
      id: 'r-recent-dvn', datum: today, start: '12:00', eind: '12:20', dossierId: 'd-dvn-recent',
      code: 'COM', omschrijving: `${today.split('-').reverse().join('.')} · Recente DVN · dvn-taak`,
      soort: 'werk', gemaakt: stamp, gewijzigd: stamp
    }]),
    codes: baseCodes,
    meta: {}
  });

  await expect(page.locator('#recent button.taak')).toHaveCount(5);
  await page.locator('#tabs [data-v="beheer"]').click();
  await page.locator('#dvn-intapp').getByRole('button', { name: 'Dossiernummer toekennen' }).click();
  await page.locator('#dn-num').fill('304999996');
  await page.locator('#dn-name').fill('Recente DVN definitief');
  await page.locator('#dn-save').click();
  await expect(page.locator('#dvnnum')).not.toHaveClass(/on/);

  const naamveld = page.locator('#b-list [data-dnm="d-normal"]');
  await naamveld.fill('Gewoon recent dossier hernoemd');
  await naamveld.press('Tab');
  await expect(page.locator('#b-list [data-dnm="d-normal"]')).toHaveValue('Gewoon recent dossier hernoemd');

  await page.locator('#tabs [data-v="nu"]').click();
  await expect(page.locator('#v-nu')).toBeVisible();
  await expect(page.locator('#recent button.taak')).toHaveCount(5);
  await expect(page.locator('#recent')).toContainText('304999996');
  await expect(page.locator('#recent')).toContainText('dvn-taak');
  for (let i = 1; i <= 4; i++) await expect(page.locator('#recent')).toContainText(`recente taak ${i}`);
  const maxHeight = await page.locator('#recent').evaluate(el => parseFloat(el.style.maxHeight) || 0);
  expect(maxHeight).toBeGreaterThan(0);
});
