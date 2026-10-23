import Link from "next/link";
import { requireContador } from "@/lib/auth";
import { leerFiltros, queryFiltros, whereComprobantes } from "@/lib/filtros-comprobantes";
import { db } from "@/lib/db";
import { fecha, hoyISO, moneda, nombreTipo, numeroComprobante } from "@/lib/format";
import { EstadoBadge } from "@/components/mensaje";

const POR_PAGINA = 50;

export default async function ComprobantesPage({ searchParams }: PageProps<"/comprobantes">) {
  const contador = await requireContador();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filtros = leerFiltros(str);
  const { cliente: clienteId, estado, desde, hasta } = filtros;
  const pagina = Math.max(1, Number(str("pagina")) || 1);

  const where = whereComprobantes(contador.id, filtros);
  const qsDescarga = queryFiltros(filtros);

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

  // Total facturado con los filtros (facturas y ND suman, NC restan; solo autorizados)
  const sumas = await db.comprobante.groupBy({
    by: ["tipo"],
    where: { ...where, estado: "AUTORIZADO" },
    _sum: { impTotal: true },
    _count: true,
  });
  const autorizados = sumas.reduce((s, x) => s + x._count, 0);
  const totalFacturado = sumas.reduce(
    (s, x) => s + ([3, 8, 13].includes(x.tipo) ? -1 : 1) * Number(x._sum.impTotal ?? 0),
    0,
  );

  // Atajos de período (fechas de Argentina)
  const hoy = hoyISO();
  const [anio, mes] = hoy.split("-").map(Number);
  const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  const periodo = (a: number, m: number) => {
    const mm = String(m).padStart(2, "0");
    return `?${new URLSearchParams({ cliente: clienteId, estado, desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${ultimoDia(a, m)}` })}`;
  };
  const mesAnterior = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];

  const qs = (p: number) => {
    const u = new URLSearchParams({ cliente: clienteId, estado, desde, hasta, pagina: String(p) });
    return `?${u}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="h1">Comprobantes</h1>
          <p className="text-sm text-slate-500">
            {autorizados} autorizado{autorizados === 1 ? "" : "s"} · total {moneda(totalFacturado)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/comprobantes/excel?${qsDescarga}`} className="btn-secondary">Exportar a Excel</a>
          {autorizados > 0 && (
            <a href={`/api/comprobantes/zip?${qsDescarga}`} className="btn">
              Descargar {autorizados} PDF{autorizados === 1 ? "" : "s"} (ZIP)
            </a>
          )}
        </div>
      </div>

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
        <div className="flex flex-wrap gap-3 text-sm sm:ml-auto">
          <Link href={periodo(anio, mes)} className="text-indigo-600 hover:underline">Este mes</Link>
          <Link href={periodo(mesAnterior[0], mesAnterior[1])} className="text-indigo-600 hover:underline">Mes anterior</Link>
          {(clienteId || estado || desde || hasta) && (
            <Link href="/comprobantes" className="text-slate-500 hover:underline">Limpiar filtros</Link>
          )}
        </div>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {comprobantes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap">{fecha(c.fecha)}</td>
                <td>{c.cliente.razonSocial}</td>
                <td>
                  <Link href={`/comprobantes/${c.id}`} className="whitespace-nowrap font-medium hover:text-indigo-600">
                    {nombreTipo(c.tipo)} {numeroComprobante(c.puntoVenta.numero, c.numero)}
                  </Link>
                </td>
                <td>{c.receptorNombre}</td>
                <td className="whitespace-nowrap text-right">{moneda(c.impTotal)}</td>
                <td className="font-mono text-xs">{c.cae ?? "—"}</td>
                <td><EstadoBadge estado={c.estado} /></td>
                <td className="text-right">
                  {c.estado === "AUTORIZADO" && (
                    <a
                      href={`/api/comprobantes/${c.id}/pdf?descargar=1`}
                      className="whitespace-nowrap text-sm font-medium text-indigo-600 hover:underline"
                    >
                      ↓ PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {!comprobantes.length && (
              <tr><td colSpan={8} className="py-10 text-center text-slate-500">No hay comprobantes.</td></tr>
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
