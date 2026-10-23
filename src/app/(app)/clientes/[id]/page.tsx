import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { cuit, fecha, moneda, nombreTipo, numeroComprobante } from "@/lib/format";
import { EstadoBadge } from "@/components/mensaje";
import { PuntosVenta } from "./puntos-venta";
import { ConexionArca } from "./certificado";
import { infoCertificado } from "@/lib/arca/wsaa";

const CONDICION = {
  RESPONSABLE_INSCRIPTO: "Responsable Inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
} as const;

export default async function ClientePage({ params }: PageProps<"/clientes/[id]">) {
  const contador = await requireContador();
  const { id } = await params;
  const cliente = await db.cliente.findFirst({
    where: { id, contadorId: contador.id },
    include: {
      puntosVenta: { orderBy: { numero: "asc" } },
      receptores: { orderBy: { razonSocial: "asc" }, take: 6 },
      _count: { select: { receptores: true } },
      comprobantes: { orderBy: { createdAt: "desc" }, take: 15, include: { puntoVenta: true } },
    },
  });
  if (!cliente) notFound();

  let cert: { alias?: string; vence: string } | null = null;
  try {
    if (cliente.certPem) {
      const info = infoCertificado(cliente.certPem);
      cert = { alias: info.alias, vence: fecha(info.validoHasta) };
    }
  } catch {
    cert = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/clientes" className="text-sm text-slate-500 hover:underline">← Clientes</Link>
          <h1 className="h1">{cliente.razonSocial}</h1>
          <p className="text-sm text-slate-600">
            CUIT {cuit(cliente.cuit)} · {CONDICION[cliente.condicionIva]} · {cliente.domicilio}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/clientes/${cliente.id}/editar`} className="btn-secondary">Editar</Link>
          <Link href={`/clientes/${cliente.id}/facturar`} className="btn">Nueva factura</Link>
        </div>
      </div>

      <details className="card group" open={!(cert && cliente.arcaVerificadoAt && cliente.puntosVenta.length)}>
        <summary className="h2 cursor-pointer list-none">
          Conexión con ARCA{" "}
          <span className="text-sm font-normal text-slate-500">
            {cert && cliente.arcaVerificadoAt && cliente.puntosVenta.length ? "· conectada" : "· pendiente"}
          </span>
        </summary>
        <div className="mt-4">
          <ConexionArca
            clienteId={cliente.id}
            razonSocial={cliente.razonSocial}
            tieneClave={Boolean(cliente.keyEnc)}
            cert={cert}
            puntosVenta={cliente.puntosVenta.length}
            verificado={cliente.arcaVerificadoAt ? cliente.arcaVerificadoAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : null}
          />
        </div>
      </details>

      <section className="card space-y-4">
        <h2 className="h2">Puntos de venta</h2>
        <PuntosVenta clienteId={cliente.id} puntos={cliente.puntosVenta} />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">
            Sus clientes <span className="text-sm font-normal text-slate-500">({cliente._count.receptores})</span>
          </h2>
          <Link href={`/clientes/${cliente.id}/compradores`} className="btn-secondary">
            {cliente._count.receptores ? "Ver y administrar" : "+ Agregar clientes"}
          </Link>
        </div>
        {cliente.receptores.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cliente.receptores.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.razonSocial}</p>
                  <p className="font-mono text-xs text-slate-500">{r.docTipo === 96 ? `DNI ${r.docNro}` : cuit(r.docNro)}</p>
                </div>
                <Link
                  href={`/clientes/${cliente.id}/facturar?comprador=${r.id}`}
                  className="ml-2 shrink-0 text-indigo-600 hover:underline"
                >
                  Facturar
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">
            Guardá a quién le factura este cliente para no tener que cargar sus datos cada vez.
          </p>
        )}
      </section>

      <section className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="h2">Últimos comprobantes</h2>
          <Link href={`/comprobantes?cliente=${cliente.id}`} className="text-sm text-indigo-600 hover:underline">Ver todos</Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Comprobante</th>
              <th>Receptor</th>
              <th className="text-right">Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cliente.comprobantes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td>{fecha(c.fecha)}</td>
                <td>
                  <Link href={`/comprobantes/${c.id}`} className="hover:text-indigo-600">
                    {nombreTipo(c.tipo)} {numeroComprobante(c.puntoVenta.numero, c.numero)}
                  </Link>
                </td>
                <td>{c.receptorNombre}</td>
                <td className="text-right">{moneda(c.impTotal)}</td>
                <td><EstadoBadge estado={c.estado} /></td>
              </tr>
            ))}
            {!cliente.comprobantes.length && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-500">Sin comprobantes todavía.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
