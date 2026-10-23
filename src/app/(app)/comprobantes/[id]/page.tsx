import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { ALICUOTAS_IVA, CONCEPTOS, CONDICIONES_IVA_RECEPTOR, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO } from "@/lib/arca/constants";
import { cuit, fecha, moneda, nombreTipo, numeroComprobante } from "@/lib/format";
import { EstadoBadge } from "@/components/mensaje";
import { VerificarButton } from "./verificar-button";

export default async function ComprobantePage({ params, searchParams }: PageProps<"/comprobantes/[id]">) {
  const contador = await requireContador();
  const { id } = await params;
  const { nuevo } = await searchParams;
  const c = await db.comprobante.findFirst({
    where: { id, cliente: { contadorId: contador.id } },
    include: {
      cliente: true,
      puntoVenta: true,
      items: true,
      asociado: { include: { puntoVenta: true } },
      asociadas: { include: { puntoVenta: true } },
    },
  });
  if (!c) notFound();

  const obs = (Array.isArray(c.observaciones) ? c.observaciones : []) as { code?: string; msg: string }[];
  const esFactura = TIPOS_COMPROBANTE[c.tipo]?.clase === "F";

  return (
    <div className="max-w-4xl space-y-6">
      {nuevo && c.estado === "AUTORIZADO" && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ Comprobante autorizado por ARCA. CAE {c.cae}.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/clientes/${c.clienteId}`} className="text-sm text-slate-500 hover:underline">← {c.cliente.razonSocial}</Link>
          <h1 className="h1">
            {nombreTipo(c.tipo)} {numeroComprobante(c.puntoVenta.numero, c.numero)}
          </h1>
          <div className="mt-1"><EstadoBadge estado={c.estado} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.estado === "AUTORIZADO" && (
            <>
              <a href={`/api/comprobantes/${c.id}/pdf?descargar=1`} className="btn">Descargar PDF</a>
              <a href={`/api/comprobantes/${c.id}/pdf`} target="_blank" className="btn-secondary">Abrir para imprimir</a>
            </>
          )}
          {c.estado === "AUTORIZADO" && esFactura && (
            <Link href={`/clientes/${c.clienteId}/facturar?asociado=${c.id}`} className="btn-secondary">
              Emitir nota de crédito
            </Link>
          )}
        </div>
      </div>

      {c.estado === "PENDIENTE" && (
        <div className="card space-y-3 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            No recibimos la respuesta de ARCA para este comprobante. Puede que se haya autorizado igual: verificalo
            antes de volver a emitirlo.
          </p>
          <VerificarButton id={c.id} />
        </div>
      )}

      {c.estado === "AUTORIZADO" && (
        <section className="card overflow-hidden p-0">
          <iframe
            src={`/api/comprobantes/${c.id}/pdf#navpanes=0&view=FitH`}
            title={`${nombreTipo(c.tipo)} ${numeroComprobante(c.puntoVenta.numero, c.numero)}`}
            className="block h-[85vh] min-h-[600px] w-full"
          />
        </section>
      )}

      {obs.length > 0 && (
        <div className="card text-sm">
          <p className="mb-1 font-medium">Observaciones de ARCA</p>
          <ul className="list-disc pl-5 text-slate-700">
            {obs.map((o, i) => <li key={i}>{o.code ? `[${o.code}] ` : ""}{o.msg}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card text-sm">
          <h2 className="h2 mb-3">Emisor</h2>
          <p className="font-medium">{c.cliente.razonSocial}</p>
          <p>CUIT {cuit(c.cliente.cuit)}</p>
          <p>{c.cliente.domicilio}</p>
          <p>Punto de venta {c.puntoVenta.numero}</p>
        </section>
        <section className="card text-sm">
          <h2 className="h2 mb-3">Receptor</h2>
          <p className="font-medium">{c.receptorNombre}</p>
          <p>{TIPOS_DOCUMENTO[c.docTipo]} {c.docTipo === 99 ? "" : c.docTipo === 80 ? cuit(c.docNro) : c.docNro}</p>
          <p>{CONDICIONES_IVA_RECEPTOR[c.receptorCondIvaId]}</p>
          {c.receptorDomicilio && <p>{c.receptorDomicilio}</p>}
        </section>
      </div>

      <section className="card text-sm">
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div><dt className="label">Fecha</dt><dd>{fecha(c.fecha)}</dd></div>
          <div><dt className="label">Concepto</dt><dd>{CONCEPTOS[c.concepto]}</dd></div>
          {c.concepto !== 1 && (
            <>
              <div><dt className="label">Período</dt><dd>{fecha(c.fchServDesde)} al {fecha(c.fchServHasta)}</dd></div>
              <div><dt className="label">Vto. pago</dt><dd>{fecha(c.fchVtoPago)}</dd></div>
            </>
          )}
          <div><dt className="label">CAE</dt><dd className="font-mono">{c.cae ?? "—"}</dd></div>
          <div><dt className="label">Vto. CAE</dt><dd>{fecha(c.caeVto)}</dd></div>
          {c.asociado && (
            <div className="col-span-2">
              <dt className="label">Asociado a</dt>
              <dd>
                <Link className="text-indigo-600 hover:underline" href={`/comprobantes/${c.asociado.id}`}>
                  {nombreTipo(c.asociado.tipo)} {numeroComprobante(c.asociado.puntoVenta.numero, c.asociado.numero)}
                </Link>
              </dd>
            </div>
          )}
        </dl>
        {c.asociadas.length > 0 && (
          <p className="mt-3 text-slate-600">
            Notas asociadas:{" "}
            {c.asociadas.map((a) => (
              <Link key={a.id} className="mr-2 text-indigo-600 hover:underline" href={`/comprobantes/${a.id}`}>
                {nombreTipo(a.tipo)} {numeroComprobante(a.puntoVenta.numero, a.numero)}
              </Link>
            ))}
          </p>
        )}
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th className="text-right">Cant.</th>
              <th className="text-right">Precio unit.</th>
              {c.items.some((i) => i.alicuotaIvaId != null) && <th className="text-right">IVA</th>}
              <th className="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.id}>
                <td>{i.descripcion}</td>
                <td className="text-right">{Number(i.cantidad)}</td>
                <td className="text-right">{moneda(i.precioUnitario)}</td>
                {i.alicuotaIvaId != null && <td className="text-right">{ALICUOTAS_IVA[i.alicuotaIvaId]}%</td>}
                <td className="text-right">{moneda(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto grid w-full max-w-72 grid-cols-2 gap-1 p-5 text-sm">
          {Number(c.impIva) > 0 && (
            <>
              <dt className="text-slate-600">Neto gravado</dt><dd className="text-right">{moneda(c.impNeto)}</dd>
              <dt className="text-slate-600">IVA</dt><dd className="text-right">{moneda(c.impIva)}</dd>
            </>
          )}
          <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{moneda(c.impTotal)}</dd>
        </dl>
      </section>
    </div>
  );
}
