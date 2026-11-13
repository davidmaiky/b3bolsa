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
| FIIs e ETFs da B3 (`HGLG11`, `BOVA11`) | Yahoo Finance, atraso de ~15 min | P/VP e VPA do Yahoo; rendimentos pelo histórico de dividendos; vacância informada por você |

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
- `FI_DUE_DAYS` (opcional): quantos dias antes do vencimento da renda fixa avisar (padrão 7)
- `GEMINI_FALLBACK_MODELS` (opcional): modelos reserva separados por vírgula, na ordem de tentativa
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

## Instalar no celular (PWA)

O site pode ser instalado como app, com ícone na tela inicial e abertura em tela cheia:

- **Android / Chrome**: use o botão "Instalar app" no topo da página, ou o menu do navegador → "Instalar app".
- **iPhone / Safari**: Compartilhar → "Adicionar à Tela de Início".
- **Computador (Chrome/Edge)**: ícone de instalação na barra de endereço.

A instalação exige **HTTPS** (como no Easypanel, com domínio) ou `localhost`; pelo IP da rede local em HTTP puro o navegador não oferece. O service worker só é ativado em produção e **não guarda dados financeiros**: páginas e API vão sempre à rede. Sem conexão, aparece uma página avisando. Os ícones são gerados por `node scripts/make-icons.mjs`.

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
6. **IR**: estima o imposto sobre ganho de capital a partir das suas vendas. Ações da B3: 15% ao mês com isenção até R$ 20 mil em vendas; FIIs: 20%, ETFs: 15%, ambos sem isenção; cripto: isenção até R$ 35 mil e 15% acima; exterior: 15% ao ano em reais. Compensa prejuízos de ações, FIIs e ETFs (cada categoria separada), mostra valor e vencimento da DARF (6015), vendas do ano e a posição a custo em 31/12 para Bens e Direitos. É estimativa: não trata day trade, IRRF, dividendos/JCP nem eventos corporativos.
7. **Rebalancear**: defina a meta de alocação por classe (B3, EUA, cripto, moedas, somando 100%) e veja o desvio atual e quanto comprar ou vender para chegar nela. Informando um aporte, o app divide o valor só entre as classes abaixo da meta, sem vender nada. As metas também vão para o Gemini, que passa a considerar o desvio nas sugestões.
8. **Alertas**: avisos de preço de uso único (preço subir ou cair até X, ficar abaixo do teto de Bazin ou do valor de Graham). O servidor monitora as cotações mesmo com o navegador fechado e avisa na tela, pela notificação do navegador e, se configurado, pelo Telegram. Rearme o alerta depois de disparado. O servidor precisa estar ligado.
9. **Sugestões IA**: o Gemini recebe os indicadores de cada ativo da carteira e da watchlist e devolve
   COMPRAR / MANTER / VENDER, confiança, preço-alvo, justificativa e riscos. O histórico fica salvo.
   - **Perfil do investidor** (risco, objetivo, horizonte, concentração máxima por ativo e observações): preencha na própria página; o modelo ajusta as recomendações a ele e cita o perfil quando isso muda a conclusão.
   - **Comparação com pares**: P/L e P/VP do ativo contra a mediana de empresas parecidas (Yahoo). Se não houver pares suficientes do mesmo setor, o app usa os "ativos semelhantes" do Yahoo e avisa que podem ser de outros setores.
   - **Resiliência**: se o modelo principal falhar (cota esgotada, 429, instabilidade 503, modelo removido), o app tenta de novo e passa para os modelos reserva (`gemini-2.5-flash`, `gemini-flash-latest`, `gemini-2.5-flash-lite`, ou a lista em `GEMINI_FALLBACK_MODELS`). A tela mostra qual modelo respondeu e por que os outros falharam.

## FIIs e ETFs

Há classes próprias: **FIIs** e **ETFs B3** (além de Ações B3). Ao buscar um ativo, o app sugere a classe pelo nome; você pode trocar na página do ativo (só entre as três classes da B3). Tickers terminados em 11 também são usados por units de empresas, por isso o app não adivinha só pelo número.

Para FIIs, Graham, Bazin e P/L não se aplicam. A página do ativo mostra **P/VP e desconto/ágio ao VPA, dividend yield mensal (último e médio) e de 12 meses, meses com pagamento (x/12), tendência dos rendimentos e um placar por regras**. O Yahoo não traz **vacância** nem segmento: copie do relatório gerencial mensal do fundo para o cartão "Dados do relatório gerencial"; o Gemini e o placar passam a usar esses números. Os rendimentos entram em Proventos (importar do Yahoo) como "Rendimento".

No IR, FII paga 20% sobre o ganho de capital, sem isenção (rendimentos são isentos para pessoa física e não entram no cálculo). ETF de renda variável paga 15% sem isenção de R$ 20 mil. ETFs entram na análise por momento e volatilidade, como cripto.

## Renda fixa

A página **Renda fixa** controla CDB, LCI, LCA, CRI, CRA, debêntures e **Tesouro Direto**. Não existe cotação pública para os títulos de banco, então o valor é **calculado pelas condições do contrato**, que você cadastra: banco, valor aplicado, datas, rentabilidade, liquidez e se tem FGC.

- **Rentabilidade**: prefixada, **% do CDI**, **CDI + taxa** e **IPCA + taxa**. Prefixado: (1 + taxa)^(dias úteis/252). CDI: produto do CDI diário do Banco Central sobre os dias úteis após a aplicação (feriados nacionais da ANBIMA). IPCA+: o IPCA de cada mês é distribuído pelos dias úteis do mês (convenção da NTN-B) e meses ainda não divulgados repetem o último IPCA. Depois do vencimento o valor para de render.
- **Tesouro Direto**: escolha o título na lista do dia, informe a quantidade e o valor pago. O valor é a quantidade × preço de venda do dia, lido do Tesouro Transparente (marcação a mercado, não a curva). A taxa de custódia da B3 não é descontada.
- **Valor líquido**: desconta IR regressivo (22,5% até 180 dias, 20% até 360, 17,5% até 720, 15% acima) e IOF nos primeiros 30 dias. LCI, LCA, CRI e CRA são isentos de IR para pessoa física.
- **Integração**: o valor líquido entra no patrimônio, no resultado e na alocação da Carteira e é uma classe ("Renda fixa") no Rebalanceamento. Na **Evolução**, cada aplicação rende dia a dia (aporte na data da aplicação, saída no resgate) e aparece a linha "Renda fixa" comparada ao CDI, ao Ibovespa e ao S&P 500; aportes e resgates não contam como ganho.
- **IR**: a página IR ganhou a seção "Renda fixa" por ano: resgates com rendimento líquido e IR retido estimado, rendimento isento (LCI, LCA, CRI, CRA) e a posição em 31/12 para Bens e Direitos. Confira com o informe de rendimentos do banco.
- **Vencimentos**: aviso na tela, notificação do navegador e Telegram quando uma aplicação vence em até 7 dias (`FI_DUE_DAYS` muda o prazo) ou já venceu sem ser resgatada. Cada aviso de Telegram sai uma vez por aplicação.
- **Gemini**: recebe a renda fixa (itens, vencimentos, exposição por emissor frente ao limite do FGC, CDI e IPCA 12 meses do dia) e escreve uma **visão geral da carteira** que aparece na página Sugestões IA, além das sugestões por ativo.
- **Resgate**: marque a aplicação como resgatada (com o valor líquido recebido, ou a estimativa) e ela sai do patrimônio.
- **Limites**: é uma estimativa e o extrato do banco manda. O FGC é só um aviso (limite de R$ 250 mil por CPF e instituição).

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
