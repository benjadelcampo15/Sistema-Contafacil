import * as XLSX from "xlsx";
import { contadorOpcional } from "@/lib/auth";
import { db } from "@/lib/db";
import { CONDICIONES_IVA_RECEPTOR, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO } from "@/lib/arca/constants";
import { cuit, numeroComprobante } from "@/lib/format";
import { leerFiltros, whereComprobantes } from "@/lib/filtros-comprobantes";

const NOTAS_CREDITO = [3, 8, 13];

/** Listado de comprobantes (con los filtros de la pantalla) en Excel. */
export async function GET(req: Request) {
  const contador = await contadorOpcional();
  if (!contador) return new Response("No autorizado", { status: 401 });

  const params = new URL(req.url).searchParams;
  const filtros = leerFiltros((k) => params.get(k));
  const comprobantes = await db.comprobante.findMany({
    where: whereComprobantes(contador.id, filtros),
    orderBy: [{ fecha: "asc" }, { numero: "asc" }],
    take: 10000,
    include: { cliente: true, puntoVenta: true },
  });

  const fechaExcel = (d: Date | null) => (d ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : "");
  const filas = comprobantes.map((c) => {
    const signo = NOTAS_CREDITO.includes(c.tipo) ? -1 : 1;
    return {
      Fecha: fechaExcel(c.fecha),
      "Cliente (emisor)": c.cliente.razonSocial,
      "CUIT emisor": cuit(c.cliente.cuit),
      Comprobante: TIPOS_COMPROBANTE[c.tipo]?.nombre ?? c.tipo,
      Número: numeroComprobante(c.puntoVenta.numero, c.numero),
      Comprador: c.receptorNombre,
      Documento: c.docTipo === 99 ? "Consumidor Final" : `${TIPOS_DOCUMENTO[c.docTipo]} ${c.docTipo === 80 ? cuit(c.docNro) : c.docNro}`,
      "Condición IVA": CONDICIONES_IVA_RECEPTOR[c.receptorCondIvaId] ?? "",
      Neto: signo * Number(c.impNeto),
      IVA: signo * Number(c.impIva),
      Total: signo * Number(c.impTotal),
      Estado: c.estado === "AUTORIZADO" ? "Autorizado" : c.estado === "PENDIENTE" ? "Pendiente" : "Rechazado",
      CAE: c.cae ?? "",
      "Vto. CAE": fechaExcel(c.caeVto),
    };
  });

  const hoja = XLSX.utils.json_to_sheet(filas, { cellDates: true, dateNF: "dd/mm/yyyy" });
  hoja["!cols"] = [12, 28, 15, 18, 16, 28, 26, 26, 14, 12, 14, 12, 16, 12].map((wch) => ({ wch }));
  // Formato numérico de importes
  const rango = XLSX.utils.decode_range(hoja["!ref"] ?? "A1");
  for (let r = 1; r <= rango.e.r; r++) {
    for (const col of [8, 9, 10]) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c: col })];
      if (celda) celda.z = "#,##0.00";
    }
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Comprobantes");
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const sufijo = [filtros.desde, filtros.hasta].filter(Boolean).join("_a_") || new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="comprobantes_${sufijo}.xlsx"`,
    },
  });
}
