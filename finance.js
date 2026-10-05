/* =====================================================================
   Finanças Pessoais
   ===================================================================== */
(function () {
  const { el, $, clear, eur, eur0, num, toast, undo, sheet, field, bar, donut, donutCard, colorsForCount, uid, todayISO, monthKey, prettyMonth, guardClick } = UI;
  const D = Domain;
  const NS = "fin";

  let viewMonth = monthKey();   // mês em análise (Resumo/Orçamentos)

  function init() {
    App.boot();
    Store.ensure(NS, { transactions: [], budgets: {}, assets: [], categoryRules: {}, nwHistory: {}, recurring: [], sources: [], categories: [], tabs: [] });
    seedFinance();
    ensureTabs();
    applyRecurring();
    App.onboard("finance", "Finanças", [
      "⇪ Importa o <b>extrato do banco</b> (CSV, Excel ou PDF) — categorias automáticas que aprendem com as tuas correções.",
      "↻ Define <b>movimentos recorrentes</b> (renda, ordenado, subscrições).",
      "🎯 <b>Orçamentos</b> com alertas e <b>Dinheiro Livre</b> do mês.",
      "✎ <b>Separadores à tua medida</b>: reordena, renomeia, esconde ou cria novos (ex: \"Carro\", \"Viagens\").",
      "🔒 <b>Privada</b>: sincroniza telemóvel ↔ PC com a tua conta e bloqueio com PIN (Definições).",
    ]);
    $("#settingsBtn").addEventListener("click", App.openSettings);
    $("#tabs").addEventListener("click", (e) => {
      if (e.target.closest(".seg-edit")) return manageTabs();
      const b = e.target.closest("button[data-tab]"); if (!b) return;
      render(b.dataset.tab);
    });
    Store.subscribe(NS, () => render(current));
    render(Store.get("sys").lastTab || "resumo");
  }

  /* ----------------------------- SEPARADORES ----------------------------- */
  // Separadores base (podem ser renomeados, reordenados e escondidos, mas não apagados)
  // e tipos personalizados que o utilizador pode criar quantas vezes quiser.
  const BUILTIN_TABS = [
    { id: "resumo", type: "resumo", name: "Resumo" },
    { id: "tx", type: "tx", name: "Movimentos" },
    { id: "budgets", type: "budgets", name: "Orçamentos" },
    { id: "savings", type: "savings", name: "Poupança" },
    { id: "net", type: "net", name: "Património" },
  ];
  const CUSTOM_TYPES = {
    filter: { label: "Movimentos filtrados", desc: "Mostra só os movimentos que escolheres (categorias, fontes, palavra na descrição) com totais e gráfico. Ex: \"Carro\", \"Casa\", \"Viagem\"." },
    notes: { label: "Notas", desc: "Uma página de texto livre: objetivos, IRS, lembretes…" },
  };
  const isBuiltin = (t) => BUILTIN_TABS.some((b) => b.id === t.id);

  function ensureTabs() {
    const have = new Set((Store.get(NS).tabs || []).map((t) => t.id));
    const missing = BUILTIN_TABS.filter((b) => !have.has(b.id));
    if (missing.length) Store.update(NS, (s) => { s.tabs = s.tabs || []; missing.forEach((b) => s.tabs.push({ ...b })); }, { silent: true, keepTime: true });
  }
  const allTabs = () => Store.get(NS).tabs || [];
  const visibleTabs = () => allTabs().filter((t) => !t.hidden);

  function drawTabs() {
    const bar = clear($("#tabs"));
    visibleTabs().forEach((t) => bar.appendChild(el("button", { "data-tab": t.id, class: t.id === current ? "active" : "", text: t.name })));
    bar.appendChild(el("button", { class: "seg-edit", title: "Organizar separadores", "aria-label": "Organizar separadores", text: "✎" }));
    const active = bar.querySelector("button.active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  let current = "resumo";
  function render(tabId) {
    const vis = visibleTabs();
    const tab = vis.find((t) => t.id === tabId) || vis[0] || BUILTIN_TABS[0];
    if (current !== tab.id) Store.update("sys", (s) => { s.lastTab = tab.id; }, { silent: true });
    current = tab.id;
    drawTabs();
    const view = clear($("#view"));
    const fn = { resumo: renderResumo, tx: renderTx, budgets: renderBudgets, savings: renderSavings, net: renderNet, filter: renderFilterTab, notes: renderNotesTab }[tab.type] || renderResumo;
    fn(view, tab);
  }

  function manageTabs() {
    const list = el("div", { class: "list" });
    function move(i, d) {
      Store.update(NS, (s) => { const j = i + d; if (j < 0 || j >= s.tabs.length) return; [s.tabs[i], s.tabs[j]] = [s.tabs[j], s.tabs[i]]; });
      drawList();
    }
    function toggleHidden(t) {
      if (!t.hidden && visibleTabs().length <= 1) return toast("Tem de ficar pelo menos um separador visível.");
      Store.update(NS, (s) => { const x = s.tabs.find((y) => y.id === t.id); if (x) x.hidden = !x.hidden; });
      drawList();
    }
    function drawList() {
      clear(list);
      allTabs().forEach((t, i, arr) => {
        const kind = isBuiltin(t) ? "Base" : (CUSTOM_TYPES[t.type] || {}).label || t.type;
        list.appendChild(el("div", { class: "item tab-item" + (t.hidden ? " is-hidden" : "") }, [
          el("div", { class: "grow", style: "cursor:pointer", onclick: () => editTab(t, sh) }, [
            el("div", { class: "t", text: t.name }),
            el("div", { class: "s", text: kind + (t.hidden ? " · escondido" : "") }),
          ]),
          el("button", { class: "btn btn-ghost btn-icon btn-sm", title: t.hidden ? "Mostrar" : "Esconder", "aria-label": t.hidden ? "Mostrar" : "Esconder", text: t.hidden ? "◌" : "◉", onclick: () => toggleHidden(t) }),
          el("button", { class: "btn btn-ghost btn-icon btn-sm", title: "Subir", "aria-label": "Subir", text: "↑", disabled: i === 0, onclick: () => move(i, -1) }),
          el("button", { class: "btn btn-ghost btn-icon btn-sm", title: "Descer", "aria-label": "Descer", text: "↓", disabled: i === arr.length - 1, onclick: () => move(i, 1) }),
        ]));
      });
    }
    drawList();
    const sh = sheet("Separadores", [
      el("p", { class: "tiny muted", text: "Toca num separador para o renomear ou editar. ◉ visível · ◌ escondido. A ordem e os separadores sincronizam entre dispositivos." }),
      list,
      el("button", { class: "btn btn-primary btn-block", text: "+ Novo separador", onclick: () => editTab(null, sh) }),
    ]);
    return sh;
  }

  function checkList(items, selected) {
    const box = el("div", { class: "checks" });
    items.forEach((name) => box.appendChild(el("label", { class: "check" }, [
      el("input", { type: "checkbox", value: name, checked: selected.includes(name) }), el("span", { text: name }),
    ])));
    box.values = () => [...box.querySelectorAll("input:checked")].map((i) => i.value);
    return box;
  }

  // parentSheet: a lista "Separadores" — é fechada e reaberta ao guardar para não empilhar folhas.
  function editTab(tab, parentSheet) {
    const isNew = !tab;
    const builtin = tab && isBuiltin(tab);
    tab = tab ? JSON.parse(JSON.stringify(tab)) : { id: "tab_" + uid(), type: "filter", name: "", categories: [], sources: [], query: "", kind: "all", period: "month" };
    const fName = field("Nome", { value: tab.name, placeholder: "ex: Carro, Viagens, Objetivos…" });
    const fType = field("Tipo", { type: "select", value: tab.type, options: Object.entries(CUSTOM_TYPES).map(([value, t]) => ({ value, label: t.label })) });
    const typeDesc = el("p", { class: "tiny muted", style: "margin:-4px 0 0" });

    const cats = catNames().sort((a, b) => a.localeCompare(b));
    const srcs = sourceNames();
    const fCats = checkList(cats, tab.categories || []);
    const fSrcs = checkList(srcs, tab.sources || []);
    const fText = field("Descrição contém (opcional)", { value: tab.query || "", placeholder: "ex: galp, ikea, ryanair" });
    const fKind = field("Mostrar", { type: "select", value: tab.kind || "all", options: [{ value: "all", label: "Despesas e receitas" }, { value: "expense", label: "Só despesas" }, { value: "income", label: "Só receitas" }] });
    const fPeriod = field("Período", { type: "select", value: tab.period || "month", options: [{ value: "month", label: "Mês a mês" }, { value: "year", label: "Ano a ano" }, { value: "all", label: "Desde sempre" }] });
    const filterBox = el("div", { class: "stack", style: "gap:12px" }, [
      el("div", { class: "section-title", text: "Categorias (nenhuma = todas)" }), fCats,
      el("div", { class: "section-title", text: "Fontes de pagamento (nenhuma = todas)" }), fSrcs,
      fText, el("div", { class: "input-row" }, [fKind, fPeriod]),
    ]);

    const sync = () => {
      const type = isNew ? fType.input.value : tab.type;
      typeDesc.textContent = (CUSTOM_TYPES[type] || {}).desc || "";
      filterBox.style.display = type === "filter" ? "" : "none";
    };
    fType.input.addEventListener("change", sync);
    sync();

    // reopen=false: fecha tudo (ex: separador acabado de criar — mostra-o logo em vez da lista)
    const back = (reopen = true) => { sh.close(); if (parentSheet) { parentSheet.close(); if (reopen) manageTabs(); } };
    const original = builtin ? BUILTIN_TABS.find((b) => b.id === tab.id).name : null;
    const sh = sheet(isNew ? "Novo separador" : builtin ? "Editar separador" : "Editar · " + ((CUSTOM_TYPES[tab.type] || {}).label || ""), [
      fName,
      isNew ? fType : null, isNew ? typeDesc : null,
      builtin ? el("p", { class: "tiny muted", text: "Separador base — podes mudar o nome ou escondê-lo, mas não apagá-lo." }) : null,
      builtin ? null : filterBox,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew && !builtin ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: async () => {
          if (!(await UI.confirm(`Apagar o separador "${tab.name}"? Os movimentos não são apagados.`, { ok: "Apagar", danger: true }))) return;
          if (current === tab.id) current = "";
          Store.update(NS, (s) => { s.tabs = s.tabs.filter((x) => x.id !== tab.id); });
          back();
        }}) : null,
        builtin && original !== tab.name ? el("button", { class: "btn btn-block", text: "Repor nome", onclick: () => { Store.update(NS, (s) => { const x = s.tabs.find((y) => y.id === tab.id); if (x) x.name = original; }); back(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const name = fName.input.value.trim(); if (!name) return toast("Dá um nome ao separador.");
          const data = { ...tab, name };
          if (isNew) data.type = fType.input.value;
          if (data.type === "filter") Object.assign(data, { categories: fCats.values(), sources: fSrcs.values(), query: fText.input.value.trim(), kind: fKind.input.value, period: fPeriod.input.value });
          Store.update(NS, (s) => { const i = s.tabs.findIndex((x) => x.id === data.id); if (i >= 0) s.tabs[i] = data; else s.tabs.push(data); });
          toast("Guardado ✓"); back(!isNew);
          if (isNew) render(data.id);
        })}),
      ]),
    ]);
  }

  /* -------- Separador personalizado: movimentos filtrados -------- */
  function matchesTab(t, tab) {
    if (t.type === "transfer") return false;
    if (tab.kind && tab.kind !== "all" && t.type !== tab.kind) return false;
    if (tab.categories && tab.categories.length && !tab.categories.includes(t.category || "Outros")) return false;
    if (tab.sources && tab.sources.length && !tab.sources.includes(t.account)) return false;
    if (tab.query) {
      const d = (t.desc || "").toLowerCase();
      const words = tab.query.toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
      if (words.length && !words.some((w) => d.includes(w))) return false;
    }
    return true;
  }

  let viewYear = String(new Date().getFullYear());
  function yearNav(onChange) {
    const shift = (d) => { viewYear = String(+viewYear + d); onChange(); };
    return el("div", { class: "row", style: "justify-content:center;gap:6px;margin-bottom:6px" }, [
      el("button", { class: "btn btn-ghost btn-sm", text: "‹", onclick: () => shift(-1) }),
      el("strong", { text: "📅 " + viewYear, style: "min-width:150px;text-align:center" }),
      el("button", { class: "btn btn-ghost btn-sm", text: "›", onclick: () => shift(1) }),
    ]);
  }

  function renderFilterTab(view, tab) {
    const fin = Store.get(NS);
    const period = tab.period || "month";
    const inPeriod = (t) => period === "all" ? true : period === "year" ? (t.date || "").slice(0, 4) === viewYear : (t.date || "").slice(0, 7) === viewMonth;
    const tx = (fin.transactions || []).filter((t) => matchesTab(t, tab) && inPeriod(t));
    const periodLabel = period === "all" ? "desde sempre" : period === "year" ? viewYear : UI.prettyMonth(viewMonth);
    let income = 0, expense = 0; const byCat = {};
    tx.forEach((t) => { if (t.type === "income") income += t.amount; else { expense += t.amount; byCat[t.category || "Outros"] = (byCat[t.category || "Outros"] || 0) + t.amount; } });
    $("#subtitle").textContent = tx.length + " movimento" + (tx.length === 1 ? "" : "s") + " · " + periodLabel;

    const kind = tab.kind || "all";
    const heroValue = kind === "income" ? income : kind === "expense" ? expense : income - expense;
    const heroLabel = kind === "income" ? "Recebido" : kind === "expense" ? "Gasto" : "Saldo";
    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: tab.name + " · " + heroLabel }),
      el("div", { class: "value", text: eur(heroValue) }),
      el("div", { class: "foot", text: kind === "all" ? `${periodLabel} · receitas ${eur0(income)} − despesas ${eur0(expense)}` : `${periodLabel} · ${tx.length} movimento${tx.length === 1 ? "" : "s"}` }),
    ]);

    const parts = [];
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    let donutC = null;
    if (cats.length > 1) {
      const colors = colorsForCount(cats.length);
      donutC = donutCard({
        title: "Despesas por categoria", parts: cats.map(([label, value], i) => ({ label, value, color: colors[i] })),
        totalValue: eur0(expense), totalLabel: "gasto",
        onOpen: (p) => showTxSheet(p.label + " · " + tab.name, tx.filter((t) => t.type === "expense" && (t.category || "Outros") === p.label)),
      });
    }

    const list = el("div", { class: "card list" });
    const sorted = [...tx].sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
    if (!sorted.length) list.appendChild(el("div", { class: "empty", text: "Nenhum movimento corresponde a este filtro neste período." }));
    sorted.slice(0, 400).forEach((t) => list.appendChild(txRow(t, true)));

    const editBtn = el("button", { class: "btn btn-ghost btn-block btn-sm", html: "⚙ Editar filtro do separador", onclick: () => editTab(tab) });
    if (period === "month") parts.push(monthNav(() => render(tab.id)));
    if (period === "year") parts.push(yearNav(() => render(tab.id)));
    parts.push(el("div", { class: "stack" }, [hero, donutC, el("strong", { text: "Movimentos" }), list, editBtn].filter(Boolean)));
    parts.forEach((p) => view.appendChild(p));
  }

  /* -------- Separador personalizado: notas -------- */
  function renderNotesTab(view, tab) {
    $("#subtitle").textContent = "Notas";
    const area = el("textarea", { class: "notes-area", placeholder: "Escreve aqui… (guarda automaticamente)" });
    area.value = tab.body || "";
    const state = el("div", { class: "tiny muted", style: "text-align:right;min-height:16px" });
    let t = null;
    area.addEventListener("input", () => {
      state.textContent = "…";
      clearTimeout(t);
      t = setTimeout(() => {
        // silent: não volta a desenhar a página (perderia o cursor), mas sincroniza na mesma
        Store.update(NS, (s) => { const x = s.tabs.find((y) => y.id === tab.id); if (x) x.body = area.value; }, { silent: true });
        state.textContent = "Guardado ✓";
      }, 600);
    });
    view.appendChild(el("div", { class: "stack" }, [
      el("div", { class: "card" }, [area, state]),
      el("button", { class: "btn btn-ghost btn-block btn-sm", html: "⚙ Renomear / apagar", onclick: () => editTab(tab) }),
    ]));
  }

  function monthNav(onChange) {
    const prev = el("button", { class: "btn btn-ghost btn-sm", text: "‹", onclick: () => shift(-1) });
    const next = el("button", { class: "btn btn-ghost btn-sm", text: "›", onclick: () => shift(1) });
    // input nativo type="month" escondido — o label funciona como botão que abre o seletor,
    // para se poder saltar direto para um mês antigo em vez de clicar em ‹ repetidamente.
    const picker = el("input", { type: "month", class: "hide", value: viewMonth });
    picker.addEventListener("change", () => { if (picker.value) { viewMonth = picker.value; onChange(); } });
    const label = el("strong", {
      text: "📅 " + prettyMonth(viewMonth), style: "min-width:150px;text-align:center;cursor:pointer",
      onclick: () => { if (picker.showPicker) picker.showPicker(); else picker.click(); },
    });
    function shift(d) {
      const [y, m] = viewMonth.split("-").map(Number);
      const dt = new Date(y, m - 1 + d, 1); viewMonth = monthKey(dt); onChange();
    }
    return el("div", { class: "row", style: "justify-content:center;gap:6px;margin-bottom:6px" }, [prev, label, next, picker]);
  }

  /* ----------------------------- RESUMO ----------------------------- */
  function monthlySeries(fin, endMk, n = 6) {
    const out = [];
    const [ey, em] = endMk.split("-").map(Number);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(ey, em - 1 - i, 1); const mk = monthKey(d);
      const s = D.financeSummary(fin, mk);
      out.push({ mk, label: UI.MONTHS[d.getMonth()].slice(0, 3), income: s.income, expense: s.expense, net: s.balance });
    }
    return out;
  }
  function dailyCumulative(fin, mk) {
    const tx = D.txInMonth(fin.transactions, mk).filter((t) => t.type === "expense");
    const days = new Date(+mk.slice(0, 4), +mk.slice(5) , 0).getDate();
    const perDay = new Array(days).fill(0);
    tx.forEach((t) => { const d = parseInt((t.date || "").slice(8, 10), 10); if (d >= 1 && d <= days) perDay[d - 1] += t.amount; });
    let acc = 0; return perDay.map((v) => (acc += v));
  }

  function renderResumo(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth, essentialSet());
    $("#subtitle").textContent = "Visão geral";

    // HERO — Dinheiro livre
    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Dinheiro livre" }),
      el("div", { class: "value", text: eur(s.free) }),
      el("div", { class: "foot", text: `${UI.prettyMonth(viewMonth)} · rend. ${eur0(s.income)} − gastos ${eur0(s.expense)} − compromissos ${eur0(s.committed)}` }),
    ]);

    const kpis = el("div", { class: "grid-2" }, [
      kpiCard("Rendimentos", eur(s.income), "var(--good)", "↑", () => showTxSheet("Rendimentos · " + UI.prettyMonth(viewMonth), D.txInMonth(fin.transactions, viewMonth).filter((t) => t.type === "income"))),
      kpiCard("Despesas", eur(s.expense), "var(--bad)", "↓", () => showTxSheet("Despesas · " + UI.prettyMonth(viewMonth), D.txInMonth(fin.transactions, viewMonth).filter((t) => t.type === "expense"))),
    ]);

    const balCard = sourceBalancesCard();

    // Evolução mensal (receitas vs despesas) — 6 meses
    const series = monthlySeries(fin, viewMonth, 6);
    const maxV = Math.max(1, ...series.map((m) => Math.max(m.income, m.expense)));
    const bars = el("div", { class: "row", style: "align-items:flex-end;gap:10px;height:120px;margin-top:14px" });
    series.forEach((m) => {
      const cur = m.mk === viewMonth;
      const col = (v, c) => el("div", { style: `flex:1;max-width:14px;height:${Math.max(3, (v / maxV) * 92)}px;border-radius:5px 5px 3px 3px;background:${c};opacity:${cur ? 1 : .55}` });
      bars.appendChild(el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end" }, [
        el("div", { class: "row", style: "gap:3px;align-items:flex-end;height:100%;width:100%;justify-content:center" }, [col(m.income, "var(--good)"), col(m.expense, "var(--bad)")]),
        el("div", { class: "tiny muted", style: "font-size:.62rem;" + (cur ? "font-weight:800;color:var(--accent)" : ""), text: m.label }),
      ]));
    });
    const trendCard = el("div", { class: "card" }, [
      el("div", { class: "row between" }, [el("strong", { text: "Evolução (6 meses)" }),
        el("div", { class: "row", style: "gap:12px" }, [el("span", { class: "tiny", html: `<span class="dot" style="background:var(--good)"></span> Receitas` }), el("span", { class: "tiny", html: `<span class="dot" style="background:var(--bad)"></span> Despesas` })])]),
      bars,
    ]);

    // Gasto acumulado no mês (linha)
    let cumCard = null;
    const cum = dailyCumulative(fin, viewMonth);
    if (cum[cum.length - 1] > 0) {
      cumCard = el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Gasto acumulado no mês" }), el("span", { class: "num", style: "font-weight:800", text: eur0(cum[cum.length - 1]) })]),
        UI.lineChart(cum, { height: 74, color: "var(--accent)", labels: ["dia 1", "dia " + cum.length] }),
      ]);
    }

    // Donut por categoria — toca numa fatia ou na legenda para ver o valor e a
    // percentagem exatos dessa categoria em vez do total.
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const catColors = colorsForCount(cats.length);
    const chartCard = donutCard({
      title: "Despesas por categoria",
      parts: cats.map(([name, value], i) => ({ label: name, value, color: catColors[i] })),
      totalValue: eur0(s.expense), totalLabel: "gasto",
      empty: '<span class="ico">🥧</span>Sem despesas neste mês. Adiciona movimentos, importa um CSV, ou muda de mês com ‹ ›.',
      onOpen: (p) => showTxSheet(p.label + " · " + UI.prettyMonth(viewMonth), D.txInMonth(fin.transactions, viewMonth).filter((t) => t.type === "expense" && (t.category || "Outros") === p.label)),
    });

    // Top despesas
    const tx = D.txInMonth(fin.transactions, viewMonth).filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 5);
    const topCard = el("div", { class: "card" }, [el("strong", { text: "Maiores gastos" })]);
    if (tx.length) { const list = el("div", { class: "list" }); tx.forEach((t) => list.appendChild(txRow(t, false))); topCard.appendChild(list); }
    else topCard.appendChild(el("div", { class: "empty tiny", text: "—" }));

    // Essenciais vs estilo de vida
    let ess = 0, life = 0;
    Object.entries(s.byCat).forEach(([c, v]) => { if (catGroup(c) === "essential") ess += v; else life += v; });
    const tot = ess + life || 1;
    const splitCard = el("div", { class: "card" }, [
      el("strong", { text: "Essenciais vs. Estilo de vida" }),
      el("div", { class: "row between", style: "margin-top:10px" }, [el("span", { class: "tiny", text: "Essenciais" }), el("span", { class: "tiny num", text: eur0(ess) + " · " + Math.round(ess / tot * 100) + "%" })]),
      barColored(ess / tot * 100, "var(--accent)"),
      el("div", { class: "row between", style: "margin-top:10px" }, [el("span", { class: "tiny", text: "Estilo de vida" }), el("span", { class: "tiny num", text: eur0(life) + " · " + Math.round(life / tot * 100) + "%" })]),
      barColored(life / tot * 100, "var(--warn)"),
    ]);

    view.appendChild(monthNav(() => render(current)));
    view.appendChild(el("div", { class: "stack" }, [hero, kpis, balCard, chartCard, splitCard, trendCard, cumCard, topCard].filter(Boolean)));
  }

  function kpiCard(k, v, color, arrow, onclick) { return el("div", { class: "card kpi pad-sm", style: onclick ? "cursor:pointer" : "", onclick: onclick || null }, [el("div", { class: "k", text: k }), el("div", { class: "v num", style: "color:" + color, text: (arrow ? arrow + " " : "") + v })]); }
  function barColored(pct, color) { const b = bar(Math.min(100, pct)); b.firstChild.style.background = color; b.style.marginTop = "6px"; return b; }

  /** Abre uma sheet com a lista de transações dadas (mais recente primeiro) — usado
   *  pelos widgets Rendimentos/Despesas e pelos gráficos circulares para mostrar os
   *  movimentos concretos por trás de um valor/categoria. */
  function showTxSheet(title, txs) {
    const sorted = [...txs].sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
    const total = sorted.reduce((a, t) => a + t.amount, 0);
    const list = el("div", { class: "list" });
    if (!sorted.length) list.appendChild(el("div", { class: "empty tiny", text: "Sem movimentos." }));
    else sorted.forEach((t) => list.appendChild(txRow(t, true)));
    sheet(title, [
      el("p", { class: "tiny muted", text: sorted.length + " movimento" + (sorted.length === 1 ? "" : "s") + " · total " + eur(total) }),
      list,
    ]);
  }

  /** Card "Saldo por método de pagamento" — quanto dinheiro há em cada fonte (dinheiro, cartões, contas…). */
  function sourceBalancesCard() {
    const fin = Store.get(NS);
    const { list, total } = D.sourceBalances(fin);
    const card = el("div", { class: "card" }, [
      el("div", { class: "row between" }, [el("strong", { text: "Saldo por método de pagamento" }), el("span", { class: "tiny muted", text: "total " + eur0(total) })]),
    ]);
    if (!list.length) { card.appendChild(el("div", { class: "empty tiny", text: "Sem fontes de pagamento ainda." })); return card; }
    const rows = el("div", { class: "list", style: "margin-top:6px" });
    list.sort((a, b) => b.balance - a.balance).forEach((src) => rows.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => { const s = (fin.sources || []).find((x) => x.name === src.name); editSource(s || null, { presetName: src.name }); } }, [
      el("div", { class: "grow t", text: src.name }),
      el("div", { class: "amt", style: "color:" + (src.balance < 0 ? "var(--bad)" : "var(--text)"), text: eur(src.balance) }),
    ])));
    card.appendChild(rows);
    card.appendChild(el("button", { class: "btn btn-ghost btn-block btn-sm", style: "margin-top:6px", html: "💳 Gerir fontes", onclick: manageSources }));
    return card;
  }

  /* ----------------------------- TRANSAÇÕES ----------------------------- */
  function renderTx(view) {
    const fin = Store.get(NS);
    $("#subtitle").textContent = fin.transactions.length + " transações";
    const search = field("Pesquisar", { placeholder: "Descrição ou categoria…" });
    const list = el("div", { class: "card list" });
    const selBar = el("div", { class: "row", style: "gap:10px;align-items:center" });

    let selectMode = false;
    let selected = new Set();
    let shown = []; // ids atualmente visíveis (após pesquisa) — para o "selecionar tudo"

    function drawBar() {
      clear(selBar);
      if (!selectMode) {
        selBar.appendChild(el("button", { class: "btn btn-ghost btn-block btn-sm", html: "☑ Selecionar", onclick: () => { selectMode = true; selected = new Set(); draw(); } }));
        return;
      }
      const allSelected = shown.length > 0 && shown.every((id) => selected.has(id));
      selBar.appendChild(el("button", { class: "btn btn-ghost btn-sm", text: allSelected ? "Limpar" : "Todos", onclick: () => { selected = allSelected ? new Set() : new Set(shown); draw(); } }));
      selBar.appendChild(el("div", { class: "grow s", style: "text-align:center;color:var(--text-soft)", text: selected.size ? selected.size + " selecionada" + (selected.size > 1 ? "s" : "") : "Toca nas transações para selecionar" }));
      selBar.appendChild(el("button", { class: "btn btn-block", style: "flex:0 0 auto;color:" + (selected.size ? "var(--bad)" : "var(--text-mute)"), text: "🗑 Apagar", disabled: !selected.size, onclick: async () => {
        if (!selected.size) return;
        const n = selected.size;
        if (!(await UI.confirm(`Apagar ${n} transaç${n > 1 ? "ões" : "ão"}? Podes anular a seguir.`, { ok: "Apagar", danger: true }))) return;
        const ids = selected;
        const snap = Store.get(NS).transactions.filter((t) => ids.has(t.id)).map((t) => JSON.parse(JSON.stringify(t)));
        // Store.update dispara Store.subscribe(NS, ...) -> render(current), que já reconstrói
        // esta vista do zero (selectMode volta a false) — não é preciso repor o estado aqui.
        Store.update(NS, (s) => { s.transactions = s.transactions.filter((t) => !ids.has(t.id)); });
        undo(`${n} transaç${n > 1 ? "ões apagadas" : "ão apagada"}`, () => Store.update(NS, (s) => { s.transactions.push(...snap); }));
      }}));
      selBar.appendChild(el("button", { class: "btn btn-ghost btn-sm", text: "Cancelar", onclick: () => { selectMode = false; selected = new Set(); draw(); } }));
    }

    function draw() {
      const q = search.input.value.toLowerCase().trim();
      clear(list);
      const tx = [...Store.get(NS).transactions]
        .filter((t) => !q || (t.desc || "").toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q))
        .sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
      shown = tx.slice(0, 400).map((t) => t.id);
      drawBar();
      if (!tx.length) { list.appendChild(el("div", { class: "empty", text: "Sem transações. Importa um CSV ou adiciona manualmente." })); return; }
      tx.slice(0, 400).forEach((t) => list.appendChild(txRow(t, true, {
        selectMode,
        checked: selected.has(t.id),
        onToggle: () => { if (selected.has(t.id)) selected.delete(t.id); else selected.add(t.id); drawBar(); const row = document.getElementById("tx-" + t.id); if (row) row.classList.toggle("on", selected.has(t.id)); },
      })));
    }
    search.input.addEventListener("input", draw); draw();

    const importInput = el("input", { type: "file", accept: ".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf", class: "hide" });
    importInput.addEventListener("change", () => {
      const f = importInput.files[0]; importInput.value = "";
      if (!f) return;
      const name = f.name.toLowerCase();
      if (name.endsWith(".pdf")) importPdf(f);
      else if (name.endsWith(".xlsx") || name.endsWith(".xls")) importExcel(f);
      else f.text().then((txt) => importCsv(txt));
    });

    view.appendChild(el("div", { class: "stack" }, [
      el("div", { class: "row", style: "gap:10px" }, [
        el("button", { class: "btn btn-soft btn-block", html: "⇪ Importar CSV/Excel/PDF", onclick: () => importInput.click() }),
        el("button", { class: "btn btn-primary btn-block", text: "+ Manual", onclick: () => editTx(null) }),
      ]),
      el("div", { class: "row", style: "gap:10px" }, [
        el("button", { class: "btn btn-ghost btn-block btn-sm", html: "↻ Recorrentes", onclick: manageRecurring }),
        el("button", { class: "btn btn-ghost btn-block btn-sm", html: "🏷️ Categorias", onclick: manageCategories }),
        el("button", { class: "btn btn-ghost btn-block btn-sm", html: "💳 Fontes", onclick: manageSources }),
      ]),
      importInput, search, selBar, list,
    ]));
  }

  function txRow(t, editable, sel) {
    const sign = t.type === "income" ? "+" : t.type === "transfer" ? "↔" : "−";
    const color = t.type === "income" ? "var(--good)" : t.type === "transfer" ? "var(--text-mute)" : "var(--text)";
    const src = t.account ? " · " + t.account : "";
    const inSelectMode = !!(sel && sel.selectMode);
    const chk = inSelectMode ? el("input", { type: "checkbox", checked: sel.checked, style: "width:20px;height:20px;flex-shrink:0", onclick: (e) => { e.stopPropagation(); sel.onToggle(); } }) : null;
    const row = el("div", { class: "item" + (inSelectMode && sel.checked ? " on" : ""), id: "tx-" + t.id, onclick: inSelectMode ? () => sel.onToggle() : null, style: inSelectMode ? "cursor:pointer" : "" }, [
      chk,
      el("div", { class: "grow", style: !inSelectMode && editable ? "cursor:pointer" : "", onclick: !inSelectMode && editable ? (e) => { e.stopPropagation(); editTx(t); } : null }, [
        el("div", { class: "t", text: t.desc || "(sem descrição)" }),
        el("div", { class: "s", html: `<span class="pill" style="padding:1px 8px">${t.category || "Outros"}</span> &nbsp;${UI.prettyDate(t.date)}${src}` }),
      ]),
      el("div", { class: "amt", style: "color:" + color, text: sign + eur(t.amount).replace("€", "") + "€" }),
    ]);
    return row;
  }

  function editTx(t) {
    const fin = Store.get(NS);
    const isNew = !t;
    t = t || { id: uid(), date: todayISO(), desc: "", amount: "", category: "Outros", type: "expense", account: sourceNames()[0] || "Dinheiro", manual: true };
    const fType = field("Tipo", { type: "select", value: t.type, options: [{ value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }, { value: "transfer", label: "Transferência (ignorada nos totais)" }] });
    const fAmount = field("Valor (€)", { type: "number", value: t.amount, inputmode: "decimal", step: "0.01" });
    const fDate = field("Data", { type: "date", value: t.date });
    const fDesc = field("Descrição", { value: t.desc, placeholder: "ex: Almoço, Ordenado…" });
    const fCat = categoryField(t.category, t.type);
    const fAcc = sourceField(t.account);
    fDesc.input.addEventListener("blur", () => {
      if (fCat.input.value && fCat.input.value !== "Outros") return;
      const guess = D.categorize(fDesc.input.value, fin.categoryRules);
      if (![...fCat.input.options].some((o) => o.value === guess)) fCat.input.insertBefore(el("option", { value: guess }, guess), fCat.input.lastElementChild);
      fCat.input.value = guess;
    });

    const catRow = el("div", { class: "row", style: "gap:8px;align-items:flex-end" }, [el("div", { style: "flex:1" }, [fCat]), el("button", { class: "btn btn-soft btn-icon", text: "⚙", title: "Gerir categorias", onclick: () => manageCategories() })]);
    const srcRow = el("div", { class: "row", style: "gap:8px;align-items:flex-end" }, [el("div", { style: "flex:1" }, [fAcc]), el("button", { class: "btn btn-soft btn-icon", text: "⚙", title: "Gerir fontes", onclick: () => manageSources() })]);
    // Só para transferências: para onde vai o dinheiro. Sem isto o saldo saía da conta de
    // origem mas não entrava em lado nenhum — era o que fazia os saldos nunca baterem certo.
    const fToAcc = sourceField(t.toAccount, "Conta destino");
    const toRow = el("div", { class: "row", style: "gap:8px;align-items:flex-end" }, [el("div", { style: "flex:1" }, [fToAcc]), el("button", { class: "btn btn-soft btn-icon", text: "⚙", title: "Gerir fontes", onclick: () => manageSources() })]);
    const updateTransferFields = () => {
      const isTransfer = fType.input.value === "transfer";
      toRow.style.display = isTransfer ? "" : "none";
      fAcc.querySelector("span").textContent = isTransfer ? "Conta de origem" : "Fonte de pagamento";
    };
    fType.input.addEventListener("change", updateTransferFields);
    updateTransferFields();

    const body = [
      fType, el("div", { class: "input-row" }, [fAmount, fDate]), fDesc, catRow, srcRow, toRow,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(t)); Store.update(NS, (s) => { s.transactions = s.transactions.filter((x) => x.id !== t.id); }); sh.close(); undo("Transação apagada", () => Store.update(NS, (s) => { s.transactions.push(snap); })); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const isTransfer = fType.input.value === "transfer";
          const toAccount = fToAcc.input.value.trim();
          if (isTransfer && (!toAccount || toAccount === fAcc.input.value.trim())) return toast("Escolhe uma conta destino diferente da origem.");
          const data = { ...t, date: fDate.input.value, desc: fDesc.input.value.trim(), amount: Math.abs(parseFloat(fAmount.input.value) || 0),
            category: fCat.input.value.trim() || "Outros", type: fType.input.value, account: fAcc.input.value.trim() || "Dinheiro",
            toAccount: isTransfer ? toAccount : null, manual: t.manual !== false };
          if (!data.amount) return toast("Indica um valor.");
          Store.update(NS, (s) => {
            const i = s.transactions.findIndex((x) => x.id === data.id); if (i >= 0) s.transactions[i] = data; else { data._c = Date.now(); s.transactions.push(data); }
            // auto-regista categoria / fontes novas
            if (data.category && !s.categories.some((c) => c.name === data.category)) s.categories.push({ name: data.category, group: data.type === "income" ? "income" : "lifestyle" });
            if (data.account && !s.sources.some((x) => x.name === data.account)) s.sources.push({ id: uid(), name: data.account });
            if (data.toAccount && !s.sources.some((x) => x.name === data.toAccount)) s.sources.push({ id: uid(), name: data.toAccount });
          });
          learnRule(data.desc, data.category);
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ];
    const sh = sheet(isNew ? "Nova transação" : "Editar transação", body);
  }

  function seedFinance() {
    const fin = Store.get(NS);
    if (fin._seededV2) return;
    Store.update(NS, (s) => {
      if (!s.sources || !s.sources.length) s.sources = ["Dinheiro", "Cartão de débito", "Cartão de crédito", "MBWay", "Conta bancária"].map((n) => ({ id: uid(), name: n }));
      if (!s.categories || !s.categories.length) {
        const mk = (arr, group) => arr.map((name) => ({ name, group }));
        s.categories = [
          ...mk(["Supermercado", "Habitação", "Contas", "Saúde", "Transportes"], "essential"),
          ...mk(["Restaurantes", "Subscrições", "Compras", "Lazer", "Levantamentos", "Outros"], "lifestyle"),
          ...mk(["Salário"], "income"),
        ];
      }
      s._seededV2 = true;
    }, { silent: true, keepTime: true });
  }
  function catNames() { const c = Store.get(NS).categories || []; const set = new Set(c.map((x) => x.name)); Store.get(NS).transactions.forEach((t) => t.category && set.add(t.category)); return [...set]; }
  function uniqueCats() { return catNames(); }
  function sourceNames() { return (Store.get(NS).sources || []).map((s) => s.name); }

  /** Campo "Fonte de pagamento" — select com as fontes existentes + opção para criar uma nova.
      Substitui o antigo input+datalist, que não abre nenhuma sugestão em Safari/iOS (bug reportado). */
  function sourceField(value, label) {
    const names = sourceNames();
    const opts = names.map((n) => ({ value: n, label: n }));
    if (value && !names.includes(value)) opts.unshift({ value, label: value });
    opts.push({ value: "__new__", label: "+ Nova fonte…" });
    const f = field(label || "Fonte de pagamento", { type: "select", value: value || names[0] || "", options: opts });
    f.input.addEventListener("change", () => {
      if (f.input.value !== "__new__") return;
      const prev = value || names[0] || "";
      quickAddSource((name) => {
        const opt = el("option", { value: name }, name);
        f.input.insertBefore(opt, f.input.lastElementChild);
        f.input.value = name;
      }, () => { f.input.value = prev; });
    });
    return f;
  }
  function quickAddSource(onDone, onCancel) {
    let saved = false;
    const fn = field("Nome da nova fonte", { placeholder: "ex: Cartão Revolut" });
    const fb = field("Saldo inicial (€, opcional)", { type: "number", inputmode: "decimal", step: "0.01" });
    const sh2 = sheet("Nova fonte de pagamento", [fn, fb, el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
      const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
      Store.update(NS, (s) => { s.sources = s.sources || []; if (!s.sources.some((x) => x.name === name)) s.sources.push({ id: uid(), name, opening: parseFloat(fb.input.value) || 0 }); });
      saved = true;
      sh2.close(); toast("Fonte criada ✓"); onDone(name);
    })})], { onClose: () => { if (!saved && onCancel) onCancel(); } });
  }
  /** Campo "Categoria" — select com as categorias existentes + opção para criar uma nova.
      Substitui o antigo input+datalist (era preciso escrever o nome à mão, sujeito a erros/duplicados). */
  function categoryField(value, txType) {
    const names = catNames();
    const opts = names.map((n) => ({ value: n, label: n }));
    if (value && !names.includes(value)) opts.unshift({ value, label: value });
    opts.push({ value: "__new__", label: "+ Nova categoria…" });
    const f = field("Categoria", { type: "select", value: value || "Outros", options: opts });
    f.input.addEventListener("change", () => {
      if (f.input.value !== "__new__") return;
      const prev = value || "Outros";
      quickAddCategory(txType === "income" ? "income" : "lifestyle", (name) => {
        const opt = el("option", { value: name }, name);
        f.input.insertBefore(opt, f.input.lastElementChild);
        f.input.value = name;
      }, () => { f.input.value = prev; });
    });
    return f;
  }
  function quickAddCategory(defaultGroup, onDone, onCancel) {
    let saved = false;
    const fn = field("Nome da nova categoria", { placeholder: "ex: Viagens" });
    const fg = field("Grupo", { type: "select", value: defaultGroup, options: [{ value: "essential", label: "Essencial" }, { value: "lifestyle", label: "Estilo de vida" }, { value: "income", label: "Receita" }] });
    const sh2 = sheet("Nova categoria", [fn, fg, el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
      const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
      Store.update(NS, (s) => { s.categories = s.categories || []; if (!s.categories.some((x) => x.name === name)) s.categories.push({ name, group: fg.input.value }); });
      saved = true;
      sh2.close(); toast("Categoria criada ✓"); onDone(name);
    })})], { onClose: () => { if (!saved && onCancel) onCancel(); } });
  }
  function essentialSet() { const c = Store.get(NS).categories || []; const s = c.filter((x) => x.group === "essential").map((x) => x.name); return s.length ? s : Domain.ESSENTIAL_CATS; }
  function catGroup(name) { const c = (Store.get(NS).categories || []).find((x) => x.name === name); return c ? c.group : (Domain.ESSENTIAL_CATS.includes(name) ? "essential" : "lifestyle"); }

  /* -------- Gestão de categorias e fontes de pagamento -------- */
  function manageCategories() {
    const fin = Store.get(NS);
    const list = el("div", { class: "list" });
    const GROUPS = { essential: "Essencial", lifestyle: "Estilo de vida", income: "Receita" };
    (fin.categories || []).forEach((c) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editCategory(c, sh) }, [
      el("div", { class: "grow" }, [el("div", { class: "t", text: c.name }), el("div", { class: "s", text: GROUPS[c.group] || c.group })]),
      el("span", { class: "pill" + (c.group === "essential" ? " on" : ""), text: GROUPS[c.group] }),
    ])));
    const sh = sheet("Categorias", [
      el("p", { class: "tiny muted", text: "Organiza as tuas despesas e receitas. 'Essencial' vs 'Estilo de vida' alimenta os gráficos." }),
      list, el("button", { class: "btn btn-primary btn-block", text: "+ Nova categoria", onclick: () => editCategory(null, sh) }),
    ]);
    return sh;
  }
  // parentSheet: sheet de onde foi aberto (a lista "Categorias"). Fechamo-lo ao guardar/apagar
  // para não empilhar folhas por cima umas das outras (bug: era preciso "andar para trás" várias vezes).
  function editCategory(c, parentSheet) {
    const isNew = !c; const old = c ? c.name : "";
    c = c || { name: "", group: "lifestyle" };
    const fn = field("Nome", { value: c.name, placeholder: "ex: Viagens" });
    const fg = field("Grupo", { type: "select", value: c.group, options: [{ value: "essential", label: "Essencial" }, { value: "lifestyle", label: "Estilo de vida" }, { value: "income", label: "Receita" }] });
    const back = () => { sh.close(); if (parentSheet) { parentSheet.close(); manageCategories(); } };
    const sh = sheet(isNew ? "Nova categoria" : "Editar categoria", [fn, fg, el("div", { class: "row", style: "gap:10px" }, [
      !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.categories = s.categories.filter((x) => x.name !== old); }); back(); } }) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
        const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
        Store.update(NS, (s) => {
          const i = s.categories.findIndex((x) => x.name === old);
          if (i >= 0) { s.categories[i] = { name, group: fg.input.value }; if (old !== name) s.transactions.forEach((t) => { if (t.category === old) t.category = name; }); }
          else if (!s.categories.some((x) => x.name === name)) s.categories.push({ name, group: fg.input.value });
        });
        back();
      })}),
    ])]);
  }
  function manageSources() {
    const fin = Store.get(NS);
    const { list: bals } = D.sourceBalances(fin);
    const balOf = (name) => { const b = bals.find((x) => x.name === name); return b ? b.balance : 0; };
    const list = el("div", { class: "list" });
    (fin.sources || []).forEach((src) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editSource(src, { parentSheet: sh }) }, [
      el("div", { class: "grow t", text: src.name }),
      el("span", { class: "tiny num", style: "color:" + (balOf(src.name) < 0 ? "var(--bad)" : "var(--text-mute)"), text: eur(balOf(src.name)) }),
    ])));
    const sh = sheet("Fontes de pagamento", [
      el("p", { class: "tiny muted", text: "Onde entra/sai o dinheiro: dinheiro, cartões, MBWay, contas…" }),
      list, el("button", { class: "btn btn-primary btn-block", text: "+ Nova fonte", onclick: () => editSource(null, { parentSheet: sh }) }),
    ]);
    return sh;
  }
  // opts.parentSheet: fecha a lista "Fontes" ao guardar/apagar em vez de empilhar uma folha nova por cima
  // (era o bug reportado: ao editar vários saldos seguidos tinhas de "andar para trás" várias vezes para sair).
  // opts.presetName: nome pré-preenchido quando aberto a partir do cartão de saldos no Resumo.
  function editSource(src, opts = {}) {
    const { presetName, parentSheet } = opts;
    const isNew = !src; const old = src ? src.name : "";
    src = src || { id: uid(), name: presetName || "", opening: 0 };
    const fn = field("Nome", { value: src.name, placeholder: "ex: Cartão Revolut" });
    const fb = field("Saldo inicial (€)", { type: "number", value: src.opening || "", inputmode: "decimal", step: "0.01" });
    const back = () => { sh.close(); if (parentSheet) { parentSheet.close(); manageSources(); } };
    const sh = sheet(isNew ? "Nova fonte" : "Editar fonte", [fn, fb, el("p", { class: "tiny muted", text: "O saldo inicial soma às receitas e subtrai às despesas registadas nesta fonte para calcular o saldo atual." }), el("div", { class: "row", style: "gap:10px" }, [
      !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.sources = s.sources.filter((x) => x.id !== src.id); }); back(); } }) : null,
      el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
        const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
        const opening = parseFloat(fb.input.value) || 0;
        Store.update(NS, (s) => { const i = s.sources.findIndex((x) => x.id === src.id); if (i >= 0) { s.sources[i].name = name; s.sources[i].opening = opening; if (old !== name) s.transactions.forEach((t) => { if (t.account === old) t.account = name; }); } else s.sources.push({ id: src.id, name, opening }); });
        back();
      }}),
    ])]);
  }

  /* ------- Categorização que aprende com as correções do utilizador ------- */
  function learnRule(desc, category) {
    if (!desc || !category || category === "Outros") return;
    const token = (desc.toLowerCase().match(/[a-zà-ú]{4,}/gi) || []).sort((a, b) => b.length - a.length)[0];
    if (!token) return;
    if (Domain.DEFAULT_RULES[token] === category) return;     // já coberto por defeito
    if (Store.get(NS).categoryRules[token] === category) return;
    Store.update(NS, (s) => { s.categoryRules = s.categoryRules || {}; s.categoryRules[token] = category; }, { silent: true });
  }

  /* ----------------------------- RECORRENTES ----------------------------- */
  function monthsFromTo(since, to) {
    const out = []; let [y, m] = since.split("-").map(Number); const [ty, tm] = to.split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 60) break; }
    return out;
  }
  function applyRecurring() {
    const fin = Store.get(NS); const rec = fin.recurring || []; if (!rec.length) return;
    const now = monthKey(); const toAdd = [];
    rec.forEach((r) => {
      if (r.active === false) return;
      const since = r.since || now;
      monthsFromTo(since, now).forEach((mk) => {
        const exists = fin.transactions.some((t) => t.recurringId === r.id && (t.date || "").slice(0, 7) === mk);
        if (!exists) {
          const day = String(Math.min(28, Math.max(1, r.day || 1))).padStart(2, "0");
          toAdd.push({ id: uid(), date: `${mk}-${day}`, desc: r.desc, amount: r.amount, type: r.type, category: r.category, account: r.account || "Recorrente", manual: true, recurringId: r.id });
        }
      });
    });
    if (!toAdd.length) return;
    Store.update(NS, (s) => { toAdd.forEach((t, i) => { t._c = Date.now() + i; s.transactions.push(t); }); });
    toast(`${toAdd.length} movimento(s) recorrente(s) lançado(s)`);
  }
  function manageRecurring() {
    const fin = Store.get(NS);
    const list = el("div", { class: "list" });
    if (!fin.recurring.length) list.appendChild(el("div", { class: "empty tiny", text: "Sem movimentos recorrentes." }));
    fin.recurring.forEach((r) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editRecurring(r, sh) }, [
      el("div", { class: "grow" }, [el("div", { class: "t", text: r.desc }), el("div", { class: "s", text: `${r.type === "income" ? "Receita" : "Despesa"} · dia ${r.day} · ${r.category}` })]),
      el("div", { class: "amt", style: r.type === "income" ? "color:var(--good)" : "", text: (r.type === "income" ? "+" : "−") + eur(r.amount).replace("€", "") + "€" }),
    ])));
    const sh = sheet("Movimentos recorrentes", [
      el("p", { class: "tiny muted", text: "Renda, ordenado, subscrições… lançados automaticamente todos os meses." }),
      list,
      el("button", { class: "btn btn-primary btn-block", text: "+ Novo recorrente", onclick: () => editRecurring(null, sh) }),
    ]);
    return sh;
  }
  // parentSheet: fecha a lista "Movimentos recorrentes" ao guardar/apagar em vez de empilhar folhas.
  function editRecurring(r, parentSheet) {
    const isNew = !r;
    r = r || { id: uid(), desc: "", amount: "", type: "expense", category: "Outros", account: "Recorrente", day: 1, active: true, since: monthKey() };
    const fType = field("Tipo", { type: "select", value: r.type, options: [{ value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }] });
    const fAmount = field("Valor (€)", { type: "number", value: r.amount, inputmode: "decimal" });
    const fDay = field("Dia do mês (1–28)", { type: "number", value: r.day, min: 1, max: 28, inputmode: "numeric" });
    const fDesc = field("Descrição", { value: r.desc, placeholder: "ex: Renda, Ordenado, Netflix…" });
    const fCat = field("Categoria", { value: r.category, list: "rcats" });
    const dl = el("datalist", { id: "rcats" }, catNames().map((c) => el("option", { value: c })));
    const fSrc = sourceField(r.account || sourceNames()[0] || "");
    const back = () => { sh.close(); if (parentSheet) { parentSheet.close(); manageRecurring(); } };
    const sh = sheet(isNew ? "Novo recorrente" : "Editar recorrente", [
      fType, el("div", { class: "input-row" }, [fAmount, fDay]), fDesc, fCat, dl, fSrc,
      el("div", { class: "row", style: "gap:10px;margin-top:8px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { Store.update(NS, (s) => { s.recurring = s.recurring.filter((x) => x.id !== r.id); }); back(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const data = { ...r, desc: fDesc.input.value.trim() || "Recorrente", amount: Math.abs(parseFloat(fAmount.input.value) || 0), type: fType.input.value, category: fCat.input.value.trim() || "Outros", account: fSrc.input.value.trim() || "Dinheiro", day: Math.min(28, Math.max(1, parseInt(fDay.input.value) || 1)) };
          if (!data.amount) return toast("Indica um valor.");
          Store.update(NS, (s) => { const i = s.recurring.findIndex((x) => x.id === data.id); if (i >= 0) s.recurring[i] = data; else s.recurring.push(data); });
          applyRecurring(); toast("Guardado ✓"); back();
        }}),
      ]),
    ]);
  }

  /* ----------------------------- IMPORTAÇÃO CSV ----------------------------- */
  function parseCSV(text) {
    // deteta delimitador
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
    const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = []; let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).replace(/\s|€|EUR/gi, "").trim();
    if (!s) return NaN;
    // sinais negativos comuns em extratos bancários: "-150,00", "150,00-", "(150,00)"
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
    if (s.startsWith("-")) { neg = true; s = s.slice(1); }
    // formato PT: 1.234,56 -> remove '.', troca ',' por '.'
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -n : n;
  }
  function parseDate(s) {
    s = String(s).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
    return null;
  }

  function importCsv(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return toast("CSV vazio ou ilegível.");
    importRows(rows);
  }

  /** Extrai as linhas (array-de-arrays) da 1ª folha de um .xlsx/.xls. */
  function importExcel(file) {
    if (typeof XLSX === "undefined") return toast("Biblioteca de Excel não carregou — verifica a ligação à internet e tenta de novo.");
    file.arrayBuffer().then((buf) => {
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c ?? "")));
      const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
      if (clean.length < 2) return toast("Ficheiro Excel vazio ou ilegível.");
      importRows(clean);
    }).catch(() => toast("Não consegui ler o ficheiro Excel."));
  }

  /** Extrai texto de um PDF (extrato bancário) e tenta reconhecer linhas de movimento
      (data + descrição + valor). Heurística "melhor esforço": funciona bem em extratos
      com texto selecionável e uma linha por movimento; não funciona em PDFs digitalizados
      (imagem) nem em layouts muito tabulares onde a linha de texto perde a ordem das colunas. */
  function importPdf(file) {
    if (typeof pdfjsLib === "undefined") return toast("Biblioteca de PDF não carregou — verifica a ligação à internet e tenta de novo.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    file.arrayBuffer().then(async (buf) => {
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const lines = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const byY = new Map();
        content.items.forEach((it) => {
          const y = Math.round(it.transform[5]);
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y).push(it);
        });
        [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
          lines.push(items.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
        });
      }
      const rows = [["Data", "Descrição", "Valor"]];
      lines.forEach((line) => { const r = parsePdfLine(line); if (r) rows.push(r); });
      if (rows.length < 2) return toast("Não encontrei movimentos reconhecíveis neste PDF (extratos digitalizados/imagem não são suportados).");
      importRows(rows);
    }).catch(() => toast("Não consegui ler o ficheiro PDF."));
  }

  function parsePdfLine(line) {
    const dm = line.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
    if (!dm) return null;
    const date = parseDate(dm[0]);
    if (!date) return null;
    const rest = line.slice(dm.index + dm[0].length);
    const amtMatches = [...rest.matchAll(/-?\d{1,3}(?:[.\s]\d{3})*,\d{2}|-?\d+\.\d{2}/g)];
    if (!amtMatches.length) return null;
    const last = amtMatches[amtMatches.length - 1];
    if (isNaN(parseNum(last[0]))) return null;
    const desc = rest.slice(0, last.index).replace(/[€\s]+$/, "").trim();
    return [date, desc, last[0]];
  }

  function importRows(rows) {
    if (rows.length < 2) return toast("Sem linhas para importar.");
    // tenta encontrar a linha de cabeçalho (a que tem palavras conhecidas)
    let headerIdx = rows.findIndex((r) => r.join(" ").toLowerCase().match(/data|date|descri|montante|valor|amount|d[eé]bito|cr[eé]dito/));
    if (headerIdx < 0) headerIdx = 0;
    const headers = rows[headerIdx].map((h) => h.trim());
    const dataRows = rows.slice(headerIdx + 1);
    const lc = headers.map((h) => h.toLowerCase());
    const find = (...keys) => { for (const k of keys) { const i = lc.findIndex((h) => h.includes(k)); if (i >= 0) return i; } return -1; };
    const guess = {
      date: find("data valor", "data mov", "data", "date"),
      desc: find("descri", "descriç", "movimento", "concept", "detalhe", "description"),
      amount: find("montante", "valor", "amount", "import"),
      debit: find("débito", "debito", "debit"),
      credit: find("crédito", "credito", "credit"),
    };

    // UI de mapeamento + pré-visualização
    const opts = [{ value: -1, label: "—" }, ...headers.map((h, i) => ({ value: i, label: h || ("Coluna " + (i + 1)) }))];
    const mDate = field("Coluna da Data", { type: "select", value: guess.date, options: opts });
    const mDesc = field("Coluna da Descrição", { type: "select", value: guess.desc, options: opts });
    const mAmount = field("Coluna do Valor (com sinal)", { type: "select", value: guess.amount, options: opts });
    const mDebit = field("Coluna Débito (opcional)", { type: "select", value: guess.debit, options: opts });
    const mCredit = field("Coluna Crédito (opcional)", { type: "select", value: guess.credit, options: opts });
    const preview = el("div", { class: "card list", style: "max-height:240px;overflow:auto" });

    function build() {
      const di = +mDate.input.value, dei = +mDesc.input.value, ai = +mAmount.input.value, dbi = +mDebit.input.value, cri = +mCredit.input.value;
      const rules = Store.get(NS).categoryRules;
      const out = [];
      dataRows.forEach((r) => {
        const date = parseDate(r[di] || "");
        const desc = (r[dei] || "").trim();
        let amount = NaN, type = "expense";
        if (ai >= 0 && !isNaN(parseNum(r[ai]))) { const v = parseNum(r[ai]); amount = Math.abs(v); type = v >= 0 ? "income" : "expense"; }
        else {
          const d = dbi >= 0 ? parseNum(r[dbi]) : NaN, c = cri >= 0 ? parseNum(r[cri]) : NaN;
          if (!isNaN(c) && c > 0) { amount = c; type = "income"; }
          else if (!isNaN(d) && d > 0) { amount = d; type = "expense"; }
        }
        if (!date || isNaN(amount) || amount === 0) return;
        out.push({ id: uid(), _c: Date.now() + out.length, date, desc, amount, type, category: type === "income" ? D.categorize(desc, rules) : D.categorize(desc, rules), account: "Banco", manual: false });
      });
      return out;
    }
    function drawPreview() {
      const out = build(); clear(preview);
      preview.appendChild(el("div", { class: "tiny muted", style: "padding:4px 2px", text: out.length + " transações detetadas" }));
      out.slice(0, 8).forEach((t) => preview.appendChild(txRow(t, false)));
      sh._out = out;
    }

    // "sh" tem de existir ANTES da 1ª chamada a drawPreview() (que lhe atribui "_out") —
    // sheet() é criado primeiro; o botão "Importar transações" só lê "sh" mais tarde,
    // dentro do próprio onclick, quando já está tudo inicializado.
    const sh = sheet("Importar extrato do banco", [
      el("p", { class: "tiny muted", text: "Confirma o mapeamento das colunas. As categorias são atribuídas automaticamente." }),
      mDate, mDesc, mAmount,
      el("details", {}, [el("summary", { class: "tiny muted", style: "cursor:pointer", text: "Banco usa colunas Débito/Crédito separadas?" }), mDebit, mCredit]),
      el("div", { class: "section-title", text: "Pré-visualização" }), preview,
      el("button", { class: "btn btn-primary btn-block", text: "Importar transações", onclick: () => {
        const out = sh._out || [];
        if (!out.length) return toast("Nada para importar — verifica o mapeamento.");
        // evita duplicados simples (mesma data+valor+descrição)
        const fin = Store.get(NS);
        const seen = new Set(fin.transactions.map((t) => t.date + "|" + t.amount + "|" + (t.desc || "").slice(0, 20)));
        const fresh = out.filter((t) => !seen.has(t.date + "|" + t.amount + "|" + (t.desc || "").slice(0, 20)));
        Store.update(NS, (s) => { s.transactions.push(...fresh); });
        sh.close(); toast(`${fresh.length} importadas` + (out.length - fresh.length ? ` · ${out.length - fresh.length} duplicadas ignoradas` : ""));
      }}),
    ]);

    [mDate, mDesc, mAmount, mDebit, mCredit].forEach((f) => f.input.addEventListener("change", drawPreview));
    drawPreview();
  }

  /* ----------------------------- ORÇAMENTOS ----------------------------- */
  function renderBudgets(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth, essentialSet());
    $("#subtitle").textContent = "Orçamentos mensais";
    const cats = new Set([...Object.keys(fin.budgets), ...Object.keys(s.byCat)]);
    const list = el("div", { class: "stack" });
    if (!cats.size) list.appendChild(el("div", { class: "card empty", text: "Define limites por categoria para acompanhares os gastos." }));
    [...cats].sort().forEach((cat) => {
      const limit = fin.budgets[cat] || 0; const spent = s.byCat[cat] || 0;
      const pct = limit ? (spent / limit) * 100 : 0;
      const tone = !limit ? "" : pct >= 100 ? "bad" : pct >= 85 ? "warn" : "good";
      const b = bar(Math.min(100, pct), tone);
      list.appendChild(el("div", { class: "card", onclick: () => setBudget(cat), style: "cursor:pointer" }, [
        el("div", { class: "row", style: "justify-content:space-between" }, [
          el("strong", { text: cat }),
          el("span", { class: "tiny num " + (pct >= 100 ? "" : "muted"), style: pct >= 100 ? "color:var(--bad);font-weight:700" : "", text: limit ? `${eur0(spent)} / ${eur0(limit)}` : eur0(spent) + " (sem limite)" }),
        ]),
        b,
        limit && pct >= 85 ? el("div", { class: "tiny", style: "margin-top:6px;color:" + (pct >= 100 ? "var(--bad)" : "var(--warn)"), text: pct >= 100 ? `⚠ Ultrapassaste em ${eur0(spent - limit)}` : `Atenção: ${Math.round(pct)}% usado` }) : null,
      ]));
    });
    view.appendChild(monthNav(() => render(current)));
    view.appendChild(el("div", { class: "stack" }, [
      el("button", { class: "btn btn-primary btn-block", text: "+ Definir limite de categoria", onclick: () => setBudget(null) }),
      list,
    ]));
  }

  function setBudget(cat) {
    const fin = Store.get(NS);
    const fCat = field("Categoria", { value: cat || "", list: "bcats" });
    const dl = el("datalist", { id: "bcats" }, uniqueCats().map((c) => el("option", { value: c })));
    const fLim = field("Limite mensal (€)", { type: "number", value: cat ? (fin.budgets[cat] || "") : "", inputmode: "decimal" });
    const sh = sheet("Limite de orçamento", [
      fCat, dl, fLim,
      el("div", { class: "row", style: "gap:10px" }, [
        cat ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Remover", onclick: () => { Store.update(NS, (s) => { delete s.budgets[cat]; }); sh.close(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const c = fCat.input.value.trim(); const v = parseFloat(fLim.input.value) || 0;
          if (!c) return toast("Indica a categoria.");
          Store.update(NS, (s) => { if (cat && cat !== c) delete s.budgets[cat]; s.budgets[c] = v; });
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ]);
  }

  /* ----------------------------- POUPANÇA ----------------------------- */
  function savingsData(fin) {
    const months = {};
    (fin.transactions || []).forEach((t) => {
      if (t.type === "transfer") return;
      const mk = (t.date || "").slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mk)) return;
      months[mk] = months[mk] || { income: 0, expense: 0 };
      if (t.type === "income") months[mk].income += t.amount; else months[mk].expense += t.amount;
    });
    const arr = Object.entries(months).map(([mk, v]) => ({ mk, save: v.income - v.expense, income: v.income, expense: v.expense })).sort((a, b) => a.mk.localeCompare(b.mk));
    const years = {}; arr.forEach((m) => { const y = m.mk.slice(0, 4); years[y] = (years[y] || 0) + m.save; });
    const total = arr.reduce((a, m) => a + m.save, 0);
    return { arr, years, total };
  }

  function renderSavings(view) {
    const fin = Store.get(NS);
    $("#subtitle").textContent = "Quanto estás a poupar";
    const { arr, years, total } = savingsData(fin);
    const curYear = String(new Date().getFullYear());
    const thisYear = years[curYear] || 0;
    const avg = arr.length ? total / arr.length : 0;

    const hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Poupança total" }),
      el("div", { class: "value", text: eur(total) }),
      el("div", { class: "foot", text: `${curYear}: ${eur0(thisYear)} · média ${eur0(avg)}/mês` }),
    ]);

    // Gráfico mensal de poupança (últimos 12) — verde/vermelho
    let chart = null;
    if (arr.length) {
      const last = arr.slice(-12);
      const maxV = Math.max(1, ...last.map((m) => Math.abs(m.save)));
      const bars = el("div", { class: "row", style: "align-items:center;gap:8px;height:120px;margin-top:12px;position:relative" });
      last.forEach((m) => {
        const h = Math.max(3, (Math.abs(m.save) / maxV) * 48);
        const up = m.save >= 0;
        bars.appendChild(el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:2px" }, [
          el("div", { style: "flex:1;display:flex;flex-direction:column;justify-content:flex-end;width:100%;align-items:center" }, [up ? el("div", { style: `width:100%;max-width:22px;height:${h}px;border-radius:5px 5px 0 0;background:var(--good)` }) : el("div", { style: "height:0" })]),
          el("div", { style: "height:1px;width:100%;background:var(--border-2)" }),
          el("div", { style: "flex:1;display:flex;flex-direction:column;justify-content:flex-start;width:100%;align-items:center" }, [!up ? el("div", { style: `width:100%;max-width:22px;height:${h}px;border-radius:0 0 5px 5px;background:var(--bad)` }) : el("div", { style: "height:0" })]),
          el("div", { class: "tiny muted", style: "font-size:.58rem", text: m.mk.slice(5) }),
        ]));
      });
      chart = el("div", { class: "card" }, [el("strong", { text: "Poupança por mês" }), bars]);
    }

    // Por ano
    const yearsCard = el("div", { class: "card" }, [el("strong", { text: "Por ano" })]);
    const ykeys = Object.keys(years).sort((a, b) => b.localeCompare(a));
    if (!ykeys.length) yearsCard.appendChild(el("div", { class: "empty tiny", text: "Sem dados ainda." }));
    else { const list = el("div", { class: "list" }); ykeys.forEach((y) => list.appendChild(el("div", { class: "item" }, [
      el("div", { class: "grow t", text: y }), el("div", { class: "amt", style: "color:" + (years[y] >= 0 ? "var(--good)" : "var(--bad)"), text: eur(years[y]) })])));
      yearsCard.appendChild(list); }

    // Donut: categorias onde gastou mais (ano atual)
    const byCat = {};
    (fin.transactions || []).forEach((t) => { if (t.type === "expense" && (t.date || "").slice(0, 4) === curYear) byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const totalExp = cats.reduce((a, c) => a + c[1], 0) || 1;
    const catColors2 = colorsForCount(cats.length);
    const catCard = donutCard({
      title: "Onde gastas mais · " + curYear,
      parts: cats.map(([name, value], i) => ({ label: name, value, color: catColors2[i] })),
      totalValue: eur0(totalExp), totalLabel: "gasto em " + curYear,
      empty: '<span class="ico">🥧</span>Sem despesas este ano ainda.',
      onOpen: (p) => showTxSheet(p.label + " · " + curYear, (fin.transactions || []).filter((t) => t.type === "expense" && (t.date || "").slice(0, 4) === curYear && (t.category || "Outros") === p.label)),
    });

    view.appendChild(el("div", { class: "stack" }, [hero, chart, catCard, yearsCard].filter(Boolean)));
  }

  /* ----------------------------- PATRIMÓNIO ----------------------------- */
  function renderNet(view) {
    const fin = Store.get(NS);
    const nw = D.netWorth(fin);
    $("#subtitle").textContent = "Património líquido";
    // snapshot do mês atual
    if ((fin.nwHistory || {})[monthKey()] !== nw.net) Store.update(NS, (s) => { s.nwHistory = s.nwHistory || {}; s.nwHistory[monthKey()] = nw.net; }, { silent: true, keepTime: true });

    const head = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Património líquido" }),
      el("div", { class: "value", text: eur(nw.net) }),
      el("div", { class: "row", style: "gap:16px;margin-top:8px" }, [
        el("span", { class: "foot", html: `● Ativos ${eur0(nw.assets)}` }),
        el("span", { class: "foot", html: `● Passivos ${eur0(nw.liab)}` }),
      ]),
    ]);

    // histórico
    const hist = Object.entries(fin.nwHistory || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    let histCard = null;
    if (hist.length >= 2) {
      const delta = hist[hist.length - 1][1] - hist[0][1];
      histCard = el("div", { class: "card" }, [
        el("div", { class: "row between" }, [el("strong", { text: "Evolução" }), el("span", { class: "tiny num", style: "color:" + (delta >= 0 ? "var(--good)" : "var(--bad)"), text: (delta >= 0 ? "+" : "") + eur0(delta) })]),
        UI.lineChart(hist.map((h) => h[1]), { labels: [UI.prettyMonth(hist[0][0]).split(" ")[0], UI.prettyMonth(hist[hist.length - 1][0]).split(" ")[0]], height: 76, color: "var(--accent)" }),
      ]);
    }

    const mk = (type, title) => {
      const items = (fin.assets || []).filter((a) => (a.type === "liability") === (type === "liability"));
      const card = el("div", { class: "card" }, [el("div", { class: "row", style: "justify-content:space-between" }, [el("strong", { text: title }), el("button", { class: "btn btn-soft btn-sm", text: "+", onclick: () => editAsset(null, type) })])]);
      if (!items.length) card.appendChild(el("div", { class: "empty tiny", text: "—" }));
      else { const list = el("div", { class: "list" }); items.forEach((a) => list.appendChild(el("div", { class: "item", style: "cursor:pointer", onclick: () => editAsset(a) }, [
        el("div", { class: "grow t", text: a.name }), el("div", { class: "amt", style: type === "liability" ? "color:var(--bad)" : "", text: eur(a.value) }),
      ]))); card.appendChild(list); }
      return card;
    };

    view.appendChild(el("div", { class: "stack" }, [head, histCard, mk("asset", "Ativos (o que tens)"), mk("liability", "Passivos (o que deves)")].filter(Boolean)));
  }

  function editAsset(a, type) {
    const isNew = !a;
    a = a || { id: uid(), name: "", value: "", type: type || "asset" };
    const fName = field("Nome", { value: a.name, placeholder: "ex: Conta à ordem, Carro, Crédito…" });
    const fVal = field("Valor (€)", { type: "number", value: a.value, inputmode: "decimal" });
    const fType = field("Tipo", { type: "select", value: a.type, options: [{ value: "asset", label: "Ativo (o que tens)" }, { value: "liability", label: "Passivo (o que deves)" }] });
    const sh = sheet(isNew ? "Novo registo" : "Editar registo", [
      fName, fVal, fType,
      el("div", { class: "row", style: "gap:10px" }, [
        !isNew ? el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Apagar", onclick: () => { const snap = JSON.parse(JSON.stringify(a)); Store.update(NS, (s) => { s.assets = s.assets.filter((x) => x.id !== a.id); }); sh.close(); undo("Registo apagado", () => Store.update(NS, (s) => { s.assets.push(snap); })); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: () => {
          const data = { ...a, name: fName.input.value.trim() || "Sem nome", value: parseFloat(fVal.input.value) || 0, type: fType.input.value };
          Store.update(NS, (s) => { s.assets = s.assets || []; const i = s.assets.findIndex((x) => x.id === data.id); if (i >= 0) s.assets[i] = data; else s.assets.push(data); });
          sh.close(); toast("Guardado ✓");
        }}),
      ]),
    ]);
  }

  window.FinanceApp = { manageTabs };
  document.addEventListener("DOMContentLoaded", init);
})();
