import { describe, expect, it } from "vitest";
import { parseMoney, parseQty } from "../format";

describe("parseMoney (valores em reais/dólares digitados no padrão brasileiro)", () => {
  it("reads Brazilian thousands and decimals", () => {
    expect(parseMoney("68.800,00")).toBe(68800);
    expect(parseMoney("68.800")).toBe(68800); // o caso que virava 68,8
    expect(parseMoney("68800")).toBe(68800);
    expect(parseMoney("1.234.567,89")).toBe(1234567.89);
    expect(parseMoney("1.234,5")).toBe(1234.5);
    expect(parseMoney("0,5")).toBe(0.5);
    expect(parseMoney("12,34")).toBe(12.34);
    expect(parseMoney("R$ 1.500,00")).toBe(1500);
    expect(parseMoney("US$ 68.800,00")).toBe(68800);
  });
  it("still reads English-style numbers", () => {
    expect(parseMoney("68,800.00")).toBe(68800);
    expect(parseMoney("1,234,567")).toBe(1234567);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("68.8")).toBe(68.8);
    expect(parseMoney("0.500")).toBe(0.5); // zero à esquerda: decimal
    expect(parseMoney("1000.50")).toBe(1000.5);
  });
  it("is NaN for anything that is not a number", () => {
    expect(parseMoney("")).toBeNaN();
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("1,2,3.4,5")).toBeNaN();
    expect(parseMoney("12.34.5")).toBe(12345); // vários pontos = milhares
  });
});

describe("parseQty (quantidades: ponto isolado é decimal)", () => {
  it("keeps a lone dot as a decimal point", () => {
    expect(parseQty("0.5")).toBe(0.5);
    expect(parseQty("1.234")).toBe(1.234);
    expect(parseQty("0,00123")).toBe(0.00123);
    expect(parseQty("100")).toBe(100);
  });
  it("still understands Brazilian thousands when both separators are present", () => {
    expect(parseQty("1.000,5")).toBe(1000.5);
    expect(parseQty("1.000.000")).toBe(1000000);
  });
});
