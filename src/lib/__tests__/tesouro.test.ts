import { describe, expect, it } from "vitest";
import { parseTesouroLine } from "../rates";

describe("parseTesouroLine", () => {
  it("parses a data row (dates dd/mm/yyyy, decimal comma)", () => {
    expect(parseTesouroLine("Tesouro Selic;01/03/2031;12/11/2026;0,11;0,12;20201,00;20181,99;20181,99")).toEqual({
      title: "Tesouro Selic", maturity: "2031-03-01", date: "2026-11-12", rateSell: 0.12, puSell: 20181.99,
    });
  });
  it("ignores the header, blank lines and rows without a price", () => {
    expect(parseTesouroLine("Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha")).toBeNull();
    expect(parseTesouroLine("")).toBeNull();
    expect(parseTesouroLine("Tesouro Selic;01/03/2031;12/11/2026;0,11;0,12;;;")).toBeNull();
  });
});
