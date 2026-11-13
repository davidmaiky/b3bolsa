export interface RebalanceRow {
  assetClass: string;
  current: number; // R$ hoje
  currentPct: number;
  targetPct: number;
  deviationPp: number; // atual − meta, em pontos percentuais (positivo = acima da meta)
  diffToTarget: number; // R$ a comprar (+) ou vender (−) para chegar na meta sem aporte
  contribution: number; // parcela do aporte sugerida para a classe
  afterPct: number; // % da classe depois do aporte
}

/**
 * Metas por classe. Sem aporte, mostra o desvio e o que comprar/vender para zerá-lo.
 * Com aporte, distribui o dinheiro só nas classes abaixo da meta (sem vender nada), na proporção do que falta
 * para cada uma chegar à meta sobre o patrimônio já incluindo o aporte.
 */
export function rebalance(current: Record<string, number>, targets: Record<string, number>, contribution = 0): RebalanceRow[] {
  const classes = [...new Set([...Object.keys(current), ...Object.keys(targets)])];
  const total = classes.reduce((s, c) => s + Math.max(0, current[c] ?? 0), 0);
  const after = total + Math.max(0, contribution);

  const need: Record<string, number> = {};
  for (const c of classes) need[c] = Math.max(0, ((targets[c] ?? 0) / 100) * after - (current[c] ?? 0));
  const needSum = Object.values(need).reduce((s, v) => s + v, 0);
  const x = Math.max(0, contribution);

  return classes
    .map((c) => {
      const cur = Math.max(0, current[c] ?? 0);
      const target = targets[c] ?? 0;
      const contrib = needSum > 0 && x > 0 ? (need[c] * x) / needSum : 0;
      return {
        assetClass: c,
        current: cur,
        currentPct: total ? (cur / total) * 100 : 0,
        targetPct: target,
        deviationPp: (total ? (cur / total) * 100 : 0) - target,
        diffToTarget: (target / 100) * total - cur,
        contribution: contrib,
        afterPct: after ? ((cur + contrib) / after) * 100 : 0,
      };
    })
    .sort((a, b) => b.targetPct - a.targetPct || b.current - a.current);
}
