/* =====================================================================
   Finanças Pessoais
   ===================================================================== */
(function () {
  const { el, $, clear, eur, toast, undo, sheet, field, bar, colorsForCount, uid, todayISO, monthKey, prettyMonth, guardClick } = UI;
  const D = Domain;
  const NS = "fin";

  let viewMonth = monthKey();   // mês em análise (Resumo/Orçamentos)

  function init() {
    App.boot();
    Store.ensure(NS, { transactions: [], budgets: {}, assets: [], categoryRules: {}, nwHistory: {}, recurring: [], sources: [], categories: [], tabs: [] });
    seedFinance();
    ensureTabs();
    applyRecurring();
    App.onboard("finance", "Bem-vindo às tuas Finanças", [
      "⇪ Importa o <b>extrato do banco</b> (CSV, Excel ou PDF) — as categorias aprendem com as tuas correções.",
      "↻ Define <b>movimentos recorrentes</b> (renda, ordenado, subscrições).",
      "🎯 <b>Orçamentos</b> com alertas e <b>Dinheiro livre</b> do mês.",
      "✎ <b>Separadores à tua medida</b>: reordena, renomeia, esconde ou cria novos (ex: \"Carro\", \"Viagens\").",
      "🔒 <b>Privada</b>: sincroniza telemóvel ↔ PC com a tua conta, e bloqueio com PIN (Definições).",
    ]);
    $("#tabs").addEventListener("click", (e) => {
      if (e.target.closest(".seg-edit")) return manageTabs();
      const b = e.target.closest("button[data-tab]"); if (!b) return;
      render(b.dataset.tab);
    });
    $(".brand").addEventListener("click", (e) => { e.preventDefault(); const first = visibleTabs()[0]; if (first) render(first.id); });
    Store.subscribe(NS, () => render(current));
    render(Store.get("sys").lastTab || "resumo");
  }

  /* ----------------------------- SEPARADORES ----------------------------- */
  // Separadores base (podem ser renomeados, reordenados e escondidos, mas não apagados)
  // e tipos personalizados que o utilizador pode criar quantas vezes quiser.
  const BUILTIN_TABS = [
    { id: "resumo", type: "resumo", name: "Resumo" },
    { id: "tx", type: "tx", name: "Movimentos" },
    { id: "cats", type: "cats", name: "Categorias" },
    { id: "budgets", type: "budgets", name: "Orçamentos" },
    { id: "savings", type: "savings", name: "Poupança" },
    { id: "net", type: "net", name: "Património" },
  ];
  const CUSTOM_TYPES = {
    filter: { label: "Movimentos filtrados", desc: "Mostra só os movimentos que escolheres (categorias, fontes, palavra na descrição) com totais e gráfico. Ex: \"Carro\", \"Casa\", \"Viagem\"." },
    notes: { label: "Notas", desc: "Uma página de texto livre: objetivos, IRS, lembretes…" },
  };
  const isBuiltin = (t) => BUILTIN_TABS.some((b) => b.id === t.id);

  /** Garante que os separadores base existem. Um separador base novo (ex: "Categorias")
   *  entra logo a seguir ao separador base que o antecede, sem mexer na ordem do utilizador. */
  function ensureTabs() {
    const have = new Set((Store.get(NS).tabs || []).map((t) => t.id));
    const missing = BUILTIN_TABS.filter((b) => !have.has(b.id));
    if (!missing.length) return;
    Store.update(NS, (s) => {
      s.tabs = s.tabs || [];
      missing.forEach((b) => {
        const bi = BUILTIN_TABS.indexOf(b);
        let at = s.tabs.length;
        for (let j = bi - 1; j >= 0; j--) { const k = s.tabs.findIndex((t) => t.id === BUILTIN_TABS[j].id); if (k >= 0) { at = k + 1; break; } }
        if (bi === 0) at = 0;
        s.tabs.splice(at, 0, { ...b });
      });
    }, { silent: true, keepTime: true });
  }
  const allTabs = () => Store.get(NS).tabs || [];
  const visibleTabs = () => allTabs().filter((t) => !t.hidden);

  function drawTabs() {
    const bar = clear($("#tabs"));
    visibleTabs().forEach((t) => bar.appendChild(el("button", { "data-tab": t.id, class: t.id === current ? "active" : "", "aria-current": t.id === current ? "page" : null, text: t.name })));
    bar.appendChild(el("button", { class: "seg-edit", title: "Organizar separadores", "aria-label": "Organizar separadores", html: UI.icon("sliders", 18) }));
    const active = bar.querySelector("button.active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  let current = "";
  function render(tabId) {
    const vis = visibleTabs();
    const tab = vis.find((t) => t.id === tabId) || vis[0] || BUILTIN_TABS[0];
    const switching = current !== tab.id;
    if (switching) Store.update("sys", (s) => { s.lastTab = tab.id; }, { silent: true });
    current = tab.id;
    drawTabs();
    const y = window.scrollY;
    const view = clear($("#view"));
    const fn = { resumo: renderResumo, tx: renderTx, cats: renderCats, budgets: renderBudgets, savings: renderSavings, net: renderNet, filter: renderFilterTab, notes: renderNotesTab }[tab.type] || renderResumo;
    fn(view, tab);
    window.scrollTo(0, switching ? 0 : y);
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

  function describeFilter(tab) {
    const parts = [];
    parts.push(tab.categories && tab.categories.length ? tab.categories.join(", ") : "Todas as categorias");
    if (tab.sources && tab.sources.length) parts.push(tab.sources.join(", "));
    if (tab.query) parts.push(`descrição contém "${tab.query}"`);
    if (tab.kind === "expense") parts.push("só despesas"); else if (tab.kind === "income") parts.push("só receitas");
    return parts.join(" · ");
  }

  function renderFilterTab(view, tab) {
    const fin = Store.get(NS);
    const period = tab.period || "month";
    const inPeriod = (t) => period === "all" ? true : period === "year" ? (t.date || "").slice(0, 4) === viewYear : (t.date || "").slice(0, 7) === viewMonth;
    const tx = (fin.transactions || []).filter((t) => matchesTab(t, tab) && inPeriod(t));
    const periodLabel = period === "all" ? "Desde sempre" : period === "year" ? viewYear : cap(prettyMonth(viewMonth));
    let income = 0, expense = 0; const byCat = {};
    tx.forEach((t) => { if (t.type === "income") income += t.amount; else { expense += t.amount; byCat[t.category || "Outros"] = (byCat[t.category || "Outros"] || 0) + t.amount; } });

    const actions = [];
    if (period === "month") actions.push(monthPill(() => render(tab.id)));
    if (period === "year") actions.push(yearPill(() => render(tab.id)));
    actions.push(btnI("btn-lg", "sliders", "Editar", () => editTab(tab)));
    view.appendChild(pageHead({ eyebrow: "Separador personalizado", icon: "filter", title: tab.name, sub: describeFilter(tab), actions }));

    const kind = tab.kind || "all";
    const n = tx.length;
    const countSub = `${n} movimento${n === 1 ? "" : "s"} · ${periodLabel.toLowerCase()}`;
    const kpis = kind === "all"
      ? [kpi({ label: "Saldo", value: eur(income - expense), sub: countSub, icon: "wallet", variant: income - expense < 0 ? "bad" : "accent" }),
         kpi({ label: "Receitas", value: eur(income), sub: periodLabel, icon: "down" }),
         kpi({ label: "Despesas", value: eur(expense), sub: periodLabel, icon: "up", variant: "bad" })]
      : [kpi({ label: kind === "income" ? "Recebido" : "Gasto", value: eur(kind === "income" ? income : expense), sub: countSub, icon: kind === "income" ? "down" : "up", variant: "accent" }),
         kpi({ label: "Movimentos", value: String(n), sub: periodLabel, icon: "repeat" }),
         kpi({ label: "Média por movimento", value: eur(n ? (kind === "income" ? income : expense) / n : 0), sub: periodLabel, icon: "chart" })];

    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const colors = colorsForCount(cats.length);
    const catPanel = cats.length > 1 ? panel({ title: "Por categoria", sub: periodLabel }, [
      dotRows(cats.map(([label, value], i) => ({ label, value, color: colors[i] })), expense,
        (p) => showTxSheet(p.label + " · " + tab.name, tx.filter((t) => t.type === "expense" && (t.category || "Outros") === p.label))),
    ]) : null;

    const sorted = [...tx].sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
    const listPanel = panel({ title: "Movimentos", sub: countSub }, [
      sorted.length ? txRows(sorted.slice(0, 400)) : el("div", { class: "empty", text: "Nenhum movimento corresponde a este filtro neste período." }),
    ]);

    view.appendChild(el("div", { class: "stack" }, [el("div", { class: "kpis" }, kpis), catPanel, listPanel].filter(Boolean)));
  }

  /* -------- Separador personalizado: notas -------- */
  function renderNotesTab(view, tab) {
    view.appendChild(pageHead({ eyebrow: "Notas", icon: "notes", title: tab.name, sub: "Guarda sozinho e sincroniza entre dispositivos.", actions: [btnI("btn-lg", "sliders", "Editar", () => editTab(tab))] }));
    const area = el("textarea", { class: "notes-area", placeholder: "Escreve aqui…", "aria-label": tab.name });
    area.value = tab.body || "";
    const state = el("div", { class: "tiny muted", style: "text-align:right;min-height:18px;margin-top:8px" });
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
    view.appendChild(panel({}, [area, state]));
  }

  /* ----------------------------- COMPONENTES ----------------------------- */
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ico = (name, size = 20) => el("span", { class: "ico", style: "display:inline-flex", html: UI.icon(name, size) });
  const signed = (t) => (t.type === "income" ? "+" : t.type === "transfer" ? "" : "-") + eur(t.amount);
  function ddmm(iso) {
    if (!iso) return "";
    const same = iso.slice(0, 4) === String(new Date().getFullYear());
    return iso.slice(8, 10) + "/" + iso.slice(5, 7) + (same ? "" : "/" + iso.slice(2, 4));
  }
  const btnI = (cls, iconName, label, onclick) => el("button", { class: "btn " + cls, "aria-label": label, onclick }, [ico(iconName, 18), el("span", { text: label })]);

  function pageHead({ eyebrow, icon, title, sub, actions }) {
    const eb = eyebrow ? el("div", { class: "eyebrow" }, [icon ? ico(icon, 16) : null, el("span", { text: eyebrow })]) : null;
    return el("div", { class: "page-head" }, [
      el("div", { class: "ph-text" }, [eb, el("h1", { class: "page-title", text: title }), sub ? el("p", { class: "page-sub", text: sub }) : null]),
      actions && actions.length ? el("div", { class: "ph-actions" }, actions) : null,
    ]);
  }

  function panel({ title, sub, icon, action, cls }, children) {
    const head = title ? el("div", { class: "panel-head" }, [
      el("div", {}, [el("h2", { class: "panel-title", text: title }), sub ? el("div", { class: "panel-sub", text: sub }) : null]),
      action || (icon ? el("span", { class: "panel-ico", html: UI.icon(icon, 26) }) : null),
    ]) : null;
    return el("section", { class: "panel" + (cls ? " " + cls : "") }, [head, ...children]);
  }
  const linkBtn = (text, onclick) => el("button", { class: "link-btn", onclick }, [el("span", { text }), ico("right", 18)]);

  function kpi({ label, value, sub, icon, variant, onClick }) {
    return el(onClick ? "button" : "div", { class: "kpi-card" + (variant ? " is-" + variant : ""), type: onClick ? "button" : null, onclick: onClick || null }, [
      el("div", { class: "k-label", text: label }),
      el("span", { class: "k-ico", html: UI.icon(icon, 20) }),
      el("div", { class: "k-value", text: value }),
      sub ? el("div", { class: "k-sub", text: sub }) : null,
    ]);
  }

  function monthPill(onChange) {
    const picker = el("input", { type: "month", class: "hide", value: viewMonth, "aria-label": "Escolher mês" });
    picker.addEventListener("change", () => { if (picker.value) { viewMonth = picker.value; onChange(); } });
    const shift = (d) => { const [y, m] = viewMonth.split("-").map(Number); viewMonth = monthKey(new Date(y, m - 1 + d, 1)); onChange(); };
    return el("div", { class: "month-pill" }, [
      el("button", { class: "mp-btn", "aria-label": "Mês anterior", html: UI.icon("left", 20), onclick: () => shift(-1) }),
      el("div", { class: "mp-label", title: "Escolher mês", onclick: () => { try { picker.showPicker(); } catch (e) { picker.click(); } } }, [ico("calendar", 18), el("span", { text: cap(prettyMonth(viewMonth)) })]),
      picker,
      el("button", { class: "mp-btn", "aria-label": "Mês seguinte", html: UI.icon("right", 20), onclick: () => shift(1) }),
    ]);
  }

  let viewYear = String(new Date().getFullYear());
  function yearPill(onChange) {
    const shift = (d) => { viewYear = String(+viewYear + d); onChange(); };
    return el("div", { class: "month-pill" }, [
      el("button", { class: "mp-btn", "aria-label": "Ano anterior", html: UI.icon("left", 20), onclick: () => shift(-1) }),
      el("div", { class: "mp-label" }, [ico("calendar", 18), el("span", { text: viewYear })]),
      el("button", { class: "mp-btn", "aria-label": "Ano seguinte", html: UI.icon("right", 20), onclick: () => shift(1) }),
    ]);
  }

  /** Linhas "● Categoria ...... 12% 120,00 €" — parts: [{label, value, color}]. */
  function dotRows(parts, total, onClick) {
    return el("div", { class: "dot-rows" }, parts.map((p) => el("div", { class: "dot-row", onclick: onClick ? () => onClick(p) : null }, [
      el("span", { class: "dr-dot", style: "background:" + p.color }),
      el("span", { class: "dr-name", text: p.label }),
      total ? el("span", { class: "dr-pct", text: Math.round(p.value / total * 100) + "%" }) : null,
      el("span", { class: "money", text: eur(p.value) }),
    ])));
  }

  /** Barras mensais arredondadas (verde = positivo, terracota = negativo). */
  function evoChart(series, onPick) {
    const max = Math.max(1, ...series.map((m) => Math.abs(m.value)));
    return el("div", { class: "evo" }, series.map((m) => el("div", { class: "ev-col" + (m.cur ? " cur" : ""), title: `${m.title}: ${eur(m.value)}`, onclick: onPick ? () => onPick(m) : null }, [
      el("div", { class: "ev-bar" + (m.value < 0 ? " neg" : ""), style: `height:max(8px, calc((100% - 34px) * ${(Math.abs(m.value) / max).toFixed(4)}))` }),
      el("div", { class: "ev-lbl", text: m.label }),
    ])));
  }

  /** Linha de movimento com bolha (listas do Resumo, sheets, separadores filtrados). */
  function txRow(t, editable = true) {
    const inc = t.type === "income", tr = t.type === "transfer";
    const sub = [tr ? `${t.account || "?"} → ${t.toAccount || "?"}` : (t.category || "Outros"), ddmm(t.date)].join(" · ");
    return el("div", { class: "tx-line", style: editable ? "" : "cursor:default", onclick: editable ? () => editTx(t) : null }, [
      el("span", { class: "bubble" + (inc ? " in" : ""), html: UI.icon(tr ? "repeat" : inc ? "down" : "up", 20) }),
      el("div", { class: "tl-main" }, [el("div", { class: "tl-title", text: t.desc || "(sem descrição)" }), el("div", { class: "tl-sub", text: sub })]),
      el("div", { class: "money" + (inc ? " pos" : ""), text: signed(t) }),
    ]);
  }
  const txRows = (list) => el("div", { class: "tx-rows" }, list.map((t) => txRow(t, true)));

  /* ----------------------------- RESUMO ----------------------------- */
  function monthlySeries(fin, endMk, n = 6) {
    const out = [];
    const [ey, em] = endMk.split("-").map(Number);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(ey, em - 1 - i, 1); const mk = monthKey(d);
      const s = D.financeSummary(fin, mk);
      out.push({ mk, label: UI.MONTHS[d.getMonth()].slice(0, 3), title: cap(prettyMonth(mk)), value: s.balance, cur: mk === endMk });
    }
    return out;
  }

  function renderResumo(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth, essentialSet());
    const monthTx = D.txInMonth(fin.transactions, viewMonth);
    const incomeTx = monthTx.filter((t) => t.type === "income"), expenseTx = monthTx.filter((t) => t.type === "expense");
    const pm = prettyMonth(viewMonth);

    view.appendChild(pageHead({ eyebrow: "O teu dinheiro, sem ruído", icon: "sparkles", title: "Olá, este é o teu espaço.",
      sub: `Uma vista honesta sobre onde estás em ${pm}.`, actions: [monthPill(() => render(current))] }));

    const pct = s.income ? Math.round(s.expense / s.income * 100) : null;
    const kpis = el("div", { class: "kpis" }, [
      kpi({ label: "Dinheiro livre", value: eur(s.free), sub: "rendimentos − gastos − compromissos", icon: "wallet", variant: "accent", onClick: () => freeSheet(s) }),
      kpi({ label: "Rendimentos", value: eur(s.income), sub: `${incomeTx.length} ${incomeTx.length === 1 ? "entrada" : "entradas"} este mês`, icon: "down", onClick: () => showTxSheet("Rendimentos · " + pm, incomeTx) }),
      kpi({ label: "Despesas", value: eur(s.expense), sub: pct != null ? `${pct}% dos rendimentos` : `${expenseTx.length} movimentos`, icon: "up", variant: "bad", onClick: () => showTxSheet("Despesas · " + pm, expenseTx) }),
    ]);

    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const colors = colorsForCount(cats.length);
    const catPanel = panel({ title: "Despesas por categoria", sub: "Este mês", action: linkBtn("Ver movimentos", () => render("tx")) }, [
      cats.length
        ? dotRows(cats.map(([label, value], i) => ({ label, value, color: colors[i] })), s.expense,
          (p) => showTxSheet(p.label + " · " + pm, expenseTx.filter((t) => (t.category || "Outros") === p.label)))
        : el("div", { class: "empty", text: "Sem despesas neste mês." }),
    ]);

    let ess = 0, life = 0;
    Object.entries(s.byCat).forEach(([c, v]) => { if (catGroup(c) === "essential") ess += v; else life += v; });
    const tot = ess + life;
    const legendItem = (label, v, color) => el("span", {}, [el("i", { class: "dot", style: "background:" + color }), label, el("b", { text: eur(v) })]);
    const splitPanel = panel({ title: "Essenciais vs estilo de vida", sub: "A forma como o mês se divide" }, [
      el("div", { class: "split-bar" }, tot ? [
        el("i", { style: `width:${(ess / tot * 100).toFixed(2)}%;background:var(--accent)` }),
        el("i", { style: `width:${(life / tot * 100).toFixed(2)}%;background:var(--bad)` }),
      ] : []),
      el("div", { class: "split-legend" }, [legendItem("Essenciais", ess, "var(--accent)"), legendItem("Estilo de vida", life, "var(--bad)")]),
    ]);

    const evoPanel = panel({ title: "Evolução mensal", sub: "Saldo que sobra em cada mês", icon: "chart" }, [
      evoChart(monthlySeries(fin, viewMonth, 6), (m) => { viewMonth = m.mk; render(current); }),
    ]);

    const top = [...expenseTx].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const topPanel = panel({ title: "Maiores gastos", sub: "Os movimentos que mais pesaram",
      action: el("button", { class: "btn btn-soft", onclick: () => render("tx") }, [el("span", { text: "Ver todos" }), ico("right", 18)]) }, [
      top.length ? txRows(top) : el("div", { class: "empty", text: "Sem despesas neste mês." }),
    ]);

    view.appendChild(el("div", { class: "stack" }, [kpis, sourcePanel(), catPanel, splitPanel, evoPanel, topPanel]));
  }

  function freeSheet(s) {
    const line = (k, v, strong) => el("div", { class: "item" }, [el("div", { class: "grow" }, [el("div", { class: "t", text: k })]), el("div", { class: "amt", style: strong ? "color:var(--accent-ink)" : "", text: v })]);
    sheet("Dinheiro livre", [
      el("p", { class: "muted", style: "margin:0", text: "O que podes gastar este mês sem comprometer as contas." }),
      el("div", { class: "list" }, [
        line("Rendimentos", "+" + eur(s.income)), line("Gastos", "-" + eur(s.expense)),
        line("Compromissos", "-" + eur(s.committed)), line("Dinheiro livre", eur(s.free), true),
      ]),
      el("p", { class: "tiny muted", text: "Compromissos = o que ainda falta gastar dos orçamentos das categorias essenciais (renda, contas, supermercado…). Define-os em Orçamentos." }),
    ]);
  }

  /** Sheet com uma lista de movimentos (mais recente primeiro). */
  function showTxSheet(title, txs) {
    const sorted = [...txs].sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
    const total = sorted.reduce((a, t) => a + (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0), 0);
    sheet(title, [
      el("p", { class: "tiny muted", style: "margin:0", text: sorted.length + " movimento" + (sorted.length === 1 ? "" : "s") + " · total " + eur(Math.abs(total)) }),
      sorted.length ? txRows(sorted) : el("div", { class: "empty", text: "Sem movimentos." }),
    ]);
  }

  /** Painel "Saldo por fonte" — quanto há em cada conta/cartão/dinheiro. */
  function sourcePanel() {
    const fin = Store.get(NS);
    const { list, total } = D.sourceBalances(fin);
    const max = Math.max(1, ...list.map((x) => Math.abs(x.balance)));
    const rows = el("div", { class: "src-rows" });
    if (!list.length) rows.appendChild(el("div", { class: "empty", text: "Sem fontes de pagamento ainda." }));
    [...list].sort((a, b) => b.balance - a.balance).forEach((src) => {
      const neg = src.balance < 0;
      rows.appendChild(el("div", { class: "src-row", onclick: () => { const so = (fin.sources || []).find((x) => x.name === src.name); editSource(so || null, { presetName: src.name }); } }, [
        el("div", { class: "src-top" }, [el("span", { text: src.name }), el("span", { class: "money" + (neg ? " neg-strong" : ""), text: eur(src.balance) })]),
        bar(Math.abs(src.balance) / max * 100, neg ? "bad" : ""),
      ]));
    });
    return panel({ title: "Saldo por fonte", sub: "Onde o teu dinheiro está agora · total " + eur(total), icon: "bank" }, [
      rows, el("div", { style: "margin-top:20px" }, [btnI("btn-ghost btn-sm", "card", "Gerir fontes", manageSources)]),
    ]);
  }

  /* ----------------------------- MOVIMENTOS ----------------------------- */
  let txQuery = "";
  let txLimit = 200;
  function renderTx(view) {
    const importInput = el("input", { type: "file", accept: ".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf", class: "hide" });
    importInput.addEventListener("change", () => {
      const f = importInput.files[0]; importInput.value = "";
      if (!f) return;
      const name = f.name.toLowerCase();
      if (name.endsWith(".pdf")) importPdf(f);
      else if (name.endsWith(".xlsx") || name.endsWith(".xls")) importExcel(f);
      else f.text().then((txt) => importCsv(txt));
    });

    view.appendChild(pageHead({ eyebrow: "Registo completo", title: "Movimentos", sub: "Tudo o que entra, sai e muda de lugar.", actions: [
      btnI("btn-lg", "upload", "Importar", () => importInput.click()),
      btnI("btn-primary btn-lg", "plus", "Novo movimento", () => editTx(null)),
      importInput,
    ] }));

    const search = el("input", { type: "search", placeholder: "Procurar por descrição, categoria ou fonte…", value: txQuery, "aria-label": "Procurar movimentos" });
    const moreBtn = el("button", { class: "btn btn-soft btn-lg" }, [ico("repeat", 18), el("span", { text: "Recorrentes" }), ico("chevron", 16)]);
    moreBtn.addEventListener("click", () => UI.popover(moreBtn, [
      { label: "Movimentos recorrentes", icon: "repeat", onClick: manageRecurring },
      { label: "Fontes de pagamento", icon: "card", onClick: manageSources },
      { label: "Categorias", icon: "tag", onClick: () => render("cats") },
    ]));
    const toolbar = el("div", { class: "toolbar" }, [el("label", { class: "search" }, [ico("search", 20), search]), moreBtn]);

    const bulk = el("div", { class: "bulk-bar hide" });
    const table = el("section", { class: "panel table" });
    let selected = new Set();

    function toggle(id) { if (selected.has(id)) selected.delete(id); else selected.add(id); draw(); }

    function drawBulk() {
      clear(bulk);
      bulk.classList.toggle("hide", !selected.size);
      if (!selected.size) return;
      bulk.append(
        el("div", { class: "grow", text: selected.size + " selecionado" + (selected.size > 1 ? "s" : "") }),
        btnI("btn-danger btn-sm", "trash", "Apagar", async () => {
          const n = selected.size;
          if (!(await UI.confirm(`Apagar ${n} movimento${n > 1 ? "s" : ""}? Podes anular a seguir.`, { ok: "Apagar", danger: true }))) return;
          const ids = selected;
          const snap = Store.get(NS).transactions.filter((t) => ids.has(t.id)).map((t) => JSON.parse(JSON.stringify(t)));
          Store.update(NS, (s) => { s.transactions = s.transactions.filter((t) => !ids.has(t.id)); });
          undo(`${n} movimento${n > 1 ? "s apagados" : " apagado"}`, () => Store.update(NS, (s) => { s.transactions.push(...snap); }));
        }),
        el("button", { class: "btn btn-ghost btn-sm", text: "Limpar", onclick: () => { selected = new Set(); draw(); } }),
      );
    }

    function tableRow(t) {
      const inc = t.type === "income", tr = t.type === "transfer";
      const on = selected.has(t.id);
      const cat = tr ? "Transferência" : (t.category || "Outros");
      const src = tr ? `${t.account || "?"} → ${t.toAccount || "?"}` : (t.account || "—");
      return el("div", { class: "t-row" + (on ? " on" : ""), id: "tx-" + t.id, onclick: () => (selected.size ? toggle(t.id) : editTx(t)) }, [
        el("input", { type: "checkbox", checked: on, "aria-label": "Selecionar " + (t.desc || "movimento"), onclick: (e) => { e.stopPropagation(); toggle(t.id); } }),
        el("div", { class: "c-name" }, [el("div", { class: "c-title", text: t.desc || "(sem descrição)" }), el("div", { class: "c-meta", text: [ddmm(t.date), cat, src].join(" · ") })]),
        el("div", { class: "c-soft c-cat", text: cat }),
        el("div", { class: "c-soft c-src", text: src }),
        el("div", { class: "c-soft c-date", text: ddmm(t.date) }),
        el("div", { class: "c-amt money" + (inc ? " pos" : ""), text: signed(t) }),
        el("button", { class: "c-edit", "aria-label": "Editar", title: "Editar", html: UI.icon("pencil", 16), onclick: (e) => { e.stopPropagation(); editTx(t); } }),
      ]);
    }

    function draw() {
      const q = txQuery.toLowerCase().trim();
      const all = [...Store.get(NS).transactions]
        .filter((t) => !q || [t.desc, t.category, t.account].some((v) => (v || "").toLowerCase().includes(q)))
        .sort((a, b) => (b.date || "").localeCompare(a.date) || (b._c || 0) - (a._c || 0));
      const shown = all.slice(0, txLimit);
      const allSel = shown.length > 0 && shown.every((t) => selected.has(t.id));
      clear(table);
      table.appendChild(el("div", { class: "t-row t-head" }, [
        el("input", { type: "checkbox", checked: allSel, "aria-label": "Selecionar todos", onclick: (e) => { e.stopPropagation(); if (allSel) selected = new Set(); else shown.forEach((t) => selected.add(t.id)); draw(); } }),
        el("div", { text: "Movimento" }), el("div", { text: "Categoria" }), el("div", { text: "Fonte" }), el("div", { text: "Data" }), el("div", { class: "c-amt", text: "Valor" }), el("div"),
      ]));
      if (!shown.length) table.appendChild(el("div", { class: "empty", text: q ? "Nenhum movimento encontrado." : "Ainda não há movimentos. Importa o extrato do banco ou adiciona um manualmente." }));
      shown.forEach((t) => table.appendChild(tableRow(t)));
      if (all.length > shown.length) table.appendChild(el("div", { class: "center", style: "padding:18px" }, [
        el("button", { class: "btn btn-sm", text: `Mostrar mais (${all.length - shown.length})`, onclick: () => { txLimit += 200; draw(); } }),
      ]));
      drawBulk();
    }
    search.addEventListener("input", () => { txQuery = search.value; txLimit = 200; draw(); });
    draw();
    view.appendChild(el("div", {}, [toolbar, bulk, table]));
  }

  /* ----------------------------- CATEGORIAS ----------------------------- */
  const GROUPS = { essential: "Essencial", lifestyle: "Estilo de vida", income: "Receita" };
  function renderCats(view) {
    const fin = Store.get(NS);
    view.appendChild(pageHead({ eyebrow: "Personaliza o teu registo", icon: "tag", title: "Categorias", sub: "Cria e organiza as categorias que queres usar nos teus movimentos." }));

    const fName = el("input", { placeholder: "Nome da categoria", "aria-label": "Nome da categoria" });
    const fGroup = el("select", { "aria-label": "Grupo" }, Object.entries(GROUPS).map(([v, l]) => el("option", { value: v }, l)));
    const addBtn = el("button", { class: "btn btn-primary btn-lg", onclick: guardClick(() => {
      const name = fName.value.trim(); if (!name) return toast("Escreve o nome da categoria.");
      if ((Store.get(NS).categories || []).some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast("Essa categoria já existe.");
      Store.update(NS, (s) => { s.categories = s.categories || []; s.categories.push({ name, group: fGroup.value }); });
      toast("Categoria criada ✓");
    }) }, [ico("plus", 18), el("span", { text: "Adicionar" })]);
    fName.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });

    const counts = {};
    fin.transactions.forEach((t) => { if (t.type === "transfer") return; const c = t.category || "Outros"; counts[c] = (counts[c] || 0) + 1; });
    const registered = new Set((fin.categories || []).map((c) => c.name));
    const implicit = Object.keys(counts).filter((n) => !registered.has(n)).map((name) => ({ name, group: catGroup(name) }));
    const order = { essential: 0, lifestyle: 1, income: 2 };
    const cats = [...(fin.categories || []), ...implicit].sort((a, b) => (order[a.group] ?? 3) - (order[b.group] ?? 3) || a.name.localeCompare(b.name));

    const list = el("div", { class: "list cat-list" });
    cats.forEach((c) => {
      const n = counts[c.name] || 0;
      list.appendChild(el("div", { class: "item cat-item" }, [
        el("span", { class: "item-ico", html: UI.icon("tag", 20) }),
        el("div", { class: "grow" }, [el("div", { class: "t", text: c.name }), el("div", { class: "s", text: `${GROUPS[c.group] || c.group} · ${n} movimento${n === 1 ? "" : "s"}` })]),
        btnI("btn-ghost", "pencil", "Editar", () => editCategory(c)),
        btnI("btn-danger", "trash", "Apagar", () => deleteCategory(c.name)),
      ]));
    });
    if (!cats.length) list.appendChild(el("div", { class: "empty", text: "Ainda não tens categorias." }));

    view.appendChild(el("div", { class: "stack" }, [
      panel({ title: "Nova categoria", sub: "Escolhe também onde se encaixa para os resumos fazerem sentido." }, [el("div", { class: "inline-form" }, [fName, fGroup, addBtn])]),
      panel({ title: "As tuas categorias", sub: `${cats.length} categorias disponíveis nos movimentos` }, [list]),
    ]));
  }

  /* ----------------------------- ORÇAMENTOS ----------------------------- */
  function renderBudgets(view) {
    const fin = Store.get(NS);
    const s = D.financeSummary(fin, viewMonth, essentialSet());
    view.appendChild(pageHead({ eyebrow: "Limites do mês", icon: "target", title: "Orçamentos", sub: "Quanto queres gastar em cada categoria — e quanto já foi.", actions: [monthPill(() => render(current))] }));

    let budgeted = 0, used = 0;
    Object.entries(fin.budgets || {}).forEach(([c, lim]) => { budgeted += lim; used += s.byCat[c] || 0; });
    const left = budgeted - used;
    const kpis = el("div", { class: "kpis" }, [
      kpi({ label: "Por gastar", value: eur(left), sub: budgeted ? `${Math.round(used / budgeted * 100)}% do orçamento usado` : "Define limites abaixo", icon: "target", variant: left < 0 ? "bad" : "accent" }),
      kpi({ label: "Orçamentado", value: eur(budgeted), sub: `${Object.keys(fin.budgets || {}).length} categorias com limite`, icon: "wallet" }),
      kpi({ label: "Gasto nessas categorias", value: eur(used), sub: cap(prettyMonth(viewMonth)), icon: "up" }),
    ]);

    const cats = [...new Set([...Object.keys(fin.budgets || {}), ...Object.keys(s.byCat)])];
    const rowsData = cats.map((cat) => { const limit = fin.budgets[cat] || 0, spent = s.byCat[cat] || 0; return { cat, limit, spent, pct: limit ? spent / limit * 100 : 0 }; })
      .sort((a, b) => (b.limit ? 1 : 0) - (a.limit ? 1 : 0) || b.pct - a.pct || b.spent - a.spent);
    const rows = el("div", { class: "src-rows" });
    if (!rowsData.length) rows.appendChild(el("div", { class: "empty", text: "Define limites por categoria para acompanhares os gastos." }));
    rowsData.forEach(({ cat, limit, spent, pct }) => {
      const tone = !limit ? "" : spent > limit ? "bad" : pct >= 85 ? "warn" : "good";
      rows.appendChild(el("div", { class: "src-row", onclick: () => setBudget(cat) }, [
        el("div", { class: "src-top" }, [el("span", { text: cat }), el("span", { class: "money" + (limit && spent > limit ? " neg-strong" : ""), text: limit ? `${eur(spent)} / ${eur(limit)}` : eur(spent) })]),
        bar(limit ? Math.min(100, pct) : 0, tone),
        limit && pct >= 85 ? el("div", { class: "tiny", style: "margin-top:8px;color:" + (spent > limit ? "var(--bad)" : "var(--warn)"), text: spent > limit ? `Ultrapassaste em ${eur(spent - limit)}` : spent === limit ? "Limite atingido" : `Atenção: ${Math.round(pct)}% usado` })
          : !limit ? el("div", { class: "tiny muted", style: "margin-top:8px", text: "Sem limite — toca para definir" }) : null,
      ]));
    });

    view.appendChild(el("div", { class: "stack" }, [kpis,
      panel({ title: "Por categoria", sub: "Toca numa categoria para mudar o limite", action: btnI("btn-soft", "plus", "Definir limite", () => setBudget(null)) }, [rows]),
    ]));
  }

  /* ----------------------------- POUPANÇA ----------------------------- */
  function renderSavings(view) {
    const fin = Store.get(NS);
    const { arr, years, total } = savingsData(fin);
    const curYear = String(new Date().getFullYear());
    const avg = arr.length ? total / arr.length : 0;
    view.appendChild(pageHead({ eyebrow: "O que fica", icon: "piggy", title: "Poupança", sub: "Quanto sobra ao fim de cada mês, e para onde vai o resto." }));

    const kpis = el("div", { class: "kpis" }, [
      kpi({ label: "Poupança total", value: eur(total), sub: `${arr.length} meses registados`, icon: "piggy", variant: total < 0 ? "bad" : "accent" }),
      kpi({ label: "Em " + curYear, value: eur(years[curYear] || 0), sub: "receitas − despesas este ano", icon: "calendar" }),
      kpi({ label: "Média por mês", value: eur(avg), sub: "desde o primeiro registo", icon: "chart" }),
    ]);

    const last = arr.slice(-12).map((m) => {
      const [y, mm] = m.mk.split("-").map(Number);
      return { mk: m.mk, label: UI.MONTHS[mm - 1].slice(0, 3), title: cap(prettyMonth(m.mk)), value: m.save, cur: m.mk === monthKey() };
    });
    const chartPanel = panel({ title: "Poupança por mês", sub: "Últimos 12 meses", icon: "chart" }, [
      last.length ? evoChart(last, (m) => { viewMonth = m.mk; render("resumo"); }) : el("div", { class: "empty", text: "Sem dados ainda." }),
    ]);

    const byCat = {};
    (fin.transactions || []).forEach((t) => { if (t.type === "expense" && (t.date || "").slice(0, 4) === curYear) byCat[t.category || "Outros"] = (byCat[t.category || "Outros"] || 0) + t.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const totalExp = cats.reduce((a, c) => a + c[1], 0);
    const colors = colorsForCount(cats.length);
    const catPanel = panel({ title: "Onde gastas mais", sub: "Despesas de " + curYear }, [
      cats.length ? dotRows(cats.map(([label, value], i) => ({ label, value, color: colors[i] })), totalExp,
        (p) => showTxSheet(p.label + " · " + curYear, (fin.transactions || []).filter((t) => t.type === "expense" && (t.date || "").slice(0, 4) === curYear && (t.category || "Outros") === p.label)))
        : el("div", { class: "empty", text: "Sem despesas este ano ainda." }),
    ]);

    const ykeys = Object.keys(years).sort((a, b) => b.localeCompare(a));
    const yearsPanel = panel({ title: "Por ano", sub: "Receitas menos despesas" }, [
      ykeys.length ? el("div", { class: "list" }, ykeys.map((y) => el("div", { class: "item" }, [
        el("div", { class: "grow" }, [el("div", { class: "t", text: y })]),
        el("div", { class: "amt", style: "color:" + (years[y] >= 0 ? "var(--accent-ink)" : "var(--bad)"), text: eur(years[y]) }),
      ]))) : el("div", { class: "empty", text: "Sem dados ainda." }),
    ]);

    view.appendChild(el("div", { class: "stack" }, [kpis, chartPanel, el("div", { class: "grid-2" }, [catPanel, yearsPanel])]));
  }

  /* ----------------------------- PATRIMÓNIO ----------------------------- */
  function renderNet(view) {
    const fin = Store.get(NS);
    const nw = D.netWorth(fin);
    if ((fin.nwHistory || {})[monthKey()] !== nw.net) Store.update(NS, (s) => { s.nwHistory = s.nwHistory || {}; s.nwHistory[monthKey()] = nw.net; }, { silent: true, keepTime: true });
    view.appendChild(pageHead({ eyebrow: "O que tens e o que deves", icon: "scale", title: "Património", sub: "O teu património líquido e como tem evoluído." }));

    const kpis = el("div", { class: "kpis" }, [
      kpi({ label: "Património líquido", value: eur(nw.net), sub: "ativos − passivos", icon: "scale", variant: nw.net < 0 ? "bad" : "accent" }),
      kpi({ label: "Ativos", value: eur(nw.assets), sub: "o que tens", icon: "bank" }),
      kpi({ label: "Passivos", value: eur(nw.liab), sub: "o que deves", icon: "card", variant: "bad" }),
    ]);

    const hist = Object.entries(fin.nwHistory || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    let histPanel = null;
    if (hist.length >= 2) {
      const delta = hist[hist.length - 1][1] - hist[0][1];
      histPanel = panel({ title: "Evolução", sub: `${delta >= 0 ? "+" : ""}${eur(delta)} desde ${prettyMonth(hist[0][0])}`, icon: "chart" }, [
        UI.lineChart(hist.map((h) => h[1]), { labels: [cap(prettyMonth(hist[0][0])), cap(prettyMonth(hist[hist.length - 1][0]))], height: 120, color: "var(--accent)" }),
      ]);
    }

    const side = (type, title, sub) => {
      const items = (fin.assets || []).filter((a) => (a.type === "liability") === (type === "liability"));
      return panel({ title, sub, action: el("button", { class: "btn btn-soft btn-icon", "aria-label": "Adicionar", html: UI.icon("plus", 18), onclick: () => editAsset(null, type) }) }, [
        items.length ? el("div", { class: "list" }, items.map((a) => el("div", { class: "item", style: "cursor:pointer", onclick: () => editAsset(a) }, [
          el("span", { class: "item-ico", html: UI.icon(type === "liability" ? "card" : "bank", 20) }),
          el("div", { class: "grow" }, [el("div", { class: "t", text: a.name })]),
          el("div", { class: "amt", style: type === "liability" ? "color:var(--bad)" : "", text: eur(a.value) }),
        ]))) : el("div", { class: "empty", text: type === "liability" ? "Sem dívidas registadas." : "Adiciona contas, investimentos, bens…" }),
      ]);
    };

    view.appendChild(el("div", { class: "stack" }, [kpis, histPanel, el("div", { class: "grid-2" }, [side("asset", "Ativos", "O que tens"), side("liability", "Passivos", "O que deves")])].filter(Boolean)));
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
  // parentSheet: a lista "Categorias" (sheet) de onde foi aberto — fecha-a e reabre-a ao guardar,
  // para não empilhar folhas. Sem parentSheet (aberto do separador Categorias) só fecha.
  function editCategory(c, parentSheet) {
    const isNew = !c; const old = c ? c.name : "";
    c = c || { name: "", group: "lifestyle" };
    const fn = field("Nome", { value: c.name, placeholder: "ex: Viagens" });
    const fg = field("Grupo", { type: "select", value: c.group, options: Object.entries(GROUPS).map(([value, label]) => ({ value, label })) });
    const back = () => { sh.close(); if (parentSheet) { parentSheet.close(); manageCategories(); } };
    const sh = sheet(isNew ? "Nova categoria" : "Editar categoria", [fn, fg,
      isNew ? null : el("p", { class: "tiny muted", style: "margin:0", text: "Mudar o nome atualiza também os movimentos, recorrentes e orçamentos com esta categoria." }),
      el("div", { class: "row", style: "gap:10px;margin-top:6px" }, [
        !isNew ? el("button", { class: "btn btn-danger btn-block", text: "Apagar", onclick: async () => { if (await deleteCategory(old)) back(); } }) : null,
        el("button", { class: "btn btn-primary btn-block", text: "Guardar", onclick: guardClick(() => {
          const name = fn.input.value.trim(); if (!name) return toast("Indica o nome.");
          if (name !== old && (Store.get(NS).categories || []).some((x) => x.name === name)) return toast("Já existe uma categoria com esse nome.");
          Store.update(NS, (s) => {
            s.categories = s.categories || [];
            const i = s.categories.findIndex((x) => x.name === old);
            if (i >= 0) s.categories[i] = { name, group: fg.input.value }; else s.categories.push({ name, group: fg.input.value });
            if (old && old !== name) {
              s.transactions.forEach((t) => { if (t.category === old) t.category = name; });
              (s.recurring || []).forEach((r) => { if (r.category === old) r.category = name; });
              if (s.budgets && old in s.budgets) { s.budgets[name] = s.budgets[old]; delete s.budgets[old]; }
              for (const k in s.categoryRules || {}) if (s.categoryRules[k] === old) s.categoryRules[k] = name;
            }
          });
          toast("Guardado ✓"); back();
        }) }),
      ]),
    ]);
  }

  /** Apaga uma categoria; os movimentos que a usavam passam para "Outros". */
  async function deleteCategory(name) {
    const n = Store.get(NS).transactions.filter((t) => t.type !== "transfer" && (t.category || "Outros") === name).length;
    if (name === "Outros" && n) { toast("\"Outros\" é a categoria por defeito — ainda tem movimentos."); return false; }
    const msg = n ? `Apagar "${name}"? ${n === 1 ? "O movimento" : `Os ${n} movimentos`} com esta categoria passa${n === 1 ? "" : "m"} para "Outros".` : `Apagar a categoria "${name}"?`;
    if (!(await UI.confirm(msg, { ok: "Apagar", danger: true }))) return false;
    Store.update(NS, (s) => {
      s.categories = (s.categories || []).filter((x) => x.name !== name);
      if (n) {
        s.transactions.forEach((t) => { if (t.type !== "transfer" && (t.category || "Outros") === name) t.category = "Outros"; });
        if (!s.categories.some((x) => x.name === "Outros")) s.categories.push({ name: "Outros", group: "lifestyle" });
      }
      (s.recurring || []).forEach((r) => { if (r.category === name) r.category = "Outros"; });
      if (s.budgets) delete s.budgets[name];
      for (const k in s.categoryRules || {}) if (s.categoryRules[k] === name) delete s.categoryRules[k];
    });
    toast("Categoria apagada");
    return true;
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
