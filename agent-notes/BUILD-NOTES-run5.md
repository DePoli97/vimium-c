# Build notes — run #5 (2026-06-18)

## Obiettivo del run
Dal "Prossimo passo #1" del run #4: avanzare verso la BUILD/BUNDLE completo
dell'estensione e rafforzare la validazione runtime della feature.

## Ambiente: stato di `npm install`
- `npm install` resta NON utilizzabile a pieno nel sandbox: si blocca (come nei run
  precedenti). In questo run un `timeout 40 npm install` ha però popolato ~411
  directory in `node_modules/` prima di essere interrotto. Sono SHELL incomplete:
  es. `node_modules/typescript/` esiste ma SENZA `package.json`, e `node_modules/.bin`
  è vuoto. `gulp-typescript` fallisce con "Cannot find module 'typescript'".
- Conclusione: il bundle completo via `gulp dist && make.sh` NON è producibile nel
  sandbox. Il blocco è ambientale (install), non nel nostro codice. Resta valida
  l'opzione (a)/(c) del run #4: build sul Mac di Paolo o istruzioni in DEMO.md.

## Cosa è stato prodotto comunque (avanzamento reale)
### 1. Emit REALE dell'intero progetto `content/`
Con TS 4.9.5 (scaricato come nei run precedenti) ho compilato ED EMESSO l'intero
progetto content, non solo un file:

    node /tmp/ts495/package/bin/tsc -p content/tsconfig.json \
      --outDir /tmp/emit-content --noEmit false   # EXIT 0

Risultato: 23 moduli content + 6 lib emessi senza errori. Verificato che:
- `content/hint_filters.js` esporta `hash32`, `stableFingerprint`,
  `initAlphabetEngineStable` (riga 4: export map; def alle righe ~494/524/575).
- `content/link_hints.js` contiene il cablaggio del flag in TUTTI i punti attesi:
  `let stableHints_` (l.30), assegnazione `stableHints_ = !useFilter && !!options.stableHints`
  (l.165), e i due call-site condizionali (l.145 e l.743) che scelgono
  `initAlphabetEngineStable` vs `initAlphabetEngine`.
I moduli emessi sono in formato AMD (`define([...])`), perché il tsconfig del
progetto usa `module: amd`.

### 2. Test di INTEGRAZIONE sul codice emesso (nuovo)
`agent-notes/test-emitted-hints.mjs`: a differenza di `test-stable-hints.mjs` (che
RE-IMPLEMENTA la logica), questo carica il VERO `hint_filters.js` emesso dal
compilatore dentro un contesto `vm` di Node, con uno shim AMD `define()` e stub
fedeli dei soli helper letti dalle funzioni (`htmlTag_`, `attr_s`, `textContent_s`,
`ALA`, `Lower`, `math`, `hintChars`). Esercita le funzioni SHIPPATE su DOM simulati.
Esito: 19/19 asserzioni verdi. Copre:
- hash32: vettore noto FNV-1a("")=2166136261, determinismo, sensibilità, multibyte, unsigned;
- stableFingerprint: include id/testo, normalizza href (taglia query+hash), distinzione elementi, **stabilità tra visite** (pagina ricostruita -> stessi fingerprint);
- initAlphabetEngineStable: ogni elemento riceve label unica e non vuota,
  **assegnazione identica tra visite** e **invariante all'ordine di input**
  (proprietà-chiave "no-shift": la label di un elemento non dipende dall'indice DOM).

### 3. Regressioni
- `tsc --noEmit` su tutti e 4 i tsconfig (background, content, front, pages): 0 errori.
- `test-stable-hints.mjs` (mirror): 14/14 verdi.

## Come riprodurre
    # type-check + emit
    curl -sSL -o /tmp/ts.tgz https://registry.npmjs.org/typescript/-/typescript-4.9.5.tgz
    mkdir -p /tmp/ts495 && tar -C /tmp/ts495 -xzf /tmp/ts.tgz
    cd <clone-del-branch>
    for p in background content front pages; do node /tmp/ts495/package/bin/tsc -p $p/tsconfig.json --noEmit; done
    node /tmp/ts495/package/bin/tsc -p content/tsconfig.json --outDir /tmp/emit-content --noEmit false
    # test di integrazione sul codice emesso
    EMIT_DIR=/tmp/emit-content node agent-notes/test-emitted-hints.mjs   # 19/19
    node agent-notes/test-stable-hints.mjs                                # 14/14

## Stato della feature
La correttezza dei tipi (type-check reale) E la correttezza runtime delle funzioni
emesse sono ora entrambe coperte. Manca SOLO la validazione in Chrome con il bundle
completo, che richiede l'install delle dipendenze fuori dal sandbox (Mac di Paolo).
Prossimo: scrivere DEMO.md (venerdì) con le istruzioni di build+load unpacked.
