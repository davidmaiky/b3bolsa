"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtNum } from "@/lib/format";
import { ASSET_CLASS_LABEL } from "@/lib/types";
import { CATEGORY_LABEL, type Holding, type MonthRow, type Sale, type YearRow } from "@/lib/tax";

interface Data { months: MonthRow[]; years: YearRow[]; sales: Sale[]; warnings: string[]; holdings: Record<string, Holding[]>; firstYear: number | null }

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;
const dateBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export default function ImpostoPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetch("/api/tax").then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Erro");
      setD(j);
    }).catch((e) => setErr(e.message));
  }, []);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const from = d?.firstYear ?? now;
    return Array.from({ length: now - from + 1 }, (_, i) => now - i);
  }, [d]);

  const months = (d?.months ?? []).filter((m) => m.month.startsWith(String(year)));
  const sales = (d?.sales ?? []).filter((s) => s.date.startsWith(String(year)));
  const foreign = (d?.years ?? []).find((y) => y.year === year);
  const holdings = d?.holdings[String(year)] ?? [];
  const darfTotal = months.reduce((s, m) => s + m.tax, 0);
  const carry = (cat: string) => [...(d?.months ?? [])].filter((m) => m.category === cat && m.month <= `${year}-12`).at(-1)?.carryOut ?? 0;
  const holdingsBrl = holdings.reduce((s, h) => s + h.costBrl, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold mr-auto">Imposto de renda</h1>
        <label className="flex items-center gap-2 text-sm text-muted">Ano
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </label>
      </div>
      <p className="text-xs text-yellow-400/90 border border-yellow-500/30 bg-yellow-500/5 rounded-lg px-3 py-2">
        Estimativa para conferência a partir das suas transações. Não considera day trade, IRRF retido, corretagem rateada por nota nem eventos corporativos, e não substitui a apuração de um contador.
      </p>
      {err && <p className="text-down text-sm">{err}</p>}
      {!d && !err && <p className="text-muted text-sm">Calculando…</p>}

      {d && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={`DARF em ${year} (mensal)`} value={fmtMoney(darfTotal)} sub="ações, FII/ETF e cripto" />
            <Kpi label={`Exterior ${year} (anual)`} value={fmtMoney(foreign?.tax ?? 0)} sub={foreign ? `resultado ${fmtMoney(foreign.net)}` : "sem vendas"} />
            <Kpi label="Prejuízo a compensar (ações)" value={fmtMoney(carry("ACAO"))} sub="saldo no fim do ano" />
            <Kpi label="Prejuízo a compensar (FII)" value={fmtMoney(carry("FII"))} sub="saldo no fim do ano" />
          </section>

          <section className="card p-4">
            <h2 className="font-semibold mb-1">Apuração mensal</h2>
            <p className="text-xs text-muted mb-3">DARF código 6015, vence no último dia útil do mês seguinte (feriados não considerados).</p>
            <Scroll>
              <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
                <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Mês</th><th className="text-left font-normal">Categoria</th><th className="font-normal">Vendas</th><th className="font-normal">Resultado</th><th className="font-normal">Prejuízo usado</th><th className="font-normal">Base</th><th className="font-normal">Imposto</th><th className="font-normal">Vencimento</th></tr></thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month + m.category} className="border-t border-line text-right">
                      <td className="text-left py-2">{monthLabel(m.month)}</td>
                      <td className="text-left text-muted">{CATEGORY_LABEL[m.category]}</td>
                      <td className="num">{fmtMoney(m.sales)}</td>
                      <td className={`num ${m.gain >= 0 ? "text-up" : "text-down"}`}>{fmtMoney(m.gain)}</td>
                      <td className="num text-muted">{m.lossUsed ? fmtMoney(m.lossUsed) : "—"}</td>
                      <td className="num">{m.exempt ? <span className="text-muted">isento</span> : fmtMoney(m.taxable)}</td>
                      <td className={`num ${m.tax > 0 ? "text-down font-semibold" : "text-muted"}`}>{fmtMoney(m.tax)}</td>
                      <td className="num text-muted">{m.tax > 0 ? dateBr(m.due) : "—"}</td>
                    </tr>
                  ))}
                  {months.length === 0 && <tr><td className="text-muted py-3" colSpan={8}>Nenhuma venda em {year}.</td></tr>}
                </tbody>
              </table>
            </Scroll>
          </section>

          {foreign && (
            <section className="card p-4">
              <h2 className="font-semibold mb-1">Ativos no exterior ({year})</h2>
              <p className="text-xs text-muted mb-3">Apuração anual em reais (dólar de cada operação), 15% sobre o ganho líquido, pago na declaração. Lucros e prejuízos do ano se compensam.</p>
              <dl className="text-sm divide-y divide-line max-w-md">
                <Row k="Ganhos" v={fmtMoney(foreign.gain)} />
                <Row k="Perdas" v={fmtMoney(-foreign.loss)} />
                <Row k="Resultado líquido" v={fmtMoney(foreign.net)} />
                <Row k="Imposto estimado (15%)" v={fmtMoney(foreign.tax)} />
              </dl>
            </section>
          )}

          <section className="card p-4">
            <h2 className="font-semibold mb-1">Bens e direitos em 31/12/{year}</h2>
            <p className="text-xs text-muted mb-3">Quantidade e custo de aquisição (o que você pagou, em reais; ativos em dólar pelo câmbio de cada compra).{year === new Date().getFullYear() ? " Para o ano corrente, a posição é a de hoje." : ""}</p>
            <Scroll>
              <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
                <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Ativo</th><th className="text-left font-normal">Classe</th><th className="font-normal">Quantidade</th><th className="font-normal">Custo (moeda do ativo)</th><th className="font-normal">Custo (R$)</th></tr></thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.ticker} className="border-t border-line text-right">
                      <td className="text-left py-2 font-medium">{h.ticker}</td>
                      <td className="text-left text-muted">{ASSET_CLASS_LABEL[h.assetClass]}</td>
                      <td className="num">{fmtNum(h.quantity, 8)}</td>
                      <td className="num">{fmtMoney(h.costNative, h.currency)}</td>
                      <td className="num">{fmtMoney(h.costBrl)}</td>
                    </tr>
                  ))}
                  {holdings.length === 0 && <tr><td className="text-muted py-3" colSpan={5}>Sem posições nesta data.</td></tr>}
                  {holdings.length > 0 && <tr className="border-t border-line text-right font-semibold"><td className="text-left py-2" colSpan={4}>Total</td><td className="num">{fmtMoney(holdingsBrl)}</td></tr>}
                </tbody>
              </table>
            </Scroll>
          </section>

          <section className="card p-4">
            <h2 className="font-semibold mb-3">Vendas em {year}</h2>
            <Scroll>
              <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
                <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Data</th><th className="text-left font-normal">Ativo</th><th className="font-normal">Qtd</th><th className="font-normal">Valor da venda</th><th className="font-normal">Custo</th><th className="font-normal">Resultado</th></tr></thead>
                <tbody>
                  {sales.map((s, i) => (
                    <tr key={i} className="border-t border-line text-right">
                      <td className="text-left py-2 num">{dateBr(s.date)}</td>
                      <td className="text-left">{s.ticker}</td>
                      <td className="num">{fmtNum(s.quantity, 8)}</td>
                      <td className="num">{fmtMoney(s.grossBrl)}</td>
                      <td className="num">{fmtMoney(s.costBrl)}</td>
                      <td className={`num ${s.gainBrl >= 0 ? "text-up" : "text-down"}`}>{fmtMoney(s.gainBrl)}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && <tr><td className="text-muted py-3" colSpan={6}>Nenhuma venda.</td></tr>}
                </tbody>
              </table>
            </Scroll>
          </section>

          <div className="text-[11px] text-muted space-y-1">
            {d.warnings.map((w) => <p key={w} className="text-yellow-400/90">{w}</p>)}
            <p>Regras usadas: ações na B3 pagam 15% sobre o ganho do mês, com isenção quando as vendas do mês somam até R$ 20 mil; FII/ETF pagam 20% sem isenção; cripto: isenção até R$ 35 mil em vendas no mês e 15% acima (prejuízo em cripto não é compensado aqui); exterior: 15% ao ano. Prejuízos de ações e de FII/ETF são compensados com ganhos futuros da mesma categoria. Dividendos e JCP não entram neste cálculo.</p>
          </div>
        </>
      )}
    </div>
  );
}

const Scroll = ({ children }: { children: React.ReactNode }) => <div className="overflow-x-auto">{children}</div>;
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>;
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-lg font-semibold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
