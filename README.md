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
- `GEMINI_MODEL` (opcional): padrão `gemini-2.5-pro`

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

## Uso

1. **Carteira**: adicione ativos (busca por nome ou ticker) e acompanhe patrimônio, resultado do dia, resultado não
   realizado e alocação, tudo em BRL. Preços piscam em verde ou vermelho quando mudam.
2. **Transações**: lance compras e vendas. O preço médio é ponderado e inclui as taxas de compra. Vendas acima da
   posição são recusadas.
3. **Ativo**: gráfico de 12 meses com linhas de preço médio, valor de Graham e preço teto de Bazin; fundamentos,
   critérios de Graham e momento.
4. **Sugestões IA**: o Gemini recebe os indicadores de cada ativo da carteira e da watchlist e devolve
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
