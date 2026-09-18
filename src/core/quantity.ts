export interface Quantity {
  value: number;
  unit: string;
}

const factors: Record<string, { family: string; factor: number }> = {
  ms: { family: "time", factor: 0.001 }, s: { family: "time", factor: 1 }, min: { family: "time", factor: 60 }, h: { family: "time", factor: 3600 },
  m: { family: "length", factor: 1 }, km: { family: "length", factor: 1000 }, ft: { family: "length", factor: 0.3048 },
  g: { family: "mass", factor: 1 }, kg: { family: "mass", factor: 1000 }, lb: { family: "mass", factor: 453.59237 }
};

export function convertQuantity(quantity: Quantity, targetUnit: string): Quantity {
  const source = factors[quantity.unit];
  const target = factors[targetUnit];
  if (!source || !target || source.family !== target.family || !Number.isFinite(quantity.value)) throw new Error("Incompatible or invalid measurement units");
  return { value: quantity.value * source.factor / target.factor, unit: targetUnit };
}
