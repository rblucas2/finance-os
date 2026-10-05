/* =====================================================================
   ui.js — utilitários de interface partilhados (sem dependências)
   ===================================================================== */
(function (global) {
  // --- Criação de elementos -------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      const v = attrs[k];
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "text") e.textContent = v;
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clear = (n) => { while (n && n.firstChild) n.removeChild(n.firstChild); return n; };

  // --- Formatação ------------------------------------------------------
  const eur = (n) => (isFinite(n) ? n : 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  const eur0 = (n) => (isFinite(n) ? n : 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const num = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString("pt-PT", { maximumFractionDigits: d });
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => isoDate(new Date());
  function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function monthKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const DAYS = ["dom","seg","ter","qua","qui","sex","sáb"];
  function prettyDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`;
  }
  function prettyMonth(mk) {
    const [y, m] = mk.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }

  // --- Toast -----------------------------------------------------------
  function toast(msg, ms = 2200) {
    let host = $("#toast");
    if (!host) { host = el("div", { id: "toast" }); document.body.appendChild(host); }
    const t = el("div", { class: "t", text: msg });
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, ms);
  }

  // Toast com ação "Anular" (undo)
  function undo(msg, fn, ms = 5000) {
    let host = $("#toast"); if (!host) { host = el("div", { id: "toast" }); document.body.appendChild(host); }
    const btn = el("button", { style: "background:none;border:0;color:var(--accent);font-weight:700;margin-left:12px;padding:0;font-size:.85rem;cursor:pointer", text: "Anular" });
    const t = el("div", { class: "t" }, [document.createTextNode(msg), btn]);
    host.appendChild(t);
    let done = false;
    btn.addEventListener("click", () => { if (done) return; done = true; fn(); t.remove(); toast("Reposto ✓"); });
    setTimeout(() => { if (!done) { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); } }, ms);
  }

  // --- Sheet / Modal ---------------------------------------------------
  function sheet(title, contentNodes, { onClose } = {}) {
    const body = el("div", { class: "form-grid" }, contentNodes);
    const sheetEl = el("div", { class: "sheet" }, [el("h2", { text: title }), body]);
    const scrim = el("div", { class: "scrim" }, [sheetEl]);
    function close() { scrim.remove(); document.body.style.overflow = ""; onClose && onClose(); }
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
    document.body.appendChild(scrim);
    document.body.style.overflow = "hidden";
    return { close, body, el: sheetEl };
  }

  function confirm(msg, { ok = "Confirmar", danger = false } = {}) {
    return new Promise((resolve) => {
      const s = sheet("Confirmar", [
        el("p", { class: "muted", text: msg }),
        el("div", { class: "row", style: "gap:10px;margin-top:6px" }, [
          el("button", { class: "btn btn-block", text: "Cancelar", onclick: () => { s.close(); resolve(false); } }),
          el("button", { class: "btn btn-block " + (danger ? "" : "btn-primary"), style: danger ? "background:var(--bad);color:#fff" : "", text: ok, onclick: () => { s.close(); resolve(true); } }),
        ]),
      ]);
    });
  }

  /** Campo de formulário rápido. type: text|number|date|select|textarea */
  function field(label, opts = {}) {
    const { type = "text", value = "", options, ...rest } = opts;
    let input;
    if (type === "select") {
      input = el("select", rest);
      (options || []).forEach((o) => {
        const ov = typeof o === "object" ? o.value : o;
        const ol = typeof o === "object" ? o.label : o;
        input.appendChild(el("option", { value: ov, selected: String(ov) === String(value) }, ol));
      });
    } else if (type === "textarea") {
      input = el("textarea", rest); input.value = value;
    } else {
      input = el("input", { type, ...rest }); input.value = value;
    }
    const wrap = el("label", { class: "field" }, [label ? el("span", { text: label }) : null, input]);
    wrap.input = input;
    return wrap;
  }

  // --- Progress bar ----------------------------------------------------
  function bar(pct, tone) {
    const p = Math.max(0, Math.min(100, pct));
    const cls = tone ? " " + tone : "";
    return el("div", { class: "bar" + cls }, [el("i", { style: `width:${p}%` })]);
  }
  function toneFor(pct) { return pct >= 100 ? "bad" : pct >= 85 ? "warn" : "good"; }

  // --- Anel SVG (progresso circular) ----------------------------------
  function ring(pct, { size = 120, stroke = 11, label, sub, color } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, pct));
    const off = c * (1 - p / 100);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "ring"); svg.setAttribute("width", size); svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    const mk = (extra) => { const ci = document.createElementNS(ns, "circle"); ci.setAttribute("cx", size/2); ci.setAttribute("cy", size/2); ci.setAttribute("r", r); ci.setAttribute("fill", "none"); ci.setAttribute("stroke-width", stroke); for (const k in extra) ci.setAttribute(k, extra[k]); return ci; };
    svg.appendChild(mk({ stroke: "var(--surface-2)" }));
    svg.appendChild(mk({ stroke: color || "var(--accent)", "stroke-linecap": "round", "stroke-dasharray": c, "stroke-dashoffset": off, transform: `rotate(-90 ${size/2} ${size/2})`, style: "transition:stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1)" }));
    if (label != null) { const t = document.createElementNS(ns, "text"); t.setAttribute("x", "50%"); t.setAttribute("y", sub ? "46%" : "52%"); t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", size * .2); t.setAttribute("font-weight", "700"); t.textContent = label; svg.appendChild(t); }
    if (sub) { const t = document.createElementNS(ns, "text"); t.setAttribute("x", "50%"); t.setAttribute("y", "62%"); t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", size * .1); t.setAttribute("fill", "var(--text-soft)"); t.textContent = sub; svg.appendChild(t); }
    return svg;
  }

  // --- Donut categórico (lista de {label,value,color}) -----------------
  // onSelect(part, index): opcional — se dado, cada fatia fica tocável (destaca-se a si
  // própria, esbate as outras) e chama onSelect ao ser tocada. Quem chama trata do resto
  // (ex.: mostrar o detalhe da fatia, ligar a legenda) — o donut só sabe desenhar e avisar.
  function donut(parts, { size = 150, stroke = 22, onSelect } = {}) {
    const ns = "http://www.w3.org/2000/svg";
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2;
    const total = parts.reduce((a, b) => a + b.value, 0) || 1;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    let acc = 0;
    const base = document.createElementNS(ns, "circle");
    base.setAttribute("cx", cx); base.setAttribute("cy", cx); base.setAttribute("r", r); base.setAttribute("fill", "none"); base.setAttribute("stroke", "var(--surface-2)"); base.setAttribute("stroke-width", stroke);
    svg.appendChild(base);
    parts.forEach((p, i) => {
      if (p.value <= 0) return;
      const frac = p.value / total;
      const ci = document.createElementNS(ns, "circle");
      ci.setAttribute("cx", cx); ci.setAttribute("cy", cx); ci.setAttribute("r", r); ci.setAttribute("fill", "none");
      ci.setAttribute("stroke", p.color); ci.setAttribute("stroke-width", stroke);
      ci.setAttribute("stroke-dasharray", `${c * frac} ${c * (1 - frac)}`);
      ci.setAttribute("stroke-dashoffset", -c * acc);
      ci.setAttribute("transform", `rotate(-90 ${cx} ${cx})`);
      ci.dataset.idx = i;
      ci.style.transition = "opacity .15s";
      if (onSelect) {
        ci.setAttribute("pointer-events", "stroke");
        ci.style.cursor = "pointer";
        ci.addEventListener("click", () => onSelect(p, i));
      }
      svg.appendChild(ci);
      acc += frac;
    });
    return svg;
  }

  /** Donut + legenda + total central, com interatividade: tocar numa fatia (ou na
   *  linha da legenda correspondente) mostra o nome/valor/percentagem dessa fatia no
   *  centro do anel e esbate as restantes; tocar de novo volta ao total. Usado nos
   *  gráficos de categorias das Finanças. Com onOpen(part) definido, o detalhe da
   *  fatia ganha um link "Ver movimentos" que chama onOpen — quem chama decide o que
   *  mostrar (ex.: a lista de transações dessa categoria). */
  function donutCard({ title, parts, totalValue, totalLabel, legendLimit = 7, empty, onOpen } = {}) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    if (!parts.length) return el("div", { class: "card" }, [title ? el("strong", { text: title }) : null, el("div", { class: "empty tiny", html: empty || "—" })].filter(Boolean));

    const centerEl = el("div", { style: "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 12px;text-align:center;gap:1px" });
    const fitText = (text) => el("div", { class: "num", style: "font-weight:800;font-size:1.05rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text });
    function showTotal() {
      centerEl.innerHTML = "";
      centerEl.appendChild(fitText(totalValue));
      centerEl.appendChild(el("div", { class: "tiny muted", style: "font-size:.62rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text: totalLabel || "" }));
    }
    function showPart(p) {
      centerEl.innerHTML = "";
      centerEl.appendChild(el("div", { class: "tiny", style: "font-weight:750;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text: p.label }));
      centerEl.appendChild(fitText(eur0(p.value)));
      centerEl.appendChild(el("div", { class: "tiny muted", style: "font-size:.62rem", text: Math.round(p.value / total * 100) + "%" }));
      if (onOpen) centerEl.appendChild(el("div", { class: "tiny", style: "font-size:.6rem;font-weight:750;color:var(--accent);margin-top:2px;cursor:pointer", text: "Ver movimentos ›", onclick: (e) => { e.stopPropagation(); onOpen(p); } }));
    }
    let selectedIdx = null;
    const legendRows = [];
    function paintSelection() {
      [...svg.querySelectorAll("circle[data-idx]")].forEach((c) => { c.style.opacity = (selectedIdx === null || Number(c.dataset.idx) === selectedIdx) ? "1" : ".3"; });
      legendRows.forEach((row, i) => row.classList.toggle("sel", selectedIdx === i));
    }
    function select(i) {
      selectedIdx = selectedIdx === i ? null : i;
      if (selectedIdx === null) showTotal(); else showPart(parts[selectedIdx]);
      paintSelection();
    }
    const svg = donut(parts, { size: 132, onSelect: (p, i) => select(i) });
    showTotal();
    const legend = el("div", { class: "legend", style: "flex:1" }, parts.slice(0, legendLimit).map((p, i) => {
      const row = el("div", { class: "lg", dataset: { idx: i }, onclick: () => select(i) }, [
        el("span", { class: "nm" }, [el("span", { class: "sw", style: "background:" + p.color }), el("span", { class: "tiny", text: p.label })]),
        el("span", { class: "vl tiny", text: eur0(p.value) + " · " + Math.round(p.value / total * 100) + "%" }),
      ]);
      legendRows.push(row);
      return row;
    }));
    return el("div", { class: "card" }, [
      title ? el("strong", { text: title }) : null,
      el("div", { class: "row", style: "gap:18px;margin-top:14px;align-items:center" }, [
        el("div", { class: "ringwrap", style: "flex:none;position:relative" }, [svg, centerEl]),
        legend,
      ]),
    ].filter(Boolean));
  }

  // --- Mini gráfico de barras / linha (histórico) ----------------------
  function sparkBars(values, { height = 60, color = "var(--accent)", labels } = {}) {
    const max = Math.max(1, ...values.map((v) => Math.abs(v)));
    const wrap = el("div", { class: "row", style: `align-items:flex-end;gap:6px;height:${height}px` });
    values.forEach((v, i) => {
      const h = Math.max(3, (Math.abs(v) / max) * height);
      const col = el("div", { style: "flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:4px;align-items:center" }, [
        el("div", { style: `width:100%;max-width:34px;height:${h}px;border-radius:5px;background:${v < 0 ? "var(--bad)" : color};opacity:${0.45 + 0.55 * (Math.abs(v) / max)}` }),
        labels ? el("div", { class: "tiny muted", style: "font-size:.62rem", text: labels[i] || "" }) : null,
      ]);
      wrap.appendChild(col);
    });
    return wrap;
  }

  // Gráfico de linha (escala min–max) — ideal para peso/património
  function lineChart(values, { height = 70, color = "var(--accent)", labels } = {}) {
    const w = 300, h = height, pad = 8;
    const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1, n = values.length;
    const X = (i) => (n <= 1 ? w / 2 : pad + i * (w - 2 * pad) / (n - 1));
    const Y = (v) => pad + (1 - (v - min) / range) * (h - 2 * pad);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("width", "100%"); svg.setAttribute("height", h); svg.setAttribute("preserveAspectRatio", "none");
    const poly = document.createElementNS(ns, "polyline");
    poly.setAttribute("points", values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" "));
    poly.setAttribute("fill", "none"); poly.setAttribute("stroke", color); poly.setAttribute("stroke-width", "2.5");
    poly.setAttribute("stroke-linecap", "round"); poly.setAttribute("stroke-linejoin", "round"); poly.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(poly);
    // ponto final em HTML (num SVG com preserveAspectRatio="none" um círculo ficaria esticado)
    const dot = el("span", { style: `position:absolute;left:${(X(n - 1) / w * 100).toFixed(2)}%;top:${Y(values[n - 1]).toFixed(1)}px;width:9px;height:9px;border-radius:50%;background:${color};transform:translate(-50%,-50%)` });
    const wrap = el("div", { style: "margin-top:8px" }, [el("div", { style: "position:relative" }, [svg, dot])]);
    if (labels) wrap.appendChild(el("div", { class: "row", style: "justify-content:space-between;margin-top:2px" }, [el("span", { class: "tiny muted", text: labels[0] }), el("span", { class: "tiny muted", text: labels[labels.length - 1] })]));
    return wrap;
  }

  // Paleta categórica (série 1-8, ver --series-N em base.css).
  const PALETTE = ["var(--series-1)","var(--series-2)","var(--series-3)","var(--series-4)","var(--series-5)","var(--series-6)","var(--series-7)","var(--series-8)"];
  // Cor determinística por nome — só para usos isolados (uma cor de cada vez, sem mais
  // nenhuma à vista para comparar). NÃO usar para colorir uma lista inteira: com só 8 cores,
  // duas categorias quaisquer têm forte probabilidade de calhar na mesma cor por acaso
  // (ex.: "Supermercado" e "Outros" no mesmo gráfico) — foi exatamente o bug reportado.
  function colorFor(str) {
    let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  // Cores para uma lista de N categorias mostradas AO MESMO TEMPO (ex.: fatias de um donut):
  // atribui por posição, garantindo que nenhuma se repete enquanto N <= 8. A cor de cada
  // categoria pode mudar de um dia para o outro se a lista/ordem mudar — aceitável, porque
  // a legenda ao lado de cada fatia já identifica a categoria pelo nome, não pela cor.
  function colorsForCount(n) {
    const out = []; for (let i = 0; i < n; i++) out.push(PALETTE[i % PALETTE.length]); return out;
  }

  function svgIcon(path, size = 24) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /** Protege um botão contra duplo-toque/duplo-clique (evita criar o mesmo registo 2x).
   *  Desativa o botão de imediato; volta a ativá-lo passado `cooldownMs` (o botão pode já
   *  não existir se o handler fechou um sheet — nesse caso não faz nada). */
  function guardClick(fn, cooldownMs = 700) {
    return function (e) {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      setTimeout(() => { if (btn && btn.isConnected) btn.disabled = false; }, cooldownMs);
      return fn(e);
    };
  }

  // Navegador de datas: ‹  [Hoje / data]  › — clicar no centro volta a hoje
  function dateNav(curIso, onChange) {
    const isToday = curIso === todayISO();
    const d = new Date(curIso + "T00:00:00");
    const yest = isoDate(new Date(Date.now() - 86400000));
    const tom = isoDate(new Date(Date.now() + 86400000));
    let label = isToday ? "Hoje" : curIso === yest ? "Ontem" : curIso === tom ? "Amanhã"
      : d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
    const shift = (n) => { const nd = new Date(curIso + "T00:00:00"); nd.setDate(nd.getDate() + n); onChange(isoDate(nd)); };
    return el("div", { class: "row", style: "justify-content:center;gap:8px;margin:2px 0 12px" }, [
      el("button", { class: "btn btn-ghost btn-sm", text: "‹", onclick: () => shift(-1) }),
      el("button", { class: "btn " + (isToday ? "btn-soft" : "btn-primary") + " btn-sm", style: "min-width:140px", text: label, title: "Voltar a hoje", onclick: () => onChange(todayISO()) }),
      el("button", { class: "btn btn-ghost btn-sm", text: "›", onclick: () => shift(1) }),
    ]);
  }


  // --- Ícones (traço, 24×24, estilo Lucide) -----------------------------
  const ICONS = {
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    up: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    down: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
    right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    left: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    bank: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    repeat: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    piggy: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    notes: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    cloudOff: '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  function icon(name, size = 20) { return svgIcon(ICONS[name] || "", size); }

  /** Menu flutuante ancorado a um botão: items = [{ label, icon, onClick }]. Fecha ao tocar fora. */
  function popover(anchor, items) {
    document.querySelectorAll(".popover").forEach((p) => p.remove());
    const r = anchor.getBoundingClientRect();
    const menu = el("div", { class: "popover", style: `top:${r.bottom + window.scrollY + 8}px;right:${Math.max(12, document.documentElement.clientWidth - r.right)}px` },
      items.map((it) => el("button", { class: "popover-item", html: (it.icon ? icon(it.icon, 18) : "") + `<span>${it.label}</span>`, onclick: () => { menu.remove(); it.onClick(); } })));
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener("click", function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", off); } }), 0);
    return menu;
  }

  global.UI = { el, $, $$, clear, eur, eur0, num, todayISO, isoDate, monthKey, prettyDate, prettyMonth, MONTHS, DAYS, pad,
    toast, undo, sheet, confirm, field, bar, toneFor, ring, donut, donutCard, sparkBars, lineChart, colorFor, colorsForCount, svgIcon, icon, ICONS, popover, uid, dateNav, guardClick };
})(window);
