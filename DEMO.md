# DEMO - Hint label deterministici (stableHints) per Vimium C

Branch: `feat/deterministic-hints` sul fork `DePoli97/vimium-c`.
Questa guida ti fa buildare l'estensione sul tuo Mac, caricarla in Chrome e
verificare che le etichette degli hint (`f`) restino STABILI tra un reload e
l'altro della stessa pagina.

## Cosa fa la feature
Di default Vimium C assegna le etichette degli hint in base all'ordine degli
elementi: basta un link in piu o in meno e tutte le etichette slittano, quindi
non puoi memorizzare "su questo sito quel bottone e sempre JK".
Con l'opzione `stableHints` l'etichetta di ogni elemento viene derivata da un
fingerprint stabile dell'elemento (tag, id, href normalizzato, testo, percorso
DOM leggero) tramite hash con risoluzione deterministica delle collisioni. Lo
stesso elemento sulla stessa pagina riceve quasi sempre la stessa etichetta tra
visite diverse. Il comportamento di default resta INVARIATO: la feature si
attiva solo se la abiliti esplicitamente, e solo in modalita alfabetica (non con
il filtro di testo).

## Prerequisiti
- macOS con Node.js 14+ e npm 7+ (`node -v`, `npm -v`).
- Google Chrome (o Chromium / Edge).
- Il fork clonato in locale.

## 1. Clona il branch
```bash
git clone --branch feat/deterministic-hints https://github.com/DePoli97/vimium-c.git
cd vimium-c
```

## 2. Installa le dipendenze e builda
```bash
npm install
npm run chrome
```
`npm run chrome` esegue `gulp dist` e poi `scripts/make.sh`: compila e minimizza
i file nella cartella `dist/`.

Se preferisci una build non minimizzata, piu rapida da iterare:
```bash
npm install
npm run debug   # gulp local2: compila i file in place
```
In questo caso la cartella da caricare in Chrome e la radice del progetto (dove
sta `manifest.json` generato), non `dist/`.

Nota: se `npm install` o la build danno problemi, segui la sezione "Building" del
README ufficiale del progetto (`npm install typescript`, `npm install pngjs`,
`node scripts/tsc`).

## 3. Carica l'estensione unpacked in Chrome
1. Apri `chrome://extensions`.
2. Attiva "Developer mode" (in alto a destra).
3. Click su "Load unpacked".
4. Seleziona la cartella `dist/` (build con `npm run chrome`) oppure la radice
   del progetto (build con `npm run debug`).
5. Vimium C compare nella lista delle estensioni.

## 4. Abilita stableHints
`stableHints` e un'opzione PER-COMANDO della mappatura di `LinkHints.activate`.
1. Apri le opzioni di Vimium C (icona estensione -> Options, oppure
   `chrome-extension://<id>/pages/options.html`).
2. Nel campo delle custom key mappings aggiungi:
   ```
   map f LinkHints.activate stableHints
   ```
   (Mantiene `f` come tasto, ma attiva il motore deterministico.)
3. Salva. Se vuoi confrontare, puoi mappare un secondo tasto al comportamento
   classico, es:
   ```
   map F LinkHints.activate
   ```
   Cosi `f` usa le etichette stabili e `F` quelle classiche.

## 5. Verifica le etichette stabili
1. Vai su una pagina con molti link (es. la home di un sito di news o GitHub).
2. Premi `f`: osserva l'etichetta su 2-3 elementi che riconosci (es. il logo, un
   bottone preciso). Annota le etichette.
3. Premi `Esc`, ricarica la pagina (`Cmd+R`) e premi di nuovo `f`.
4. ATTESO: gli stessi elementi mostrano le STESSE etichette del passo 2.
5. Confronto col default: premi `F` (mapping classico), ricarica, ripremi `F`:
   se la pagina e cambiata leggermente (es. un contenuto in piu), con il default
   le etichette tendono a slittare, mentre con `f` (stableHints) restano ancorate
   all'elemento.

Test piu netto della proprieta "no-shift": apri una pagina, premi `f` e nota
l'etichetta di un elemento in fondo; poi vai su una variante della pagina che ha
un link in PIU all'inizio (o usa la console per inserirne uno) e ripremi `f`:
con stableHints l'etichetta dell'elemento in fondo non cambia, con il default si.

## Note e limiti noti
- Prima iterazione: solo modalita alfabetica. Con il filtro di testo
  (`useFilter`) la feature non si attiva, per scelta (lo dichiariamo nel wiring:
  `stableHints_ = !useFilter && !!options.stableHints`).
- La stabilita e "quasi sempre": se l'elemento cambia molto (id/href/testo/
  posizione nel DOM diversi) il fingerprint cambia e quindi anche l'etichetta.
- Su pagine con migliaia di link c'e un piccolo costo di calcolo del fingerprint
  (mitigato da testo troncato e DOM-path a 4 livelli). Vedi
  `agent-notes/DESIGN-deterministic-hints.md` sezione 5.
- Per elementi antenati non-HTML (es. SVG) il percorso DOM usa solo l'indice di
  posizione, non il tag: irrilevante per i link/bottoni HTML comuni.

## Verifica tecnica gia eseguita dall'agente (senza Chrome)
- Type-check del progetto con TypeScript 4.9.5 su tutti e 4 i sotto-progetti
  (`background`, `content`, `front`, `pages`): 0 errori.
- Emit reale del progetto `content`: `hint_filters.js` contiene `hash32`,
  `stableFingerprint`, `initAlphabetEngineStable`.
- Test di integrazione sul codice REALE emesso
  (`agent-notes/test-emitted-hints.mjs`): 19/19.
- Test mirror della logica pura (`agent-notes/test-stable-hints.mjs`): 14/14.

Quello che manca e SOLO la prova end-to-end in Chrome con il bundle completo, che
nel sandbox dell'agente non e producibile (npm install incompleto): questa demo
serve esattamente a coprire quel passo sul tuo Mac.
