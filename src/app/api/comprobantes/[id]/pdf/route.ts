import { contadorOpcional } from "@/lib/auth";
import { db } from "@/lib/db";
import { generarPdf } from "@/lib/pdf";
import { numeroComprobante } from "@/lib/format";
import { TIPOS_COMPROBANTE } from "@/lib/arca/constants";

export async function GET(req: Request, ctx: RouteContext<"/api/comprobantes/[id]/pdf">) {
  const contador = await contadorOpcional();
  if (!contador) return new Response("No autorizado", { status: 401 });

  const { id } = await ctx.params;
  const c = await db.comprobante.findFirst({
    where: { id, cliente: { contadorId: contador.id }, estado: "AUTORIZADO" },
    include: { cliente: true, puntoVenta: true, items: true, asociado: { include: { puntoVenta: true } } },
  });
  if (!c) return new Response("Comprobante no encontrado", { status: 404 });

  const bytes = await generarPdf(c);
  const nombre =
    `${TIPOS_COMPROBANTE[c.tipo].nombre}_${numeroComprobante(c.puntoVenta.numero, c.numero)}_${c.cliente.razonSocial}`
      .normalize("NFD")
      .replace(/[^\w-]+/g, "_") + ".pdf";
  const descargar = new URL(req.url).searchParams.has("descargar");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre}"`,
    },
  });
}
