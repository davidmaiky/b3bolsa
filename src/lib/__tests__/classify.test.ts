import { describe, expect, it } from "vitest";
import { classifyB3, hasFundamentals, isB3Listed } from "../classify";

describe("classifyB3", () => {
  it("recognizes FIIs by name", () => {
    expect(classifyB3("HGLG11", "EQUITY", "CSHG LOGISTICA FDO INV IMOB - FII")).toBe("FII");
    expect(classifyB3("MXRF11", "ETF", "MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO")).toBe("FII");
  });
  it("recognizes ETFs and keeps units and stocks as stocks", () => {
    expect(classifyB3("BOVA11", "ETF", "ISHARES IBOVESPA FUNDO DE ÍNDICE")).toBe("ETF");
    expect(classifyB3("IVVB11", "ETF", "iShares S&P 500 FIC FI")).toBe("ETF");
    expect(classifyB3("TAEE11", "EQUITY", "TRANSMISSORA ALIANCA DE ENERGIA ELETRICA SA")).toBe("B3");
    expect(classifyB3("PETR4", "EQUITY", "PETROBRAS PN")).toBe("B3");
  });
  it("class helpers", () => {
    expect(isB3Listed("FII")).toBe(true);
    expect(isB3Listed("US")).toBe(false);
    expect(hasFundamentals("US")).toBe(true);
    expect(hasFundamentals("CRYPTO")).toBe(false);
  });
});
