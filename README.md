# Carteira Global

Controle de portfólio de **ações da B3, ações americanas, criptomoedas e moedas**, com cotações em tempo real
pela [London Strategic Edge](https://londonstrategicedge.com/data/#api) e sugestões de compra/venda geradas pelo
**Google Gemini** a partir de P/L, método de Graham, Bazin e outros indicadores.

> As sugestões são geradas por IA e não são recomendação de investimento.

## Fontes de dados

| Classe | Cotação | Fundamentos |
|---|---|---|
| Ações EUA (`AAPL`) | LSE WebSocket, tempo real | Yahoo Finance |
| Cripto (`BTC`) | LSE WebSocket (`BTC/USD`), tempo real | — (momento e volatilidade) |
| Moedas (`USD`, `EUR`) | LSE WebSocket (`USD/BRL`), com Yahoo como reserva | — |
| Ações B3 (`PETR4`) | Yahoo Finance, atraso de ~15 min | Yahoo Finance |

A LSE não cobre a B3 nem fundamentos (P/L, LPA, VPA, ROE). Por isso o Yahoo Finance (`yahoo-finance2`, API não oficial)
entra para B3, fundamentos e como reserva quando a LSE não responde um símbolo.

Limites do plano gratuito da LSE: 60 chamadas REST por minuto, **16 símbolos por conexão** e 1 conexão por socket.
O servidor mantém uma única conexão por socket e repassa os preços para todas as abas do navegador. O par USD/BRL é
assinado primeiro, porque converte as posições em dólar. Símbolos além do limite passam a vir do Yahoo (veja os
detalhes passando o mouse sobre o indicador "LSE" no topo).

## Como rodar

Requisitos: Node 20+.

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha o `.env`:
- `LSE_API_KEY`: crie a chave no Databank em https://londonstrategicedge.com/data
- `GEMINI_API_KEY`: https://aistudio.google.com/apikey
- `APP_PASSWORD` e `AUTH_SECRET` (opcionais): com `APP_PASSWORD` preenchida, o site exige login (cookie de sessão de 30 dias, 5 tentativas erradas bloqueiam por 5 minutos). `AUTH_SECRET`: `openssl rand -hex 32`. Deixe vazias para desativar. Em HTTP puro a senha trafega sem criptografia na rede local; para acesso pela internet use HTTPS
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` (opcionais): para receber os alertas de preço também no Telegram. Crie o bot com o @BotFather, mande uma mensagem para ele e pegue seu chat id com o @userinfobot
- `GEMINI_MODEL` (opcional): padrão `gemini-2.5-flash`, que funciona no plano gratuito. Modelos Pro (ex.: `gemini-3.1-pro-preview`) exigem faturamento ativo na conta do Google AI Studio

```bash
npm run db:push
```

```bash
npm run dev
```

Abra http://localhost:3000.

Para testar a chave da LSE sem subir o app (consulta `/v3/usage` e mostra 10 s de ticks):

```bash
LSE_API_KEY=sua_chave npm run lse:smoke
```

## Publicar em um servidor

O projeto vem com `Dockerfile` e um guia passo a passo para o **Easypanel**: veja [DEPLOY.md](DEPLOY.md). Em produção o site só atende depois de definir `APP_PASSWORD`.

## Uso

1. **Carteira**: adicione ativos (busca por nome ou ticker) e acompanhe patrimônio, resultado do dia, resultado não
   realizado e alocação, tudo em BRL. Preços piscam em verde ou vermelho quando mudam.
2. **Transações**: lance compras e vendas. O preço médio é ponderado e inclui as taxas de compra. Vendas acima da
   posição são recusadas.
3. **Ativo**: gráfico de 12 meses com linhas de preço médio, valor de Graham e preço teto de Bazin; fundamentos,
   critérios de Graham e momento.
4. **Proventos**: lance dividendos, JCP e rendimentos (JCP sugere 15% de IR), ou use "Importar do Yahoo", que traz o histórico por data ex com a quantidade que você tinha na data (valor bruto, sem imposto). Mostra total recebido, últimos 12 meses, média mensal, yield on cost e gráfico por mês.
5. **Evolução**: reconstrói a carteira dia a dia com preços históricos do Yahoo e mostra patrimônio × aportado e a rentabilidade ponderada pelo tempo (aportes não contam como ganho) contra CDI (Banco Central), Ibovespa e S&P 500 em R$, com ou sem proventos. Períodos de 1M a Tudo.
6. **IR**: estima o imposto sobre ganho de capital a partir das suas vendas. Ações da B3: 15% ao mês com isenção até R$ 20 mil em vendas; FII/ETF (tickers terminados em 11): 20%; cripto: isenção até R$ 35 mil e 15% acima; exterior: 15% ao ano em reais. Compensa prejuízos de ações e FII, mostra valor e vencimento da DARF (6015), vendas do ano e a posição a custo em 31/12 para Bens e Direitos. É estimativa: não trata day trade, IRRF, dividendos/JCP nem eventos corporativos.
7. **Rebalancear**: defina a meta de alocação por classe (B3, EUA, cripto, moedas, somando 100%) e veja o desvio atual e quanto comprar ou vender para chegar nela. Informando um aporte, o app divide o valor só entre as classes abaixo da meta, sem vender nada. As metas também vão para o Gemini, que passa a considerar o desvio nas sugestões.
8. **Alertas**: avisos de preço de uso único (preço subir ou cair até X, ficar abaixo do teto de Bazin ou do valor de Graham). O servidor monitora as cotações mesmo com o navegador fechado e avisa na tela, pela notificação do navegador e, se configurado, pelo Telegram. Rearme o alerta depois de disparado. O servidor precisa estar ligado.
9. **Sugestões IA**: o Gemini recebe os indicadores de cada ativo da carteira e da watchlist e devolve
   COMPRAR / MANTER / VENDER, confiança, preço-alvo, justificativa e riscos. O histórico fica salvo.

## Indicadores

- **Valor de Graham**: √(22,5 × LPA × VPA), com margem de segurança = (valor − preço) / valor.
- **Critérios defensivos de Graham**: P/L ≤ 15, P/VP ≤ 1,5, P/L × P/VP ≤ 22,5, LPA positivo, liquidez corrente ≥ 1,5.
- **Preço teto de Bazin**: dividendos dos últimos 12 meses ÷ 6%.
- **Qualidade**: ROE ≥ 15%, dívida/PL ≤ 100%, margem líquida, crescimento de lucro, PEG, EV/EBITDA.
- **Momento** (todas as classes): retornos de 30, 90 e 365 dias, volatilidade anualizada, RSI 14, MM50/MM200.
- **Placar por regras** (−100 a 100): combina os itens acima. Serve de base para o Gemini e de referência sem IA.

## Estrutura

```
src/lib/lse/        cliente REST e hub WebSocket da LSE, mapeamento de símbolos
src/lib/yahoo.ts    cotações B3, fundamentos, histórico e busca
src/lib/prices.ts   serviço único de preços (LSE ao vivo + Yahoo), emite eventos
src/lib/portfolio.ts preço médio, P&L realizado e não realizado, conversão para BRL
src/lib/indicators.ts Graham, Bazin, RSI, momento, placar
src/lib/llm/gemini.ts prompt e saída JSON estruturada do Gemini
src/app/api/stream  Server-Sent Events com as cotações para o navegador
```

## Testes

```bash
npm test
```

Inclui um teste ponta a ponta do hub WebSocket contra um servidor que imita o protocolo da LSE (auth, subscribe,
tick e limite de slots).
