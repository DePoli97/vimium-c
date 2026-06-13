# Design: etichette hint deterministiche per Vimium C

Stato: ricerca completata, design proposto. Nessuna modifica al codice upstream ancora.
Run: #1 (2026-06-13). Autore: agente OSS di Paolo Deidda.

## 1. Come funzionano oggi gli hint (mappa del codice)

Flusso, file `content/link_hints.ts` (funzione interna attorno a riga 285-294):

1. `getVisibleElements(view)` (in `content/local_links.ts:792`) raccoglie gli elementi
   cliccabili visibili e li restituisce come array ordinato `readonly Hint[]`.
   Un `Hint` è una tupla: `[element, rect, clickType, ...]` (vedi `createHint`).
2. `elements.map(createHint)` (in `content/hint_filters.ts:31`) crea un `HintItem` per
   ciascun elemento. Campi rilevanti del HintItem:
   - `d`: il DOM element di origine (link[0]).
   - `a`: la stringa-etichetta in modalità alfabetica (es. "JK"). VUOTA all'inizio.
   - `m`: il marker (span) renderizzato a schermo.
   - `i`, `h`, `r`: stato interno / testo per il filtro.
3. A seconda della modalità:
   - modalità **filter** (`useFilter_`): `initFilterEngine` + `generateHintText`
     (etichette numeriche + testo del link, per ricerca testuale).
   - modalità **alfabetica** (default qui): `initAlphabetEngine(allHints)`
     (`content/hint_filters.ts:431`).

## 2. Perché le etichette cambiano tra una visita e l'altra

`initAlphabetEngine` assegna le stringhe SOLO in base alla **posizione `i`**
dell'elemento nell'array `hintItems`:

- calcola un insieme di "numeri-hint" a lunghezza minima per `count` elementi,
  li **ordina numericamente** (`.sort((i,j) => i-j)`),
- e poi fa `hintItems[i].a = hintString` per `i = 0..count-1`.

Quindi l'etichetta dell'elemento dipende esclusivamente dal suo indice nella lista.
Se la pagina cambia anche di poco (un link in più/in meno, un riordino del DOM,
contenuto dinamico, A/B test, banner), gli indici slittano e **tutte** le etichette
da quel punto in poi cambiano. L'utente non può memorizzare "questo bottone è sempre JK".

`getVisibleElements` ordina per posizione/scoperta nel DOM, non per identità stabile
dell'elemento: è la radice della non-determinismo percepito.

## 3. Feature proposta: assegnazione deterministica (dietro opzione)

Obiettivo: lo stesso elemento sulla stessa pagina riceve quasi sempre la stessa
etichetta tra visite diverse, senza cambiare il comportamento di default.

### 3.1 Fingerprint stabile dell'elemento
Funzione `stableFingerprint(el: SafeHTMLElement): string` che concatena, in ordine
fisso, caratteristiche stabili e poco volatili:

- `tagName`
- `id` (se presente: fortissimo segnale di stabilità)
- per i link: `href` normalizzato (origin+pathname, senza query/hash volatili)
- `name` / `type` / `role` / `aria-label` se presenti
- testo visibile normalizzato e troncato (es. primi 32 char, trim, lowercase)
- un "DOM path" leggero: catena tag + indice-tra-fratelli-dello-stesso-tag dei
  primi ~4 antenati (`div>nav>ul>li>a` con nth-of-type). NON usare classi generate
  a runtime (spesso hashate da bundler -> instabili).

Il fingerprint NON deve includere il rect/posizione assoluta (cambia con lo scroll
e il layout responsive).

### 3.2 Da fingerprint a etichetta
1. Generare l'insieme di etichette candidate **identico a oggi** (stessa lunghezza
   minima, stesso alfabeto `hintChars`) -> riusa la logica numerica di
   `initAlphabetEngine`, ma NON assegnarle per indice.
2. Per ogni elemento: `h = hash32(stableFingerprint(el))` (es. FNV-1a, deterministico,
   nessuna dipendenza). `slot = h % labelPool.length`.
3. Risoluzione collisioni **deterministica**: linear probing ordinato sul pool
   (slot, slot+1, ... mod N) finché si trova un'etichetta libera. L'ordine di
   assegnazione tra elementi in collisione è deciso da un criterio stabile
   (es. fingerprint stesso come tie-break), NON dall'indice di scoperta DOM.
4. Fallback: se per qualunque motivo restano elementi senza slot (non dovrebbe,
   pool>=count), assegnare con l'algoritmo per-indice attuale.

Risultato: aggiungere/togliere un link altrove nella pagina non sposta l'etichetta
degli altri elementi (cambia solo in caso di collisione diretta su quel poche slot).

### 3.3 Opzione di configurazione
- Nuova chiave booleana in `settings-template.json`, default `false`
  (es. `"stableHintLabels": false`), così il default upstream è invariato.
- In `link_hints.ts`, leggere l'opzione e, se attiva e siamo in modalità alfabetica
  (non-filter), chiamare la nuova `initAlphabetEngineStable(allHints)` invece di
  `initAlphabetEngine(allHints)` (riga ~251 e ~826).
- La modalità filter resta invariata in questa prima iterazione (etichette guidate
  dal testo, problema meno sentito).

## 4. Punti di estensione individuati (dove toccare il codice)
- `content/hint_filters.ts`: aggiungere `initAlphabetEngineStable` accanto a
  `initAlphabetEngine` (riusa la generazione del pool, cambia solo l'assegnazione).
  Aggiungere helper `stableFingerprint` + `hash32` (puri, testabili in isolamento).
- `content/link_hints.ts`: due call-site (riga ~251 e ~826) dietro il flag.
- `settings-template.json`: nuova opzione default false.
- Eventuale i18n/descrizione opzione nelle pages/options (da verificare al passo UI).

## 5. Rischi / questioni aperte
- **Filtri bundler/terser**: il progetto usa build aggressiva con costanti `Build.*`.
  La nuova funzione va scritta nello stile esistente (niente API DOM costose nel
  loop, attenzione a `OnChrome`/`Build.MinCVer`). Da verificare i vincoli in
  `gulpfile.js`/`tsconfig`.
- **Costo runtime**: il fingerprint legge testo + antenati per ogni hint. Su pagine
  con migliaia di link può pesare. Mitigazione: troncare il testo, limitare la
  profondità del path, calcolare lazy.
- **Determinismo cross-sessione vero**: con contenuto molto dinamico (feed infiniti)
  il determinismo è "best effort", non garantito. Da comunicare nella DEMO.
- **Issue/PR upstream esistenti**: da controllare SOLO in lettura se la feature è
  già stata proposta/rifiutata (prossimo passo, vincolo MISSION: nessun commento).
- **API GitHub bloccata**: in questo ambiente `api.github.com` è irraggiungibile via
  proxy, quindi il fork DePoli97/vimium-c NON ha potuto essere creato via API e il
  push sul fork è bloccato. Vedi LOG per dettagli e azione richiesta a Paolo.

## 6. Prossimo passo consigliato
1. Controllare in lettura le issue/PR upstream su "stable/persistent hint labels".
2. Implementare `hash32` + `stableFingerprint` come funzioni pure con piccoli test.
3. Aggiungere `initAlphabetEngineStable` e il flag, build locale, verifica.
