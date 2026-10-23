import { zipSync } from "fflate";
import { contadorOpcional } from "@/lib/auth";
import { db } from "@/lib/db";
import { generarPdf } from "@/lib/pdf";
import { leerFiltros, nombreArchivoComprobante, whereComprobantes } from "@/lib/filtros-comprobantes";

const MAXIMO = 300;

/** Todos los PDFs de los comprobantes autorizados que cumplen los filtros, en un .zip. */
export async function GET(req: Request) {
  const contador = await contadorOpcional();
  if (!contador) return new Response("No autorizado", { status: 401 });

  const params = new URL(req.url).searchParams;
  const filtros = leerFiltros((k) => params.get(k));
  const comprobantes = await db.comprobante.findMany({
    where: { ...whereComprobantes(contador.id, filtros), estado: "AUTORIZADO" },
    orderBy: [{ fecha: "asc" }, { numero: "asc" }],
    take: MAXIMO + 1,
    include: { cliente: true, puntoVenta: true, items: true, asociado: { include: { puntoVenta: true } } },
  });
  if (!comprobantes.length) return new Response("No hay comprobantes autorizados con esos filtros", { status: 404 });
  if (comprobantes.length > MAXIMO) {
    return new Response(`Son más de ${MAXIMO} comprobantes: acotá el rango de fechas.`, { status: 400 });
  }

  const archivos: Record<string, Uint8Array> = {};
  for (const c of comprobantes) {
    const carpeta = c.cliente.razonSocial.normalize("NFD").replace(/[^\w-]+/g, "_");
    archivos[`${carpeta}/${nombreArchivoComprobante(c)}`] = await generarPdf(c);
  }
  // Los PDF ya vienen comprimidos: level 0 evita gastar CPU.
  const zip = zipSync(archivos, { level: 0 });

  const sufijo = [filtros.desde, filtros.hasta].filter(Boolean).join("_a_") || new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="comprobantes_${sufijo}.zip"`,
    },
  });
}
