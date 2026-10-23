import type { Prisma } from "@prisma/client";
import { TIPOS_COMPROBANTE } from "./arca/constants";
import { numeroComprobante } from "./format";

export type Filtros = { cliente: string; estado: string; desde: string; hasta: string };

/** Lee los filtros de la URL (página de comprobantes y descargas usan los mismos). */
export function leerFiltros(get: (k: string) => string | null | undefined): Filtros {
  const v = (k: string) => (get(k) ?? "").trim();
  return { cliente: v("cliente"), estado: v("estado"), desde: v("desde"), hasta: v("hasta") };
}

export function whereComprobantes(contadorId: string, f: Filtros): Prisma.ComprobanteWhereInput {
  return {
    cliente: { contadorId },
    ...(f.cliente && { clienteId: f.cliente }),
    ...(["AUTORIZADO", "PENDIENTE", "RECHAZADO"].includes(f.estado) && {
      estado: f.estado as "AUTORIZADO" | "PENDIENTE" | "RECHAZADO",
    }),
    ...((f.desde || f.hasta) && {
      fecha: {
        ...(/^\d{4}-\d{2}-\d{2}$/.test(f.desde) && { gte: new Date(`${f.desde}T00:00:00Z`) }),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(f.hasta) && { lte: new Date(`${f.hasta}T00:00:00Z`) }),
      },
    }),
  };
}

export const queryFiltros = (f: Filtros) =>
  new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

/** Nombre de archivo para el PDF de un comprobante (sin acentos ni caracteres raros). */
export function nombreArchivoComprobante(c: { tipo: number; numero: number | null; puntoVenta: { numero: number }; cliente: { razonSocial: string } }) {
  return (
    `${TIPOS_COMPROBANTE[c.tipo]?.nombre ?? "Comprobante"}_${numeroComprobante(c.puntoVenta.numero, c.numero)}_${c.cliente.razonSocial}`
      .normalize("NFD")
      .replace(/[^\w-]+/g, "_") + ".pdf"
  );
}
