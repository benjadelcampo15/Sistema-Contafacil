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

  const listo = Boolean(cert && cliente.arcaVerificadoAt && cliente.puntosVenta.length);

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
        <Link href={`/clientes/${cliente.id}/editar`} className="btn-secondary">Editar datos</Link>
      </div>

      <section id="facturar" className="scroll-mt-24">
        <h2 className="h2 mb-3">Facturar</h2>
        {listo ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <OpcionFacturar
              href={`/clientes/${cliente.id}/facturar`}
              icono="🧾"
              titulo="Una factura"
              texto="Cargás los datos del comprador y los ítems, y la emitís al instante."
            />
            <OpcionFacturar
              href={`/clientes/${cliente.id}/lote`}
              icono="📊"
              titulo="Varias desde Excel"
              texto="Subís una planilla con muchas facturas, las revisás y se emiten todas juntas."
            />
          </div>
        ) : (
          <p className="card text-sm text-amber-900">
            Para poder facturar, primero completá la <strong>Conexión con ARCA</strong> de abajo.
          </p>
        )}
      </section>

      <details className="card group" open={!listo}>
        <summary className="h2 cursor-pointer list-none">
          Conexión con ARCA{" "}
          <span className="text-sm font-normal text-slate-500">{listo ? "· conectada" : "· pendiente"}</span>
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

function OpcionFacturar(props: { href: string; icono: string; titulo: string; texto: string }) {
  return (
    <Link
      href={props.href}
      className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-2xl">{props.icono}</span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold text-slate-900 group-hover:text-indigo-700">{props.titulo} →</span>
        <span className="mt-0.5 block text-sm text-slate-600">{props.texto}</span>
      </span>
    </Link>
  );
}
