/* =====================================================================
   domain.js — regras de negócio puras das Finanças.
   ===================================================================== */
(function (global) {
  const monthKey = (d) => UI.monthKey(d);

  /* ---------------- FINANÇAS ---------------- */
  const DEFAULT_RULES = {
    "continente": "Supermercado", "pingo doce": "Supermercado", "lidl": "Supermercado", "auchan": "Supermercado",
    "mercadona": "Supermercado", "minipreco": "Supermercado", "intermarche": "Supermercado",
    "galp": "Transportes", "bp ": "Transportes", "repsol": "Transportes", "cepsa": "Transportes", "via verde": "Transportes",
    "cp ": "Transportes", "metro": "Transportes", "carris": "Transportes", "uber": "Transportes", "bolt": "Transportes",
    "mcdonald": "Restaurantes", "burger": "Restaurantes", "telepizza": "Restaurantes", "restaurante": "Restaurantes",
    "starbucks": "Restaurantes", "cafe": "Restaurantes", "kfc": "Restaurantes", "glovo": "Restaurantes", "uber eats": "Restaurantes",
    "edp": "Contas", "galp energia": "Contas", "meo": "Contas", "nos": "Contas", "vodafone": "Contas", "nowo": "Contas",
    "agua": "Contas", "epal": "Contas", "renda": "Habitação", "credito habitacao": "Habitação",
    "netflix": "Subscrições", "spotify": "Subscrições", "hbo": "Subscrições", "disney": "Subscrições", "amazon prime": "Subscrições",
    "fnac": "Compras", "worten": "Compras", "zara": "Compras", "primark": "Compras", "amazon": "Compras",
    "farmacia": "Saúde", "hospital": "Saúde", "clinica": "Saúde",
    "ginasio": "Saúde", "fitness": "Saúde",
    "ordenado": "Salário", "salario": "Salário", "vencimento": "Salário",
    "mbway": "Transferências", "levantamento": "Levantamentos", "atm": "Levantamentos",
  };

  const ESSENTIAL_CATS = ["Supermercado", "Habitação", "Contas", "Saúde", "Transportes"];

  function categorize(desc, rules = {}) {
    const d = (desc || "").toLowerCase();
    const all = { ...DEFAULT_RULES, ...rules };
    for (const key in all) if (d.includes(key)) return all[key];
    return "Outros";
  }

  function txInMonth(transactions, mk) {
    return (transactions || []).filter((t) => (t.date || "").slice(0, 7) === mk);
  }

  /** Resumo financeiro do mês (para a app e para o widget do Life OS).
      Transferências entre contas próprias (type === "transfer") são ignoradas. */
  function financeSummary(fin, mk = monthKey(), essentialCats) {
    const ess = (essentialCats && essentialCats.length) ? essentialCats : ESSENTIAL_CATS;
    const tx = txInMonth(fin.transactions, mk);
    let income = 0, expense = 0;
    const byCat = {};
    tx.forEach((t) => {
      if (t.type === "transfer") return;
      if (t.type === "income") income += t.amount;
      else { expense += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; }
    });
    // Compromissos = orçamento essencial ainda por gastar
    const budgets = fin.budgets || {};
    let committed = 0;
    ess.forEach((c) => {
      const lim = budgets[c] || 0; const spent = byCat[c] || 0;
      if (lim > spent) committed += lim - spent;
    });
    const free = income - expense - committed;
    return { income, expense, committed, free, byCat, count: tx.length, balance: income - expense };
  }

  function netWorth(fin) {
    let assets = 0, liab = 0;
    (fin.assets || []).forEach((a) => { if (a.type === "liability") liab += a.value; else assets += a.value; });
    return { assets, liab, net: assets - liab };
  }

  /** Saldo atual por método de pagamento (fonte): saldo inicial + receitas − despesas nessa fonte.
      Uma transferência (type "transfer") move dinheiro entre duas contas próprias sem contar
      como receita/despesa: sai de "account" e entra em "toAccount". Uma transferência sem
      "toAccount" (criada antes de existir esse campo) continua sem efeito nos saldos — tal como
      sempre foi — em vez de mexer só num lado e piorar um saldo que já podia estar calibrado. */
  function sourceBalances(fin) {
    const sources = fin.sources || [];
    const balances = {};
    sources.forEach((s) => { balances[s.name] = s.opening || 0; });
    (fin.transactions || []).forEach((t) => {
      const acc = t.account || "Outros";
      if (t.type === "transfer") {
        if (!t.toAccount || t.toAccount === acc) return;
        balances[acc] = (balances[acc] || 0) - t.amount;
        balances[t.toAccount] = (balances[t.toAccount] || 0) + t.amount;
        return;
      }
      balances[acc] = (balances[acc] || 0) + (t.type === "income" ? t.amount : -t.amount);
    });
    const known = new Set(sources.map((s) => s.name));
    const extra = Object.keys(balances).filter((n) => !known.has(n));
    const list = [
      ...sources.map((s) => ({ id: s.id, name: s.name, balance: balances[s.name] || 0 })),
      ...extra.map((n) => ({ id: null, name: n, balance: balances[n] })),
    ];
    const total = list.reduce((a, x) => a + x.balance, 0);
    return { list, total };
  }

  function isEssential(cat) { return ESSENTIAL_CATS.includes(cat); }

  global.Domain = { DEFAULT_RULES, ESSENTIAL_CATS, categorize, financeSummary, netWorth, sourceBalances, isEssential, txInMonth };
})(window);
