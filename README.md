# Finanças

App pessoal de finanças — PWA instalável no telemóvel e no PC, funciona offline, **privada** e sincronizada entre dispositivos. Nasceu da separação do módulo de Finanças da Vida OS.

HTML/CSS/JS puro: sem build, sem dependências, sem servidor próprio.

## Estrutura

```
index.html            App
finance.js            Ecrãs: Resumo, Movimentos, Categorias, Orçamentos, Poupança, Património + separadores personalizados
shared/
  ui.js               Helpers de interface (DOM, sheets, gráficos)
  store.js            Estado local (localStorage, prefixo "financeos:")
  sync.js             Sincronização privada (Supabase Auth + Row Level Security)
  domain.js           Regras de negócio (resumo do mês, património, saldos, categorização)
  app.js              Arranque, Definições, bloqueio com PIN, migração da Vida OS
  base.css            Design system (escuro por defeito; claro ou automático nas Definições)
sw.js                 Service worker (offline)
manifest.webmanifest  PWA (instalável / publicável)
icons/
```

## Pôr online (GitHub Pages)

Settings → Pages → *Deploy from a branch* → `main` / `(root)`. Fica em `https://rblucas2.github.io/finance-os/`.

## Migração da Vida OS

Automática. Todas as páginas `rblucas2.github.io/*` partilham o mesmo armazenamento do browser, por isso na primeira vez que abres a app em cada dispositivo ela copia os dados de Finanças que a Vida OS lá tinha. Os dados da Vida OS ficam intactos.

Se faltar algo: Definições → **Importar dados da Vida OS** (também lê a sincronização antiga da Vida OS) ou **Importar cópia (.json)** (aceita o backup da Vida OS).

## Sincronização privada telemóvel ↔ PC (1x, ~5 min)

Podes usar o mesmo projeto Supabase da Vida OS.

1. **SQL Editor** → corre o SQL que aparece em Definições → *Como configurar* (cria a tabela `finance_state` com Row Level Security: cada linha só é lida/escrita pelo seu dono).
2. **Authentication → Users → Add user → Create new user**: o teu email + palavra-passe, com *Auto Confirm User*.
3. **Authentication → Sign In / Providers** → desliga **Allow new users to sign up**. Assim ninguém mais consegue criar conta no teu projeto.
4. Na app: Definições → URL do projeto + chave pública + email + palavra-passe → *Iniciar sessão*. Repete no outro dispositivo.

### O que fica protegido

- **Dados na cloud:** só acessíveis com o teu login. A chave pública (que está no browser) sozinha não lê nada.
- **Neste dispositivo:** Definições → *Ativar bloqueio com PIN*. Pede o PIN ao abrir e ao voltar depois de 2 min fora.
- **O código** é público (o GitHub Pages grátis exige repositório público), mas não contém dados nenhuns.
- ⚠️ A sincronização antiga da Vida OS (tabela `app_state`) só é protegida pelo "código de sincronização". Depois de migrares, apaga a linha das finanças lá: `delete from app_state where app = 'fin';`

## Instalar / publicar como app

**Instalar (já funciona):** Android/Chrome → menu ⋮ → *Instalar app*. iPhone/Safari → Partilhar → *Adicionar ao ecrã principal*. PC/Chrome/Edge → ícone de instalar na barra de endereço.

**Publicar na Google Play (opcional):** a app cumpre os requisitos de PWA (manifest, ícones 192/512 + maskable, service worker, HTTPS), por isso o pacote Android gera-se sem programar:

1. Abre <https://www.pwabuilder.com>, cola `https://rblucas2.github.io/finance-os/` → *Package for stores* → **Android**.
2. Precisas de uma conta Google Play Developer (25 USD, pagamento único) para submeter o `.aab` gerado. Podes escolher distribuição só para testers internos — continua privada.
3. Para a app abrir sem a barra de endereço do browser, o PWABuilder dá-te um `assetlinks.json` que tem de ficar em `https://rblucas2.github.io/.well-known/assetlinks.json` — ou seja, num repositório chamado `rblucas2.github.io`. Sem isso funciona na mesma, só com uma barra de URL no topo.

A App Store da Apple exige um Mac, conta de programador (99 USD/ano) e revisão manual — não compensa para uma app pessoal; no iPhone usa *Adicionar ao ecrã principal*.
