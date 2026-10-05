/* =====================================================================
   store.js — estado local-first
   - Namespaces: "fin" (dados, sincronizados) e "sys" (definições deste dispositivo)
   - Persiste em localStorage com prefixo próprio. Atenção: todas as páginas
     rblucas2.github.io/* partilham a mesma origem, por isso o prefixo tem de ser
     diferente do da Vida OS ("vidaos:") para não misturar dados/definições.
   - Pub/Sub para reagir a mudanças; liga-se ao sync.js quando configurado
   ===================================================================== */
(function (global) {
  const PREFIX = "financeos:";
  const LEGACY_PREFIX = "vidaos:";
  const listeners = {};       // ns -> Set(fn)
  const cache = {};           // ns -> objeto

  function key(ns) { return PREFIX + ns; }

  function load(ns) {
    if (cache[ns]) return cache[ns];
    let data = {};
    try {
      const raw = localStorage.getItem(key(ns));
      if (raw) data = JSON.parse(raw);
    } catch (e) { console.warn("store load falhou", ns, e); }
    cache[ns] = data;
    return data;
  }

  function save(ns, { silent = false, fromSync = false } = {}) {
    const data = cache[ns] || {};
    data._updatedAt = data._updatedAt || Date.now();
    try { localStorage.setItem(key(ns), JSON.stringify(data)); }
    catch (e) { console.error("store save falhou (cheio?)", e); UI && UI.toast("Erro ao guardar (armazenamento cheio?)"); }
    if (!silent) emit(ns);
    if (!fromSync && global.Sync) global.Sync.push(ns, data);
  }

  function emit(ns) {
    (listeners[ns] || []).forEach((fn) => { try { fn(cache[ns]); } catch (e) { console.error(e); } });
    (listeners["*"] || []).forEach((fn) => { try { fn(ns, cache[ns]); } catch (e) { console.error(e); } });
  }

  // ---- Tombstones (evita que a sincronização "ressuscite" itens apagados) ----
  // Para cada array de nível 1 cujos itens tenham "id" (habits, transactions, foods, …),
  // regista em data._tomb[key][id] quando um id desaparece do array. O sync.js usa isto
  // para não voltar a inserir esse item ao fazer merge com um dispositivo desatualizado.
  function snapshotIds(data) {
    const out = {};
    for (const k in data) {
      const v = data[k];
      if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "id" in x)) {
        out[k] = new Set(v.map((x) => String(x.id)));
      }
    }
    return out;
  }

  function trackTombstones(data, before) {
    for (const k in before) {
      const v = data[k];
      const afterIds = new Set(Array.isArray(v) ? v.map((x) => x && String(x.id)) : []);
      const removed = [...before[k]].filter((id) => !afterIds.has(id));
      if (removed.length) {
        data._tomb = data._tomb || {};
        data._tomb[k] = data._tomb[k] || {};
        removed.forEach((id) => { data._tomb[k][id] = Date.now(); });
      }
      if (data._tomb && data._tomb[k]) {
        // item reapareceu (ex: undo) -> deixa de estar apagado
        afterIds.forEach((id) => { if (data._tomb[k][id]) delete data._tomb[k][id]; });
      }
    }
  }

  const Store = {
    /** Lê o objeto de estado de um namespace (referência viva). */
    get(ns) { return load(ns); },

    /** Atualiza via função mutadora: Store.update('fin', s => { s.x = 1 }) */
    update(ns, mutator, opts) {
      const data = load(ns);
      const before = snapshotIds(data);
      mutator(data);
      trackTombstones(data, before);
      // keepTime: valores por defeito/derivados não contam como "alteração" — senão um
      // dispositivo acabado de instalar pareceria mais recente que os dados reais na cloud.
      data._updatedAt = opts && opts.keepTime ? (data._updatedAt || 1) : Date.now();
      save(ns, opts);
      return data;
    },

    /** Substitui o estado inteiro (usado pelo sync ao receber da cloud). */
    replace(ns, data, opts = {}) {
      cache[ns] = data || {};
      save(ns, { ...opts });
    },

    /** Garante valores por defeito sem apagar o existente. */
    ensure(ns, defaults) {
      const data = load(ns);
      let changed = false;
      for (const k in defaults) if (!(k in data)) { data[k] = defaults[k]; changed = true; }
      if (changed) { if (!data._updatedAt) data._updatedAt = 1; save(ns, { silent: true }); }
      return data;
    },

    subscribe(ns, fn) {
      (listeners[ns] = listeners[ns] || new Set()).add(fn);
      return () => listeners[ns].delete(fn);
    },

    emit,

    /** Exportar (backup manual) — só os dados, não as definições/sessão do dispositivo. */
    exportAll() {
      return { app: "finance-os", fin: load("fin"), _exportedAt: new Date().toISOString() };
    },

    /** Lê o estado de Finanças guardado pela Vida OS neste browser (mesma origem). */
    readLegacy(ns) {
      try { const raw = localStorage.getItem(LEGACY_PREFIX + ns); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    },
  };

  global.Store = Store;
})(window);
