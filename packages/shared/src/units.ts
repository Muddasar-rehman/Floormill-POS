export function kgToMun(kg: number, munKg = 40): number {
  return kg / munKg;
}

export function munToKg(mun: number, munKg = 40): number {
  return mun * munKg;
}

export function formatKgAsMun(kg: number, munKg = 40): string {
  const mun = kgToMun(kg, munKg);
  return `${mun.toFixed(2)} mun (${kg.toFixed(1)} kg)`;
}
