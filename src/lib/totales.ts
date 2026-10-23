import { ALICUOTAS_IVA } from "./arca/constants";

export type ItemInput = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIvaId: number | null;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Importes del comprobante. En A/B el precio unitario es SIN IVA; en C es el precio final. */
export function calcularTotales(items: ItemInput[], letra: "A" | "B" | "C") {
  const detalle = items.map((it) => {
    const subtotal = r2(it.cantidad * it.precioUnitario);
    const alicuotaIvaId = letra === "C" ? null : it.alicuotaIvaId;
    const pct = alicuotaIvaId == null ? 0 : ALICUOTAS_IVA[alicuotaIvaId];
    return { ...it, alicuotaIvaId, subtotal, iva: r2((subtotal * pct) / 100) };
  });

  if (letra === "C") {
    const neto = r2(detalle.reduce((s, i) => s + i.subtotal, 0));
    return { items: detalle, impNeto: neto, impIva: 0, impTotal: neto, alicuotas: [] };
  }

  // ARCA valida el IVA agrupado por alícuota
  const porAlicuota = new Map<number, number>();
  for (const i of detalle) {
    const id = i.alicuotaIvaId ?? 5;
    porAlicuota.set(id, r2((porAlicuota.get(id) ?? 0) + i.subtotal));
  }
  const alicuotas = [...porAlicuota].map(([id, baseImp]) => ({
    id,
    baseImp,
    importe: r2((baseImp * ALICUOTAS_IVA[id]) / 100),
  }));
  const impNeto = r2(alicuotas.reduce((s, a) => s + a.baseImp, 0));
  const impIva = r2(alicuotas.reduce((s, a) => s + a.importe, 0));
  return { items: detalle, impNeto, impIva, impTotal: r2(impNeto + impIva), alicuotas };
}
