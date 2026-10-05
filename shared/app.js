/* =====================================================================
   app.js — arranque: tema, service worker, bloqueio com PIN,
   migração dos dados da Vida OS e ecrã de Definições.
   ===================================================================== */
(function (global) {
  const { el, $, toast } = UI;

  // ---- Tema: segue o sistema, com override manual opcional ------------
  // Tema: escuro por defeito; "claro" ou "automático" (segue o sistema) nas Definições.
  const themePref = () => Store.get("sys").look || "dark";   // dark | light | auto
  function applyTheme() {
    const pref = themePref();
    document.documentElement.setAttribute("data-theme", pref);
    const isLight = pref === "light" || (pref === "auto" && matchMedia("(prefers-color-scheme: light)").matches);
    let meta = $('meta[name="theme-color"]');
    if (!meta) { meta = el("meta", { name: "theme-color" }); document.head.appendChild(meta); }
    meta.setAttribute("content", isLight ? "#f2f5f1" : "#121a16");
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

  function registerSW() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW falhou", e));
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
  async function promptInstall() {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }
    else toast("No telemóvel: menu do browser → 'Adicionar ao ecrã principal'.", 3600);
  }

  // ---- Bloqueio com PIN (neste dispositivo) ---------------------------
  const RELOCK_MS = 2 * 60 * 1000;
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const hasLock = () => !!(Store.get("sys").lock && Store.get("sys").lock.hash);
  async function setPin(pin) {
    const salt = UI.uid() + UI.uid();
    const hash = await sha256(salt + pin);
    Store.update("sys", (s) => { s.lock = { salt, hash }; }, { silent: true });
  }
  async function checkPin(pin) {
    const l = Store.get("sys").lock; if (!l) return true;
    return (await sha256(l.salt + pin)) === l.hash;
  }

  let lockEl = null;
  function showLock() {
    if (!hasLock() || lockEl) return;
    const input = el("input", { type: "password", inputmode: "numeric", autocomplete: "off", placeholder: "PIN", style: "text-align:center;font-size:1.4rem;letter-spacing:.3em;max-width:220px" });
    const msg = el("div", { class: "tiny", style: "min-height:18px;color:var(--bad)" });
    const tryUnlock = async () => {
      if (await checkPin(input.value)) { lockEl.remove(); lockEl = null; document.body.style.overflow = ""; }
      else { msg.textContent = "PIN errado."; input.value = ""; input.focus(); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    const forgot = el("button", { class: "btn btn-ghost btn-sm", style: "margin-top:24px", text: "Esqueci-me do PIN", onclick: async () => {
      const ok = await UI.confirm("Isto apaga os dados guardados NESTE dispositivo e termina a sessão. Se tens a sincronização ligada, os dados voltam ao iniciares sessão de novo. Continuar?", { ok: "Apagar e desbloquear", danger: true });
      if (!ok) return;
      Object.keys(localStorage).filter((k) => k.startsWith("financeos:")).forEach((k) => localStorage.removeItem(k));
      location.reload();
    }});
    lockEl = el("div", { class: "lockscreen" }, [
      el("div", { class: "lock-ico", html: UI.icon("lock", 28) }),
      el("h2", { text: "Finanças bloqueadas", style: "margin:6px 0 14px" }),
      input,
      el("button", { class: "btn btn-primary", style: "margin-top:12px;min-width:220px", text: "Desbloquear", onclick: tryUnlock }),
      msg, forgot,
    ]);
    document.body.appendChild(lockEl);
    document.body.style.overflow = "hidden";
    setTimeout(() => input.focus(), 50);
  }
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MS) showLock();
  });

  function pinSheet() {
    const f1 = UI.field("Novo PIN (4+ dígitos)", { type: "password", inputmode: "numeric", autocomplete: "new-password" });
    const f2 = UI.field("Repete o PIN", { type: "password", inputmode: "numeric", autocomplete: "new-password" });
    const sh = UI.sheet("Bloqueio com PIN", [
      el("p", { class: "tiny muted", text: "Pede o PIN ao abrir a app e sempre que voltas a ela depois de 2 minutos fora. Só se aplica a este dispositivo." }),
      f1, f2,
      el("button", { class: "btn btn-primary btn-block", text: "Ativar PIN", onclick: async () => {
        const a = f1.input.value.trim(), b = f2.input.value.trim();
        if (!/^\d{4,}$/.test(a)) return toast("O PIN tem de ter pelo menos 4 dígitos.");
        if (a !== b) return toast("Os PINs não coincidem.");
        await setPin(a); sh.close(); toast("PIN ativado 🔒");
      }}),
    ]);
  }

  // ---- Migração dos dados de Finanças da Vida OS ----------------------
  /** Junta dados vindos da Vida OS (ou de um backup) aos atuais, sem perder nada. */
  function mergeIntoFin(incoming) {
    if (!incoming || typeof incoming !== "object") return false;
    const local = Store.get("fin");
    Store.replace("fin", Sync.mergeStates(local, incoming));
    return true;
  }

  /** Na 1ª abertura: se este browser já tem Finanças da Vida OS, traz esses dados automaticamente. */
  function autoMigrate() {
    const sys = Store.get("sys");
    if (sys._migratedFromVidaOS) return;
    const legacy = Store.readLegacy("fin");
    const hasData = legacy && ((legacy.transactions || []).length || (legacy.assets || []).length || (legacy.recurring || []).length);
    Store.update("sys", (s) => {
      s._migratedFromVidaOS = true;
      // reaproveita o projeto Supabase já configurado na Vida OS (só URL/chave pública)
      const old = (Store.readLegacy("sys") || {}).sync;
      if (old && old.url && old.key && !s.cloud) s.cloud = { url: old.url, key: old.key };
    }, { silent: true });
    if (hasData) {
      mergeIntoFin(legacy);
      setTimeout(() => toast(`Importados ${(legacy.transactions || []).length} movimentos da Vida OS ✓`, 3500), 400);
    }
  }

  async function importFromVidaOS() {
    let n = 0;
    const legacy = Store.readLegacy("fin");
    if (legacy) { mergeIntoFin(legacy); n++; }
    const old = (Store.readLegacy("sys") || {}).sync;
    if (old && old.url && old.key && old.code) {
      try { const cloud = await Sync.pullLegacy(old); if (cloud) { mergeIntoFin(cloud); n++; } }
      catch (e) { toast("Não consegui ler a sincronização antiga: " + e.message, 4000); }
    }
    toast(n ? "Dados da Vida OS importados ✓" : "Não encontrei dados da Vida OS neste dispositivo.", 3500);
  }

  // ---- Definições -----------------------------------------------------
  function openSettings() {
    const sys = Store.get("sys");
    const themeSel = UI.field("Tema", { type: "select", value: themePref(),
      options: [{ value: "dark", label: "Escuro" }, { value: "light", label: "Claro" }, { value: "auto", label: "Automático (segue o sistema)" }] });
    themeSel.input.addEventListener("change", () => { Store.update("sys", (s) => { s.look = themeSel.input.value; }, { silent: true }); applyTheme(); });

    // --- Conta e sincronização ---
    const syncState = el("span", { class: "pill" });
    const STATES = { off: ["Desligada", "var(--text-mute)"], signedout: ["Sessão terminada", "var(--warn)"], ready: ["Ligada ✓", "var(--good)"], syncing: ["A sincronizar…", "var(--accent)"], error: ["Erro", "var(--bad)"] };
    const errLine = el("div", { class: "tiny", style: "color:var(--bad)" });
    const unsub = Sync.onStatus((s, detail) => {
      const [t, c] = STATES[s] || STATES.off;
      syncState.innerHTML = `<span class="dot" style="background:${c}"></span>${t}`;
      errLine.textContent = s === "error" ? (detail || "") : "";
    });

    const account = el("div", { class: "stack", style: "gap:10px" });
    function drawAccount() {
      UI.clear(account);
      const cur = Store.get("sys").cloud || {};
      if (Sync.enabled) {
        account.appendChild(el("div", { class: "card pad-sm" }, [
          el("div", { class: "tiny muted", text: "Sessão iniciada como" }),
          el("strong", { text: Sync.email || "—" }),
        ]));
        account.appendChild(el("div", { class: "row", style: "gap:10px" }, [
          el("button", { class: "btn btn-block", text: "↻ Sincronizar agora", onclick: async () => { toast("A sincronizar…"); await Sync.flushAllPending(); await Sync.pullAll(); toast(Sync.status === "error" ? "Falhou — vê o erro acima." : "Sincronizado ✓"); } }),
          el("button", { class: "btn btn-block", text: "Terminar sessão", onclick: async () => { await Sync.signOut(); drawAccount(); toast("Sessão terminada"); } }),
        ]));
        return;
      }
      const fUrl = UI.field("URL do projeto Supabase", { value: cur.url || "", placeholder: "https://xxxx.supabase.co" });
      const fKey = UI.field("Chave pública (anon / publishable)", { value: cur.key || "", placeholder: "sb_publishable_… ou eyJ…" });
      const fEmail = UI.field("Email", { type: "email", autocomplete: "username", value: Sync.email || "" });
      const fPass = UI.field("Palavra-passe", { type: "password", autocomplete: "current-password" });
      const loginBtn = el("button", { class: "btn btn-primary btn-block", text: "Iniciar sessão e sincronizar", onclick: async () => {
        const c = { url: fUrl.input.value, key: fKey.input.value };
        if (!c.url.trim() || !c.key.trim() || !fEmail.input.value.trim() || !fPass.input.value) return toast("Preenche os 4 campos.");
        loginBtn.disabled = true; loginBtn.textContent = "A entrar…";
        try { await Sync.test(c); await Sync.signIn(c, fEmail.input.value, fPass.input.value); toast("Sessão iniciada ✓"); drawAccount(); }
        catch (e) { toast("Falha: " + (/invalid login/i.test(e.message) ? "email ou palavra-passe errados." : e.message), 4500); loginBtn.disabled = false; loginBtn.textContent = "Iniciar sessão e sincronizar"; }
      }});
      account.append(fUrl, fKey, fEmail, fPass, loginBtn);
    }
    drawAccount();

    const help = el("details", { class: "card" }, [
      el("summary", { style: "cursor:pointer;font-weight:600", text: "Como configurar (1x, ~5 min)" }),
      el("ol", { class: "muted tiny", style: "line-height:1.7;padding-left:18px" }, [
        el("li", { html: 'Em <a class="link" href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a> abre o teu projeto (podes usar o mesmo da Vida OS).' }),
        el("li", { text: "SQL Editor → cola o código abaixo → RUN." }),
        el("li", { text: "Authentication → Users → Add user → Create new user: o teu email + palavra-passe, com 'Auto Confirm User' ligado." }),
        el("li", { html: "Authentication → Sign In / Providers → <b>desliga 'Allow new users to sign up'</b>. Assim ninguém mais consegue criar conta." }),
        el("li", { text: "Project Settings → API: copia o URL e a chave pública para os campos acima e inicia sessão. Repete o login no telemóvel." }),
      ]),
      el("pre", { class: "tiny", style: "white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:10px;overflow:auto", text: Sync.sqlSchema }),
    ]);

    // --- Privacidade ---
    const lockRow = el("div", { class: "row", style: "gap:10px" });
    function drawLock() {
      UI.clear(lockRow);
      if (hasLock()) {
        lockRow.append(
          el("button", { class: "btn btn-block", text: "Mudar PIN", onclick: pinSheet }),
          el("button", { class: "btn btn-block", style: "color:var(--bad)", text: "Desligar PIN", onclick: () => { Store.update("sys", (s) => { delete s.lock; }, { silent: true }); drawLock(); toast("PIN desligado"); } }),
        );
      } else lockRow.append(el("button", { class: "btn btn-block", text: "🔒 Ativar bloqueio com PIN", onclick: () => { pinSheet(); } }));
    }
    drawLock();

    // --- Dados ---
    const exportBtn = el("button", { class: "btn btn-block", text: "Exportar cópia de segurança (.json)", onclick: () => {
      const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: "application/json" });
      el("a", { href: URL.createObjectURL(blob), download: `financas-backup-${UI.todayISO()}.json` }).click();
    }});
    const importInput = el("input", { type: "file", accept: "application/json", class: "hide" });
    importInput.addEventListener("change", async () => {
      const f = importInput.files[0]; importInput.value = ""; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        // aceita o backup desta app e também o backup completo da Vida OS (usa só a parte "fin")
        if (!mergeIntoFin(obj.fin)) throw new Error("sem dados");
        toast("Dados importados ✓");
      } catch (e) { toast("Ficheiro inválido — não tem dados de Finanças."); }
    });

    const sh = UI.sheet("Definições", [
      el("div", { class: "section-title", style: "margin-top:4px", text: "Conta e sincronização" }),
      el("div", { class: "row" }, [el("span", { class: "muted tiny", text: "Estado:" }), syncState]), errLine,
      el("p", { class: "tiny muted", style: "margin:0", text: "Os teus dados ficam no Supabase protegidos pela tua conta: só quem inicia sessão com o teu email e palavra-passe os consegue ler." }),
      account, help,
      el("div", { class: "section-title", text: "Privacidade neste dispositivo" }), lockRow,
      el("div", { class: "section-title", text: "Separadores" }),
      el("button", { class: "btn btn-block", text: "✎ Organizar separadores", onclick: () => { sh.close(); global.FinanceApp && global.FinanceApp.manageTabs(); } }),
      el("div", { class: "section-title", text: "Aparência" }), themeSel,
      el("button", { class: "btn btn-soft btn-block", text: "Instalar app no dispositivo", onclick: promptInstall }),
      el("div", { class: "section-title", text: "Dados" }),
      el("button", { class: "btn btn-block", text: "⇣ Importar dados da Vida OS", onclick: importFromVidaOS }),
      exportBtn,
      el("button", { class: "btn btn-block", text: "Importar cópia (.json)", onclick: () => importInput.click() }), importInput,
      el("p", { class: "tiny muted center", style: "margin-top:18px", text: "Finanças · os dados ficam neste dispositivo e na tua conta privada" }),
    ], { onClose: () => unsub() });
  }

  // ---- Onboarding (1ª utilização) -------------------------------------
  function onboard(appId, title, lines) {
    const sys = Store.get("sys");
    if (sys.onboarded && sys.onboarded[appId]) return;
    const ul = el("ul", { class: "muted", style: "line-height:1.7;padding-left:20px;font-size:.92rem" }, lines.map((l) => el("li", { html: l })));
    const s = UI.sheet(title, [
      el("p", { class: "muted tiny", text: "Bem-vindo 👋 — tudo fica guardado no teu dispositivo." }), ul,
      el("button", { class: "btn btn-primary btn-block", text: "Começar", onclick: () => { Store.update("sys", (st) => { st.onboarded = st.onboarded || {}; st.onboarded[appId] = true; }, { silent: true }); s.close(); } }),
    ]);
  }

  const App = {
    boot() {
      Store.ensure("sys", {});
      applyTheme();
      registerSW();
      autoMigrate();
      showLock();
      Sync.init();
      $("#settingsBtn").innerHTML = UI.icon("settings", 22);
      $("#settingsBtn").addEventListener("click", openSettings);
      $("#avatarBtn").addEventListener("click", openSettings);
      // Avatar: inicial do email quando há sessão iniciada; nuvem riscada quando a sincronização está desligada.
      Sync.onStatus((st) => {
        const a = $("#avatarBtn"); const email = Sync.email;
        const on = Sync.enabled && email;
        a.classList.toggle("off", !on);
        if (on) a.textContent = email[0].toUpperCase(); else a.innerHTML = UI.icon("cloudOff", 20);
        a.title = on ? `Sessão: ${email}` + (st === "error" ? " · erro de sincronização" : "") : "Sincronização desligada — toca para ligar";
      });
    },
    applyTheme, promptInstall, openSettings, onboard,
  };
  global.App = App;
})(window);
