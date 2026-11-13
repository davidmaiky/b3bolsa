# Publicar no Easypanel

A Carteira Global roda como **um único container** (Next.js + SQLite em um volume). O repositório já traz tudo o que o Easypanel precisa: `Dockerfile`, `docker-entrypoint.sh` e a rota de saúde `/api/health`.

> **Uma réplica só.** A conexão com a LSE, o serviço de preços e o monitor de alertas ficam na memória do processo, e o plano gratuito da LSE permite 1 conexão por chave. Não escale para 2 instâncias e **não deixe o servidor local ligado com a mesma `LSE_API_KEY`** enquanto o do Easypanel estiver no ar (um derruba a conexão do outro).

## 1. Coloque o código no GitHub

O Easypanel faz o build a partir de um repositório. Crie um repositório **privado** e envie o código (o `.env` e o banco já são ignorados pelo git):

```bash
gh repo create carteira-global --private --source=. --remote=origin --push
```

Sem o `gh`, crie o repositório vazio em github.com e rode `git remote add origin <url>` e `git push -u origin main` (faça merge da branch `feat/portfolio-tracker` na `main` antes, se quiser publicar a `main`).

## 2. Crie o app no Easypanel

1. **Projeto** → **+ Serviço** → **App**.
2. **Origem (Source)**: GitHub, escolha o repositório e a branch.
3. **Build**: tipo **Dockerfile** (caminho `Dockerfile`).
4. **Ambiente (Environment)**: cole as variáveis abaixo (uma por linha, `NOME=valor`).
5. **Montagens (Mounts)**: adicione um **Volume** com o caminho de montagem **`/data`**. É onde fica o banco (`/data/app.db`); sem o volume você perde tudo a cada deploy.
6. **Domínios**: adicione seu domínio, porta **3000**, com HTTPS ligado (Let's Encrypt automático).
7. **Avançado → Health check**: caminho `/api/health`.
8. **Implantar (Deploy)**.

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `APP_PASSWORD` | **sim** | Senha de acesso ao site. Em produção o app **não atende** enquanto ela não existir. Use uma senha longa. |
| `AUTH_SECRET` | sim | Assina o cookie de sessão. Gere com `openssl rand -hex 32`. |
| `LSE_API_KEY` | recomendada | Cotações em tempo real (EUA, cripto, moedas). |
| `GEMINI_API_KEY` | para a IA | Sugestões de compra e venda. |
| `GEMINI_MODEL` | não | Padrão `gemini-2.5-flash`. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | não | Alertas de preço pelo Telegram. |
| `DATABASE_URL` | não | Já vem como `file:/data/app.db` na imagem. Só mude se trocar o caminho do volume. |
| `ALLOW_NO_AUTH` | não | `1` libera o site sem senha. **Não use em um endereço público.** |

## 3. Primeiro acesso

Abra o domínio, entre com a `APP_PASSWORD` e adicione seus ativos. O container cria as tabelas sozinho na partida (`prisma db push`). Se uma atualização futura tiver uma mudança de banco que apagaria dados, o container **para** em vez de apagar: veja os logs.

Para trazer os dados do seu computador, com acesso SSH ao servidor:

```bash
docker cp prisma/dev.db $(docker ps -qf name=<nome-do-app>):/data/app.db
```

Reinicie o app depois (o entrypoint acerta o dono do arquivo).

## 4. Atualizar

`git push` e clique em **Implantar** (ou ligue o deploy automático por webhook no Easypanel). Os dados ficam no volume.

## 5. Backup

O banco é um arquivo. No **Console** do app no Easypanel:

```bash
sqlite3 /data/app.db ".backup '/data/backup-$(date +%F).db'"
```

Isso gera uma cópia consistente mesmo com o app rodando. Baixe-a do servidor (ou agende o comando em **Cron Jobs**) e guarde fora da máquina. Apague cópias antigas de tempos em tempos para não encher o volume.

## 6. Instalar no celular

Com o domínio em HTTPS, o app pode ser instalado (PWA). No Android, "Instalar app" no navegador ou o botão no topo; no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início". O manifest, os ícones e o service worker são liberados sem login (o navegador os busca sem cookie); todo o resto continua atrás da senha.

## 7. Observações de produção

- **HTTPS**: o Easypanel termina o TLS. O app marca o cookie de sessão como `Secure` quando o proxy informa HTTPS (`x-forwarded-proto`).
- **Bloqueio de tentativas**: 5 senhas erradas bloqueiam o IP por 5 minutos.
- **Yahoo Finance**: é uma API não oficial e às vezes limita IPs de datacenter. Se as cotações da B3 ou os fundamentos falharem no servidor, o indicador "Yahoo" no topo fica vermelho; tente novamente mais tarde ou reinicie o app. Ativos EUA, cripto e moedas continuam pela LSE.
- **Memória**: o build usa cerca de 1 GB; depois de pronto o app roda com bem menos.
- **Testar a imagem localmente** (precisa do Docker): `docker compose up --build` e abra http://localhost:3000.
