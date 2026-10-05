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
      if (t.type === "transfer" || t.type === "adjust") return;
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

  /** Saldo por método de pagamento (fonte) num dia (por defeito, hoje): saldo inicial + receitas
      − despesas nessa fonte. Movimentos com data futura (ex: a renda já lançada para dia 28) ainda
      não contam. Uma transferência move dinheiro de "account" para "toAccount" sem ser receita/despesa
      (sem "toAccount" não mexe em nada). Um acerto de saldo (type "adjust") soma o seu valor com sinal. */
  function sourceBalances(fin, asOf = UI.todayISO()) {
    const sources = fin.sources || [];
    const balances = {};
    sources.forEach((s) => { balances[s.name] = s.opening || 0; });
    (fin.transactions || []).forEach((t) => {
      if (asOf && t.date && t.date > asOf) return;
      const acc = t.account || "Outros";
      if (t.type === "transfer") {
        if (!t.toAccount || t.toAccount === acc) return;
        balances[acc] = (balances[acc] || 0) - t.amount;
        balances[t.toAccount] = (balances[t.toAccount] || 0) + t.amount;
        return;
      }
      if (t.type === "adjust") { balances[acc] = (balances[acc] || 0) + t.amount; return; }
      balances[acc] = (balances[acc] || 0) + (t.type === "income" ? t.amount : -t.amount);
    });
    const known = new Set(sources.map((s) => s.name));
    const extra = Object.keys(balances).filter((n) => !known.has(n));
    const list = [
      ...sources.map((s) => ({ id: s.id, name: s.name, balance: balances[s.name] || 0, reconciledAt: s.reconciledAt || null })),
      ...extra.map((n) => ({ id: null, name: n, balance: balances[n], reconciledAt: null })),
    ];
    const total = list.reduce((a, x) => a + x.balance, 0);
    return { list, total };
  }

  /* ---------------- Datas ---------------- */
  const iso = (d) => UI.isoDate(d);
  const parse = (s) => new Date(s + "T00:00:00");
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  /** Mesmo dia no mês seguinte (31 jan → 28/29 fev, sem saltar para março). */
  function addMonth(s) {
    const [y, m, d] = s.split("-").map(Number);
    const dim = new Date(y, m + 1, 0).getDate();
    return iso(new Date(y, m, Math.min(d, dim)));
  }
  function shiftMonth(mk, n) { const [y, m] = mk.split("-").map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }

  /** Médias mensais dos n meses anteriores a "mk" que tenham movimentos (para comparações). */
  function avgMonthly(fin, mk, n = 3) {
    const out = { income: 0, expense: 0, byCat: {}, months: 0 };
    for (let i = 1; i <= 12 && out.months < n; i++) {
      const m = shiftMonth(mk, -i);
      const s = financeSummary(fin, m);
      if (!s.income && !s.expense) continue;
      out.months++; out.income += s.income; out.expense += s.expense;
      for (const c in s.byCat) out.byCat[c] = (out.byCat[c] || 0) + s.byCat[c];
    }
    if (out.months) { out.income /= out.months; out.expense /= out.months; for (const c in out.byCat) out.byCat[c] /= out.months; }
    return out;
  }

  /* ---------------- Subscrições ---------------- */
  /** Chave para agrupar o mesmo comerciante: sem números, pontuação, acentos e palavras de banco. */
  function normKey(desc) {
    return (desc || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\d+/g, " ").replace(/[^a-z ]+/g, " ")
      .replace(/\b(compra|compras|pagamento|pagto|pag|trf|transf|transferencia|dd|debito|direto|mb|way|mbway|com|www|pt|sa|lda|cartao|visa|ref|ldt|eu)\b/g, " ")
      .replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
  }

  /** Pagamentos que se repetem todos os meses com valor estável: subscrições detetadas nos
      movimentos (≥ 3 meses, ~1 pagamento/mês, intervalo de 24–38 dias, ativo nos últimos 45 dias)
      + os movimentos recorrentes de despesa definidos pelo utilizador. */
  function detectSubscriptions(fin, todayISO = UI.todayISO(), ignored = {}) {
    const since = shiftMonth(todayISO.slice(0, 7), -13) + "-01";
    const groups = {};
    (fin.transactions || []).forEach((t) => {
      if (t.type !== "expense" || t.recurringId || !t.date || t.date > todayISO || t.date < since) return;
      const key = normKey(t.desc);
      if (!key || key.length < 3) return;
      (groups[key] = groups[key] || []).push(t);
    });
    const out = [];
    for (const key in groups) {
      if (ignored[key]) continue;
      const list = groups[key].sort((a, b) => a.date.localeCompare(b.date));
      const months = new Set(list.map((t) => t.date.slice(0, 7)));
      if (months.size < 3 || list.length / months.size > 1.34) continue;
      // Valor estável nos pagamentos anteriores ao último (±8%; contas da casa variam mais: ±35%).
      // O último pode subir/descer até 50% — é assim que se apanham os aumentos de preço.
      const last0 = list[list.length - 1], base = list.slice(-4, -1);
      const tol = /contas|habita|seguro|agua|luz|eletric|gas/i.test(last0.category || "") ? 0.35 : 0.08;
      const sb = base.map((t) => t.amount).sort((a, b) => a - b);
      const med = sb[Math.floor(sb.length / 2)];
      if (base.some((t) => Math.abs(t.amount - med) > med * tol)) continue;
      const prev0 = list[list.length - 2];
      if (last0.amount < prev0.amount * 0.66 || last0.amount > prev0.amount * 1.5) continue;
      let gapSum = 0; for (let i = 1; i < list.length; i++) gapSum += daysBetween(list[i - 1].date, list[i].date);
      const avgGap = gapSum / (list.length - 1);
      if (avgGap < 24 || avgGap > 38) continue;
      const last = list[list.length - 1], prev = list[list.length - 2];
      if (daysBetween(last.date, todayISO) > 45) continue;
      const increase = last.amount > prev.amount * 1.02 && last.amount - prev.amount >= 0.5 ? { from: prev.amount, to: last.amount, date: last.date } : null;
      let next = addMonth(last.date); while (next <= todayISO) next = addMonth(next);
      out.push({ key, kind: "detected", name: last.desc, category: last.category || "Outros", account: last.account, monthly: last.amount,
        lastDate: last.date, nextDate: next, count: list.length, increase, history: list.map((t) => ({ id: t.id, date: t.date, amount: t.amount })) });
    }
    (fin.recurring || []).forEach((r) => {
      if (r.active === false || r.type !== "expense") return;
      const key = "rec:" + r.id; if (ignored[key]) return;
      const hist = (fin.transactions || []).filter((t) => t.recurringId === r.id && t.date <= todayISO).sort((a, b) => a.date.localeCompare(b.date));
      const day = String(Math.min(28, Math.max(1, r.day || 1))).padStart(2, "0");
      let next = todayISO.slice(0, 7) + "-" + day; if (next <= todayISO) next = addMonth(next);
      out.push({ key, kind: "recurring", recurringId: r.id, name: r.desc, category: r.category || "Outros", account: r.account, monthly: r.amount,
        lastDate: hist.length ? hist[hist.length - 1].date : null, nextDate: next, count: hist.length, increase: null, history: hist.map((t) => ({ id: t.id, date: t.date, amount: t.amount })) });
    });
    return out.sort((a, b) => b.monthly - a.monthly);
  }

  /* ---------------- Previsão ---------------- */
  /** Previsão até ao fim do mês corrente: saldo de hoje + receitas agendadas − pagamentos agendados
      (movimentos já lançados com data futura e subscrições esperadas) − gasto do dia a dia estimado
      (média diária dos últimos 90 dias, sem recorrentes nem subscrições). */
  function forecastMonth(fin, todayISO = UI.todayISO(), subs = []) {
    const mk = todayISO.slice(0, 7);
    const [y, m, d] = todayISO.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const daysLeft = dim - d;
    const balToday = sourceBalances(fin, todayISO).total;
    let schedIn = 0, schedOut = 0, spentSoFar = 0;
    txInMonth(fin.transactions, mk).forEach((t) => {
      if (t.type === "transfer" || t.type === "adjust") return;
      if (t.date > todayISO) { if (t.type === "income") schedIn += t.amount; else schedOut += t.amount; }
      else if (t.type === "expense") spentSoFar += t.amount;
    });
    const detected = subs.filter((s) => s.kind === "detected");
    let subsOut = 0;
    detected.forEach((s) => { if (s.nextDate > todayISO && s.nextDate.slice(0, 7) === mk) subsOut += s.monthly; });
    const subKeys = new Set(detected.map((s) => s.key));
    const from = addDays(todayISO, -90);
    let varSum = 0, first = null;
    (fin.transactions || []).forEach((t) => {
      if (!t.date || t.date > todayISO) return;
      if (!first || t.date < first) first = t.date;
      if (t.type !== "expense" || t.recurringId || t.date <= from || subKeys.has(normKey(t.desc))) return;
      varSum += t.amount;
    });
    const span = first ? Math.max(1, Math.min(90, daysBetween(first > from ? first : from, todayISO) + 1)) : 1;
    const daily = varSum / span;
    const estVar = daily * daysLeft;
    return { balToday, schedIn, schedOut: schedOut + subsOut, subsOut, estVar, daily, daysLeft, spentSoFar,
      end: balToday + schedIn - schedOut - subsOut - estVar,
      monthExpense: spentSoFar + schedOut + subsOut + estVar, lastDay: `${mk}-${String(dim).padStart(2, "0")}` };
  }

  /** Próximos pagamentos/recebimentos nos próximos "days" dias: movimentos já lançados com data
      futura, recorrentes de meses ainda não lançados e subscrições detetadas (estimadas). */
  function upcoming(fin, todayISO = UI.todayISO(), subs = [], days = 30) {
    const end = addDays(todayISO, days);
    const out = [];
    (fin.transactions || []).forEach((t) => {
      if ((t.type === "expense" || t.type === "income") && t.date > todayISO && t.date <= end) out.push({ date: t.date, desc: t.desc, amount: t.amount, type: t.type, category: t.category, kind: t.recurringId ? "recorrente" : "agendado", tx: t });
    });
    (fin.recurring || []).forEach((r) => {
      if (r.active === false) return;
      const day = String(Math.min(28, Math.max(1, r.day || 1))).padStart(2, "0");
      for (let mk = todayISO.slice(0, 7); mk <= end.slice(0, 7); mk = shiftMonth(mk, 1)) {
        const date = `${mk}-${day}`;
        if (date <= todayISO || date > end) continue;
        if ((fin.transactions || []).some((t) => t.recurringId === r.id && (t.date || "").slice(0, 7) === mk)) continue;
        out.push({ date, desc: r.desc, amount: r.amount, type: r.type, category: r.category, kind: "recorrente" });
      }
    });
    subs.filter((s) => s.kind === "detected").forEach((s) => {
      for (let date = s.nextDate; date <= end; date = addMonth(date)) {
        if (date > todayISO) out.push({ date, desc: s.name, amount: s.monthly, type: "expense", category: s.category, kind: "subscrição", estimated: true });
      }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function isEssential(cat) { return ESSENTIAL_CATS.includes(cat); }

  global.Domain = { DEFAULT_RULES, ESSENTIAL_CATS, categorize, financeSummary, netWorth, sourceBalances, isEssential, txInMonth,
    daysBetween, addDays, addMonth, shiftMonth, avgMonthly, normKey, detectSubscriptions, forecastMonth, upcoming };
})(window);
