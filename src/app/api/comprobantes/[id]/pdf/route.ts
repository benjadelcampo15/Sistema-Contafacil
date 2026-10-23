import { contadorOpcional } from "@/lib/auth";
import { db } from "@/lib/db";
import { generarPdf } from "@/lib/pdf";
import { nombreArchivoComprobante } from "@/lib/filtros-comprobantes";

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
  const nombre = nombreArchivoComprobante(c);
  const descargar = new URL(req.url).searchParams.has("descargar");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre}"`,
    },
  });
}
