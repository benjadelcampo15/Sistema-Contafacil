import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { cuit, hoyISO } from "@/lib/format";
import { LoteForm } from "./lote-form";

export default async function LotePage({ params }: PageProps<"/clientes/[id]/lote">) {
  const contador = await requireContador();
  const { id } = await params;
  const cliente = await db.cliente.findFirst({
    where: { id, contadorId: contador.id },
    include: { puntosVenta: { orderBy: { numero: "asc" } } },
  });
  if (!cliente) notFound();

  const conectado = Boolean(cliente.certPem || contador.certPem);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-sm text-slate-500 hover:underline">← {cliente.razonSocial}</Link>
        <h1 className="h1">Facturar desde Excel</h1>
        <p className="text-sm text-slate-600">
          Emisor: {cliente.razonSocial} · CUIT {cuit(cliente.cuit)}
        </p>
      </div>

      {!conectado || !cliente.puntosVenta.length ? (
        <div className="card text-sm">
          {cliente.razonSocial} todavía no está lista para facturar.{" "}
          <Link href={`/clientes/${cliente.id}`} className="text-indigo-600 underline">Completar en su ficha</Link>
        </div>
      ) : (
        <LoteForm
          clienteId={cliente.id}
          condicionEmisor={cliente.condicionIva}
          hoy={hoyISO()}
          produccion={contador.ambiente === "PRODUCCION"}
          puntosVenta={cliente.puntosVenta.map((p) => ({ id: p.id, numero: p.numero }))}
        />
      )}
    </div>
  );
}
