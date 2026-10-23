import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { cuit } from "@/lib/format";
import { Compradores } from "./compradores";

export default async function CompradoresPage({ params, searchParams }: PageProps<"/clientes/[id]/compradores">) {
  const contador = await requireContador();
  const { id } = await params;
  const q = String((await searchParams).q ?? "").trim();

  const cliente = await db.cliente.findFirst({ where: { id, contadorId: contador.id } });
  if (!cliente) notFound();

  const digitos = q.replace(/\D/g, "");
  const compradores = await db.receptor.findMany({
    where: {
      clienteId: cliente.id,
      ...(q && {
        OR: [
          { razonSocial: { contains: q, mode: "insensitive" } },
          ...(digitos ? [{ docNro: { contains: digitos } }] : []),
        ],
      }),
    },
    orderBy: { razonSocial: "asc" },
  });

  // Cantidad de comprobantes y última factura por comprador (se vinculan por documento)
  const stats = await db.comprobante.groupBy({
    by: ["docTipo", "docNro"],
    where: { clienteId: cliente.id, estado: "AUTORIZADO" },
    _count: true,
    _max: { fecha: true },
  });
  const statsPorDoc = new Map(stats.map((s) => [`${s.docTipo}:${s.docNro}`, { cantidad: s._count, ultima: s._max.fecha }]));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-sm text-slate-500 hover:underline">← {cliente.razonSocial}</Link>
        <h1 className="h1">Clientes de {cliente.razonSocial}</h1>
        <p className="text-sm text-slate-600">
          Las personas o empresas a las que factura {cliente.razonSocial} (CUIT {cuit(cliente.cuit)}). Al facturarles, sus
          datos se completan solos.
        </p>
      </div>

      <Compradores
        clienteId={cliente.id}
        q={q}
        compradores={compradores.map((c) => ({
          id: c.id,
          docTipo: c.docTipo,
          docNro: c.docNro,
          razonSocial: c.razonSocial,
          condicionIvaId: c.condicionIvaId,
          domicilio: c.domicilio ?? "",
          email: c.email ?? "",
          comprobantes: statsPorDoc.get(`${c.docTipo}:${c.docNro}`)?.cantidad ?? 0,
          ultima: statsPorDoc.get(`${c.docTipo}:${c.docNro}`)?.ultima?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
