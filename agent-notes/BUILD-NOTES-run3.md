# Note di build — run #3 (cablaggio flag stableHints)

## Cosa è stato cablato
Opzione per-comando `stableHints` (non un global setting), coerente con lo stile
delle altre opzioni di LinkHints (es. `useFilter`, `button`, `mask`).

- `typings/messages.d.ts`: aggiunto `stableHints?: boolean` nell'interfaccia Options
  (ContentOptions) accanto a `useFilter`.
- `content/link_hints.ts`:
  - import di `initAlphabetEngineStable` da `./hint_filters`.
  - nuova var di modulo `stableHints_`.
  - in `collectFrameHints`, accanto a `useFilter_ = useFilter`:
    `stableHints_ = !useFilter && !!options.stableHints`
    (attivo SOLO in modalità alfabetica, mai con il filtro).
  - call-site #1 (~252): `stableHints_ ? initAlphabetEngineStable(allHints) : initAlphabetEngine(allHints)`
  - call-site #2 (onFrameUnload, ~828): stessa scelta condizionale.

Uso da parte dell'utente (keyMappings): `map f LinkHints.activate stableHints`.
Default invariato: senza l'opzione, comportamento upstream identico.

## Verifica build in questo ambiente
- TypeScript del progetto: la pipeline reale è `gulp` + patcher TS interno
  (`scripts/dependencies.js`) che funziona solo con TS vecchi, MA il codice usa la
  sintassi `satisfies` (TS 4.9+). Nel sandbox non è disponibile una singola versione
  TS che soddisfi sia il patcher sia `satisfies`, quindi la build completa via
  `node scripts/tsc.js` non gira (errori `TS1005` su `satisfies` in MOLTI file, es.
  run_keys.ts, settings.ts, store.ts, e link_hints.ts:279/311).
- Verificato che questi errori sono PRE-ESISTENTI: stoppando le mie modifiche con
  `git stash`, gli stessi errori `satisfies` compaiono sul base pristino (solo
  shiftati di 2 righe per le mie aggiunte). Non introdotti da me.
- Check sintattico mirato con TS 5.9 (che capisce `satisfies`), tsconfig usa-e-getta
  `noLib/noResolve`: ZERO errori di sintassi (`TS1xxx`) in `hint_filters.ts` e
  `link_hints.ts`. Le mie aggiunte sono sintatticamente pulite.
- Micro-test comportamentali `agent-notes/test-stable-hints.mjs`: 14/14 verdi.

## Aperto per il prossimo run
- Build completa dell'estensione (gulp dist) NON eseguita: richiede di riconciliare
  la versione TS col patcher del progetto (provare la versione TS pinnata dal
  maintainer, controllare CI/`.github/workflows` per la versione esatta) oppure usare
  direttamente `gulp` con `gulp-typescript`. Solo allora caricare l'unpacked in Chrome.
