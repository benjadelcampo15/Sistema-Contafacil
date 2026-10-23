import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { cuit, hoyISO, nombreTipo, numeroComprobante } from "@/lib/format";
import { FacturaForm } from "./factura-form";

export default async function FacturarPage({ params, searchParams }: PageProps<"/clientes/[id]/facturar">) {
  const contador = await requireContador();
  const { id } = await params;
  const { asociado, comprador } = await searchParams;

  const cliente = await db.cliente.findFirst({
    where: { id, contadorId: contador.id },
    include: {
      puntosVenta: { orderBy: { numero: "asc" } },
      receptores: { orderBy: { razonSocial: "asc" } },
      comprobantes: {
        where: { estado: "AUTORIZADO", tipo: { in: [1, 6, 11] } },
        orderBy: { fecha: "desc" },
        take: 100,
        include: { puntoVenta: true },
      },
    },
  });
  if (!cliente) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-sm text-slate-500 hover:underline">
          ← {cliente.razonSocial}
        </Link>
        <h1 className="h1">Nuevo comprobante</h1>
        <p className="text-sm text-slate-600">
          Emisor: {cliente.razonSocial} · CUIT {cuit(cliente.cuit)} ·{" "}
          <Link href={`/clientes/${cliente.id}/lote`} className="text-indigo-600 hover:underline">
            ¿Muchas facturas? Cargalas desde Excel
          </Link>
        </p>
      </div>

      {(!cliente.certPem && !contador.certPem) || !cliente.puntosVenta.length ? (
        <div className="card text-sm">
          {cliente.razonSocial} todavía no está lista para facturar:{" "}
          {!cliente.certPem && !contador.certPem ? "falta conectarla con ARCA" : "falta cargar un punto de venta"}.{" "}
          <Link href={`/clientes/${cliente.id}`} className="text-indigo-600 underline">Completar en su ficha</Link>
        </div>
      ) : (
        <FacturaForm
          clienteId={cliente.id}
          condicionEmisor={cliente.condicionIva}
          hoy={hoyISO()}
          asociadoInicial={typeof asociado === "string" ? asociado : undefined}
          compradorInicial={typeof comprador === "string" ? comprador : undefined}
          puntosVenta={cliente.puntosVenta.map((p) => ({ id: p.id, numero: p.numero, descripcion: p.descripcion }))}
          receptores={cliente.receptores.map((r) => ({
            id: r.id,
            docTipo: r.docTipo,
            docNro: r.docNro,
            nombre: r.razonSocial,
            domicilio: r.domicilio ?? "",
            email: r.email ?? "",
            condicionIvaId: r.condicionIvaId,
          }))}
          facturas={cliente.comprobantes.map((c) => ({
            id: c.id,
            tipo: c.tipo,
            label: `${nombreTipo(c.tipo)} ${numeroComprobante(c.puntoVenta.numero, c.numero)} — ${c.receptorNombre}`,
            docTipo: c.docTipo,
            docNro: c.docNro,
            receptorNombre: c.receptorNombre,
            receptorDomicilio: c.receptorDomicilio ?? "",
            receptorCondIvaId: c.receptorCondIvaId,
            puntoVentaId: c.puntoVentaId,
          }))}
        />
      )}
    </div>
  );
}
