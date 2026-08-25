# Hour Hound test lessons learned

Deze notities horen bij de regressies die na Patch A/B/C door de Playwright-smoketests zichtbaar werden. Ze zijn bedoeld voor een volgende LLM of ontwikkelaar voordat er opnieuw aan de timer-, Dag- of DVN-code wordt gewerkt.

## 1. Groene statische tests zijn geen bewijs dat gebruikersflows werken

De eerste browserloze suite was groen, maar drie e2e-flows faalden. De oorzaak was dat de suite vooral aanwezigheid van functies en strings controleerde. Dat is nuttig als tripwire voor klassieke globals, maar het vangt geen echte DOM-volgorde, service-worker-effecten, focus/autocomplete-mutaties of timerherlaadgedrag.

Bij wijzigingen in een kernworkflow moet daarom minimaal één Playwright-flow bestaan die de zichtbare gebruikersroute uitvoert.

## 2. Geen stille timeractie over datumgrenzen

`middernachtCheck()` mag een lopende regel van een eerdere datum niet stilzwijgend sluiten. De gebruiker moet dezelfde keuze krijgen als bij app-start: stoppen op gekozen tijdstip, door laten lopen, of de taak bekijken/bewerken.

Omdat een HH-tijdregel geen einddatumveld heeft, telt een oude open regel voor berekeningen maximaal tot `23:59` van zijn eigen datum. Dat voorkomt dat maandagse tijd administratief op vrijdag terechtkomt.

## 3. Readonly UI is niet genoeg

Een veld readonly maken voorkomt niet dat bestaande `input`, `change`, `blur`, `focusin` of autocomplete-handlers nog steeds mutaties uitvoeren. Voor opgeslagen Dag-regels is het productcontract: lezen in de tabel, wijzigen alleen via de bewerksheet met expliciet opslaan.

Bij elke wijziging aan de Dag-tabel moet gecontroleerd worden dat er geen muterende inline-handler terugkomt.

## 4. DVN-status moet centraal terugvallen

Een DVN die na `Alles ingevoerd in Intapp` als afgehandeld geldt, moet naar `controle nodig` zodra een betrokken tijdregel of relevante DVN-metadata later wijzigt. Dat mag niet per knop handmatig worden onthouden. Gebruik een gedeelde helper zoals `dvnPutIfPosted()` op alle schrijfpaden.

Controleer specifiek: starten, stoppen, koppelen, live omschrijving, editor, verwijderen, opnieuw lopend maken, DVN-naam en DVN-dossiernummer.

## 5. Timerstate alleen via het timerpad

Wijzigingen aan `meta.running` en een lopende regel horen via `timerOp()`/de timertransactie te lopen. Een editor of herstelactie die buiten dat pad schrijft, kan race-achtige bugs veroorzaken met sneltoetsen, intervalchecks of openstaande debounced saves.

## 6. Playwright-locators moeten precies zijn

Losse tekstlocators waren fragiel: `Dag` kan ook in andere knoppen of tekst voorkomen, en `DVN naar Intapp` kan op meerdere plekken staan. Gebruik liever stabiele ids, `#tabs [data-v="dag"]`, modal-ids en scoped locators.

## 7. Service workers horen niet in e2e-rooktests te domineren

Voor Playwright-smoketests worden service workers geblokkeerd. Dat voorkomt dat `claim()`/reload of oude caches de test instabiel maken. De SW zelf wordt browserloos gecontroleerd op de belangrijkste invariant: testbestanden mogen niet in de cachelijst staan.

## 8. Auto-aanvullen is een totaalcorrectie, geen tijdlijnreconstructie

De eerdere implementatie zocht naar lege kloktijdvakken vóór de opgeslagen eindtijd. Dat was
conceptueel onjuist: de gebruiker kiest auto-aanvullen juist wanneer het inhoudelijke werk al
is ingevoerd en het resterende verschil tot 8,0 uur administratief als i7 ·
Praktijkorganisatie/administratie · Diversen moet worden verantwoord.

Contract vanaf Patch D:
- onder 8,0 uur: voeg exact `8,0 - verantwoord` toe;
- 8,0 uur of meer: voeg niets toe;
- bestaande regels en kloktijden worden nooit verschoven;
- de automatische regel draagt exacte handmatige uren en is herkenbaar als `autoAanvul`;
- de automatische regel mag geen overlap- of handmatige-urenwaarschuwing veroorzaken;
- UI-tekst noemt het totaal vóór de actie, de toegevoegde Diversen-tijd en het totaal erna.

Als later een echte tijdlijn voor administratieve aanvulregels wordt ontworpen, wijzig dit contract
alleen bewust en voeg eerst e2e-tests toe. Maak nooit opnieuw de mogelijkheid tot aanvullen
afhankelijk van gevonden tijdgaten.

## 9. Dagafsluitstatus heeft één leespad

Banners, de Dag-status en de afsluitsheet moeten dezelfde actuele status lezen. Gebruik
`dagSluitStatus(datum)` in plaats van op verschillende UI-plekken zelfstandig `dagEinde[datum]`
te interpreteren. Mutaties blijven via de bestaande transactiepaden lopen; de helper is de centrale
leeswaarheid. Dit voorkomt dat één UI-onderdeel na afsluiten nog een oude dag als open presenteert.

## 10. Weekendregels zijn geen open werkdagen

Zaterdag en zondag mogen tijdregels bevatten, maar hebben geen afsluitplicht en geen
8,0-uursnorm. Gebruik overal `werkdag(datum)` voor dit onderscheid: in de open-dagenbanner,
de Dag-status, de afsluitsheet, de Week-weergave en het aanvulplan. Alleen een losse
weekendcontrole in de Week-tegels is onvoldoende; dan kan dezelfde zaterdag elders alsnog als
open werkdag verschijnen of een Diversen-aanvulling aanbieden.

De Playwright-test bewaakt zowel de vrijdagwaarschuwing als de zichtbaarheid en bewerkbaarheid
van zaterdag- en zondagregels. Pas dit contract alleen aan als weekenddagen bewust verplichte
werkdagen worden.

## 11. Meet geen verborgen recente-takenlijst

`renderAll()` werkt ook globale Nu-samenvattingen bij terwijl Beheer zichtbaar is. De Nu-view
heeft dan `display:none`, waardoor `getBoundingClientRect()` voor de recente taken nul teruggeeft.
Bij meer dan vier taken kan `max-height:0px` de lijst daardoor leeg laten lijken, hoewel alle
IndexedDB-data en knoppen nog bestaan.

`renderRecent()` mag de hoogte alleen vastleggen als Nu zichtbaar is. `showTab("nu")` rendert de
lijst daarom opnieuw nadat de view actief is gemaakt. Dit is bewust zowel een meetguard als een
render-invalidation: verwijder niet één van beide zonder de Beheer→Nu-Playwright-test aan te passen.

## 12. DVN-afhandeling is een begeleide Beheer-workflow

Het echte DVN-dossiernummer wordt uitsluitend onder Beheer toegekend of aangepast. Week toont
alleen de status en mag geen alternatieve nummermutatie aanbieden. Zodra het nummer bekend is,
opent `Boeken in Intapp` een sheet met het echte dossiernummer, de dossiernaam, iedere gekoppelde
voormalige DVN-regel en het totale aantal uren.

De interne status `posted` blijft voor back-upcompatibiliteit bestaan, maar heet voor de gebruiker
`afgehandeld`. Afgehandelde DVN’s verdwijnen uit de open werkvoorraad en blijven traceerbaar in
een inklapbare groep. `dvnPutIfPosted()` zet ze bij een latere relevante wijziging terug naar
`controle nodig`. Back-upkeuring moet zowel de status als de bevestigde regel-id’s en uren bewaren.

## 13. Nu-breakdown volgt de oorspronkelijke registratiesoort

De compacte breakdown naast de Nu-samenvatting toont `Declarabel`, `i7` en tussen haakjes
`DVN`. DVN-uren tellen mee in het i7-totaal én blijven apart zichtbaar. Classificeer daarvoor
op de oorspronkelijke DVN-identiteit (`isDvn(d)`), niet op het latere Intapp-dossiernummer:
een opgeloste DVN mag nooit door de nummerkoppeling naar Declarabel verschuiven. Gebruik
`urenOf()` per tijdregel, zodat afgeronde en handmatig vastgelegde uren gelijk blijven aan de
bestaande Nu-totalen.

## 14. Definitief i7 is een terminale DVN-beslissing

Als bewust vaststaat dat een DVN geen dossiernummer krijgt, blijft de tijd `i7 · Commercieel`
maar eindigt de open DVN-lifecycle. Bewaar de oorspronkelijke DVN-identiteit en de betrokken
regel-id’s voor audit en back-up, terwijl `dvnDisposition: "final_i7"` de operationele waarheid
is. De regels verdwijnen uit de DVN-werkvoorraad, uit recente hervatacties en uit het DVN-deel
van Nu; ze blijven wel meetellen in i7 en gebruiken in de Intapp-samenvatting het gewone
i7-dossier. Voer de overgang transactioneel uit en blokkeer hem zolang een betrokken regel loopt.

## 15. Tijdelijk geblokkeerd dossier is geen DVN en geen boekstatus

Een gewone dossierregel met een bestaand nummer kan pas tijdens handmatige invoer tijdelijk
onboekbaar blijken. Na bevestigde invoer op `i7 · Commercieel` hoort die regel daarom in de
aparte store `overboekingen`: niet in DVN-metadata en niet in `meta.geboekt`. De dagwizard telt
zo'n regel wel als behandeld en toont afzonderlijk geboekt, geparkeerd en open.

De wachtrij heeft precies twee eindroutes. Bij `Op dossier geboekt · afhandelen` verandert alleen
de wachtrijstatus; er ontstaat geen nieuwe HH-tijdregel en de eerdere i7-boeking in Intapp blijft
staan. Bij `Naar definitief i7` worden de oorspronkelijke HH-bronregels transactioneel werkelijk
naar het hoofd-i7-dossier met werkcode Commercieel verplaatst. Wijzigingen aan bronregels of
doeldossiermetadata moeten eerst zichtbaar worden als `Gewijzigd — controleren`; overschrijf de
opgeslagen herkenningsgegevens nooit stilzwijgend. Backupversie 9 bewaart de hele wachtrij.

## 16. Een terminale overboeking heeft blijvende, inhoudsgebonden status

De bevestiging `Op dossier geboekt · afhandelen` mag de werkvoorraad niet alleen verbergen. De
oorspronkelijke dag moet daarna ook na herladen als `geboekt` blijven gelden, anders vraagt de
gewone Intapp-wizard dezelfde uren opnieuw in te voeren. Bewaar daarom de actuele
Intapp-vingerafdrukken tegelijk met de terminale wachtrijstatus en de gewone boekstatus, in één
transactie. De terminale historie is aanvullend van belang wanneer oude boekstatusdagen later uit
`meta.geboekt` worden opgeruimd. Een vingerafdruk kan door veel bron-id's langer dan 4.000 tekens
zijn; importkeuring moet hem volledig bewaren en mag hem niet als gewone vrije tekst afkappen.

Die herkenning blijft bewust inhoudsgebonden: wijzigt een bronregel of de afrondingsmodus, dan moet
de oude vingerafdruk niet meer passen en verschijnt de gewijzigde tijd opnieuw als open. Zolang een
overboeking nog wacht, mag een bronregel niet worden verwijderd; zonder die bron is de latere
dossierboeking niet meer betrouwbaar te reconstrueren.

Ten slotte vormt iedere open of terminale overboekingslifecycle een aggregatiegrens. Nieuw werk met
dezelfde dossiergegevens en omschrijving mag niet met al geparkeerde of afgehandelde uren
samensmelten. De grens hoort alleen in de groepeeridentiteit: parkeren zelf mag de inhoudsvingerafdruk
van de bestaande groep niet veranderen. De browserloze test bewaakt beide kanten van dit contract.

## 17. Modulariseer achter één compatibiliteitsnaad

Hour Hound blijft klassieke scripts gebruiken. Nieuwe pure domeinbestanden worden daarom eerst
onder `window.HH` geregistreerd en vóór hun bestaande consumenten geladen. Tijdelijke globale
compatibiliteitsnamen moeten rechtstreeks naar die ene implementatie verwijzen; kopieer helpers
niet naar twee bestanden. Directe moduletests bewaken de nieuwe grens, terwijl de bestaande
regressies dezelfde productie-uitkomsten blijven controleren.

Een modulariseringspatch mag geen lokale-data-upgrade verstoppen. De overgang vanaf oudere
installaties blijft dezelfde IndexedDB-database openen en voegt stores alleen conditioneel toe.
Oude DVN-dossiers met `voorlopig: true` blijven zonder recordconversie DVN en hun tijdregels
blijven via hetzelfde `dossierId` gekoppeld. Nieuwe runtimebestanden vereisen wel exacte extra
cachepaden in `sw.js`; de eigenaar voegt die toe en verhoogt zelf de cacheversie.

## 18. Boekingsberekeningen krijgen alle context expliciet

Uren, dagtotalen, tijdgaten, dagvalidatie en Intapp-aggregatie mogen niet afhankelijk zijn van
verborgen globals of van een helper die pas in een later UI-script wordt geladen. De pure
boekingslaag ontvangt daarom lopende timer-id, huidige datum en tijd, dagafsluiting,
afrondingsmodus, dossierresolutie en overboekingsgrens als invoer. `core.js` en `views.js` houden
alleen dunne adapters die de actuele runtimecontext verzamelen.

Deze scheiding is gedragsneutraal. Bewaak bij iedere vervolgstap in het bijzonder:

- groepsafronding versus afronding per losse regel;
- handmatige uren en een werkelijk lopende timer;
- exacte normalisatie en sorteervolgorde van Intapp-vingerafdrukken;
- de lifecycle-id die geparkeerde of afgehandelde bronuren van nieuw identiek werk scheidt;
- overlap-, toekomst-, code- en 24-uursvalidatie;
- oude regels met `gewijzigd: 0` en lange groepen bron-id's.

Vaste voorbeelden alleen zijn onvoldoende voor deze kern. Vergelijk bij een refactor ook veel
deterministisch gegenereerde regelsets rechtstreeks tussen de oude en nieuwe implementatie.

## 19. Administratieve status is data, presentatie is tekst

DVN- en overboekingsstatussen worden voortaan in pure domeinfuncties bepaald. Die functies krijgen
dossiers, regels, vingerafdrukken en tijdstempels expliciet mee. Ze lezen geen globale arrays,
tonen geen UI en schrijven niets. De bestaande globale namen blijven adapters, zodat timer-,
Beheer-, Dag- en Intapp-workflows in deze refactor niet veranderen.

Houd de volgende scheiding vast:

- DVN-statuscodes zijn `missing`, `ready`, `posted`, `needs_check` en `final_i7`;
- bij overboekingen blijven alleen `waiting`, `done` en `final_i7` opgeslagen;
- `needs_check` bij een overboeking wordt telkens afgeleid uit bronregels, dossiermetadata en
  Intapp-vingerafdrukken en is geen vierde opgeslagen eindstatus;
- `done` en `final_i7` zijn terminaal en mogen niet opnieuw worden geopend;
- wijzigingsdetectie levert stabiele interne codes; Nederlandse gebruikerslabels en details worden
  pas in de presentatieadapter samengesteld;
- oude Patch H-records met alleen `sourceFingerprint` blijven herkenbaar;
- auditfuncties ontvangen hun klokwaarden expliciet, zodat pure tests geen echte klok nodig hebben.

Een refactor van deze statuslogica vereist directe vergelijking met de vorige productiecode, naast
gerichte tests voor ontbrekende bronregels, gewijzigd dossiernummer, resolved DVN, definitief i7,
posted-terugval en beide terminale overboekingsroutes.

## 20. Eén opslaggrens, maar de use-case bezit de transactie

IndexedDB openen, schema-upgrades en de generieke transactie-afhandeling horen op één plek. Houd
databasenaam `hourhound`, versie 4, stores, key paths en indices letterlijk stabiel: een
modulariseringspatch is geen datamigratie. Kleine repositories voor regels, dossiers,
configuratiemeta en overboekingen mogen hun eigen store kennen, maar geen UI, workflowtekst of
runtime-array.

Een repositorycall is niet automatisch een veilige workflow. Timerwissels, volledig terugzetten,
samenvoegen en andere handelingen die meerdere stores raken moeten één transactie blijven. Splits
zo'n handeling nooit op in achtereenvolgende repositorywrites; een fout halverwege zou dan een
gedeeltelijke gebruikersactie bewaren.

Boot en herladen lezen één consistente snapshot over alle relevante stores. Vervang runtime-state
pas nadat de volledige readonly transactie is voltooid. Losse opeenvolgende `getAll()`-aanroepen
kunnen bij een fout een half nieuwe, half oude geheugenstate achterlaten. Foutinjectietests horen
daarom niet alleen de afwijzing te controleren, maar ook dat de oude geheugenwaarden intact blijven.

De oude globale helpers (`tx`, `getAll`, `get`, `put`, `putK`, `del` en `replaceAll`) zijn tijdens
de gefaseerde refactor uitsluitend compatibiliteitsadapters. Voeg daar geen tweede schema- of
transactie-implementatie aan toe; verwijder ze pas wanneer alle productieconsumenten zijn gemigreerd.

## 21. Een administratieve service bezit validatie én transactie

Een knop of sheet mag invoer verzamelen, bevestiging vragen en het resultaat presenteren, maar mag
niet tegelijk de statusmachine en IndexedDB-transactie uitvoeren. DVN-nummer, posted, definitief i7
en de vier overboekingsmutaties hebben daarom elk een expliciete servicefunctie. De UI verwerkt pas
na een geslaagde servicecall de geretourneerde dossiers, regels, stack, boekstatus en wachtrijrecords.

Valideer in de service opnieuw. Tussen het openen van een sheet en de bevestiging kunnen een andere
tab, een uitgestelde regelwrite of een timeractie de brondata hebben veranderd. Controleer daarom
de actuele bronregel-id’s, dossiercategorie, dossiernummer, lopende timer, verplichte code en
afgeleide overboekingsstatus vlak vóór schrijven. Een UI-check blijft nuttig voor snelle feedback,
maar is nooit de veiligheidsgrens.

Houd deze lifecyclecontracten bijeen:

- een DVN blijft intern DVN nadat een echt dossiernummer is toegekend;
- een nummerwijziging na `posted` wordt `needs_check` met audit;
- definitief i7 archiveert de DVN, bewaart betrokken regel-id’s en dwingt Commercieel af;
- parkeren bewaart bronregels, bronversies, afrondingsmodus en inhoudsfingerprints;
- gewijzigde brondata kan niet rechtstreeks naar `done`, maar moet eerst bewust worden ververst;
- dossierafhandeling schrijft alleen `overboekingen` en `meta.geboekt`; zij raakt de regels en de
  eerdere handmatige i7-boeking niet;
- omzetting naar definitief i7 wijzigt regels, wachtrij en boekstatus in één transactie;
- `done` en `final_i7` blijven terminaal.

Geef services geen DOM, `confirm`, `toast` of Nederlandse validatiemeldingen. Laat ze stabiele
foutcodes retourneren en houd de vertaling naar gebruikerstekst in de presentatieadapter. Dat maakt
foutinjectie mogelijk zonder de UI na te bouwen en voorkomt dat opslagfouten al zichtbare
geheugenmutaties achterlaten.

## 22. Dagmetadata en tijdregels vormen samen één mutatiegrens

Een Dag-actie schrijft vaak meer dan de zichtbare regel. Afsluiten kan tegelijk een lopende regel
stoppen en `running`, `stack`, `dagEinde` en `dagAudit` wijzigen. Heropenen kan dageinde en audit
wijzigen én automatische regels verwijderen. Auto-aanvullen schrijft een herkenbare regel en een
audit-event. Deze writes mogen niet over losse UI-handlers of transacties worden verdeeld.

Laat daarom de dag-/regelservice de actuele toestand opnieuw valideren en één volledige transactie
bezitten. De UI mag een regelkopie voorbereiden en een keuze bevestigen, maar werkt geheugen pas bij
na succes. Geef de service tijd, datum, ids en timestamps expliciet; een service die zelf de DOM,
`Date.now()` of een globale timer leest is niet betrouwbaar browserloos te testen.

Administratieve gevolgen horen bij dezelfde mutatie. Bepaal in de service of een regel automatisch,
geboekt, posted-DVN of geparkeerd is. Een posted DVN gaat atomair naar `needs_check`; een open
geparkeerde bronregel blijft tegen verwijderen beschermd. Houd undo semantisch gescheiden: zuivere
recordwijzigingen leveren gegevens-undo, maar een actie die `meta.running` verandert levert
timer-undo of maakt oudere timer-undo bewust ongeldig.

Gebruik voor dagstatus steeds hetzelfde paar `dagEinde` en `dagAudit`. Als afsluiten, heropenen,
banner, Dag-tab en audit ieder een eigen afleiding maken, kan het scherm na één succesvolle write
zichzelf tegenspreken. Een service-resultaat retourneert daarom beide nieuwe metadataobjecten samen.

## 23. De timerketting bezit ook de verwachte pointer

Alleen transacties centraliseren is niet genoeg voor een timer. Twee vrijwel gelijktijdige acties
kunnen allebei dezelfde oude runtimepointer hebben gelezen. De eerste kan al duurzaam zijn
opgeslagen terwijl haar UI-effecten nog niet zijn toegepast; zonder extra bewaking zou de tweede
dan eveneens slagen en een onverwachte open regel achterlaten.

Laat TimerService daarom zowel de ene Promise-ketting als de laatst succesvol opgeslagen
`running`-ID bezitten. Iedere opdracht bevriest de timer-ID die de aanroeper verwacht en wordt bij
uitvoering geweigerd wanneer die niet meer overeenkomt met de servicepointer. Werk die pointer pas
bij nadat de volledige IndexedDB-transactie is geslaagd. Bij een writefout blijven zowel de
servicepointer als het runtimegeheugen onveranderd.

Maak alle timerinvoer expliciet: huidige timer, klok, ids, regels, dossiers, stack, dagmetadata en
eventuele uitgestelde regelwrites. De service retourneert kopieën en geheugeneffecten; de UI toont
meldingen en rendert pas na succes. Dag-/regelacties die `meta.running` kunnen raken moeten door
dezelfde ketting om de dagregelservice heen lopen, anders ontstaan alsnog twee timer-eigenaren.

Een oude timer is geen technisch foutgeval dat automatisch gerepareerd mag worden. Inspectie en
`door laten lopen` schrijven niets; stoppen vereist een expliciete keuze. Meerdere open regels zijn
wel een invariantconflict, maar ook daar mag opstartcode niets stilzwijgend afsluiten. Blokkeer de
ketting en laat alleen een expliciet, gevalideerd herstelbesluit de betrokken regels en pointer in
één transactie vervangen.

## 24. Test klassieke UI-entrypoints na domeinextractie

Bij het verplaatsen van logica naar een pure domeinlaag blijven klassieke scripts vaak een oude
globale helpernaam aanroepen. Een syntaxcheck en een pure domeintest zien dat niet: de fout ontstaat
pas wanneer de gebruiker de specifieke UI-route opent. Na de booking-extractie verwees de DVN-wizard
nog naar `normOms`, terwijl de implementatie alleen nog als `normalizeDescription` in het domein
bestond.

Hetzelfde geldt voor kleine aggregatieadapters. `Dag` renderde de losse regels wel, maar brak vóór
de Intapp-samenvatting omdat `simIntappTotaal` nergens meer was gedefinieerd. Een test moet daarom
niet alleen controleren dat een functie in de bron voorkomt, maar haar aanroepen met representatieve
runtimegegevens en het zichtbare resultaat controleren. Compatibiliteitsnamen mogen terugkomen als
dunne adapters naar de ene domeinimplementatie; duplicatie van de berekening blijft verboden.
