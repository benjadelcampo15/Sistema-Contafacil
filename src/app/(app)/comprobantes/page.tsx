import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { fecha, moneda, nombreTipo, numeroComprobante } from "@/lib/format";
import { EstadoBadge } from "@/components/mensaje";

const POR_PAGINA = 50;

export default async function ComprobantesPage({ searchParams }: PageProps<"/comprobantes">) {
  const contador = await requireContador();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const clienteId = str("cliente");
  const estado = str("estado");
  const desde = str("desde");
  const hasta = str("hasta");
  const pagina = Math.max(1, Number(str("pagina")) || 1);

  const where: Prisma.ComprobanteWhereInput = {
    cliente: { contadorId: contador.id },
    ...(clienteId && { clienteId }),
    ...(["AUTORIZADO", "PENDIENTE", "RECHAZADO"].includes(estado) && {
      estado: estado as "AUTORIZADO" | "PENDIENTE" | "RECHAZADO",
    }),
    ...((desde || hasta) && {
      fecha: {
        ...(desde && { gte: new Date(`${desde}T00:00:00Z`) }),
        ...(hasta && { lte: new Date(`${hasta}T00:00:00Z`) }),
      },
    }),
  };

  const [clientes, comprobantes, total] = await Promise.all([
    db.cliente.findMany({ where: { contadorId: contador.id }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true } }),
    db.comprobante.findMany({
      where,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { puntoVenta: true, cliente: { select: { razonSocial: true } } },
    }),
    db.comprobante.count({ where }),
  ]);

  const qs = (p: number) => {
    const u = new URLSearchParams({ cliente: clienteId, estado, desde, hasta, pagina: String(p) });
    return `?${u}`;
  };

  return (
    <div className="space-y-6">
      <h1 className="h1">Comprobantes</h1>

      <form className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="cliente">Cliente</label>
          <select className="input" id="cliente" name="cliente" defaultValue={clienteId}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.razonSocial}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="estado">Estado</label>
          <select className="input" id="estado" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            <option value="AUTORIZADO">Autorizados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="RECHAZADO">Rechazados</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="desde">Desde</label>
          <input className="input" type="date" id="desde" name="desde" defaultValue={desde} />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Hasta</label>
          <input className="input" type="date" id="hasta" name="hasta" defaultValue={hasta} />
        </div>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente (emisor)</th>
              <th>Comprobante</th>
              <th>Receptor</th>
              <th className="text-right">Total</th>
              <th>CAE</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {comprobantes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td>{fecha(c.fecha)}</td>
                <td>{c.cliente.razonSocial}</td>
                <td>
                  <Link href={`/comprobantes/${c.id}`} className="font-medium hover:text-indigo-600">
                    {nombreTipo(c.tipo)} {numeroComprobante(c.puntoVenta.numero, c.numero)}
                  </Link>
                </td>
                <td>{c.receptorNombre}</td>
                <td className="text-right">{moneda(c.impTotal)}</td>
                <td className="font-mono text-xs">{c.cae ?? "—"}</td>
                <td><EstadoBadge estado={c.estado} /></td>
              </tr>
            ))}
            {!comprobantes.length && (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">No hay comprobantes.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > POR_PAGINA && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{total} comprobantes</span>
          <div className="flex flex-wrap gap-2">
            {pagina > 1 && <Link className="btn-secondary" href={qs(pagina - 1)}>← Anterior</Link>}
            {pagina * POR_PAGINA < total && <Link className="btn-secondary" href={qs(pagina + 1)}>Siguiente →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
