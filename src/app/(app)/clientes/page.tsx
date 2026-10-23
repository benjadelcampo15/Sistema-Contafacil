import Link from "next/link";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { cuit, fecha, moneda } from "@/lib/format";

const CONDICION = {
  RESPONSABLE_INSCRIPTO: "Resp. Inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
} as const;

const NOTAS_CREDITO = [3, 8, 13];

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const contador = await requireContador();
  const q = String((await searchParams).q ?? "").trim();

  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);

  const clientes = await db.cliente.findMany({
    where: {
      contadorId: contador.id,
      activo: true,
      ...(q && {
        OR: [{ razonSocial: { contains: q, mode: "insensitive" } }, { cuit: { contains: q.replace(/\D/g, "") || q } }],
      }),
    },
    orderBy: { razonSocial: "asc" },
    include: { _count: { select: { puntosVenta: true, receptores: true } } },
  });

  // Facturado en el mes por cliente (facturas + ND - NC) y cantidad de comprobantes
  const totales = await db.comprobante.groupBy({
    by: ["clienteId", "tipo"],
    where: { cliente: { contadorId: contador.id }, estado: "AUTORIZADO", fecha: { gte: inicioMes } },
    _sum: { impTotal: true },
    _count: true,
  });
  const mes = new Map<string, { total: number; cantidad: number }>();
  for (const t of totales) {
    const m = mes.get(t.clienteId) ?? { total: 0, cantidad: 0 };
    m.total += (NOTAS_CREDITO.includes(t.tipo) ? -1 : 1) * Number(t._sum.impTotal ?? 0);
    m.cantidad += t._count;
    mes.set(t.clienteId, m);
  }

  const ultimas = await db.comprobante.groupBy({
    by: ["clienteId"],
    where: { cliente: { contadorId: contador.id }, estado: "AUTORIZADO" },
    _max: { fecha: true },
  });
  const ultimaFactura = new Map(ultimas.map((u) => [u.clienteId, u._max.fecha]));

  const nombreMes = new Date().toLocaleDateString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="h1">Clientes</h1>
          <p className="text-sm text-slate-500">
            {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <form className="w-full sm:w-64">
            <input className="input" name="q" defaultValue={q} placeholder="Buscar por nombre o CUIT…" />
          </form>
          <Link href="/clientes/nuevo" className="btn">+ Nuevo cliente</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {clientes.map((c) => {
          const estado = estadoArca(Boolean(c.certPem), Boolean(c.arcaVerificadoAt), c._count.puntosVenta);
          const delMes = mes.get(c.id);
          const ultima = ultimaFactura.get(c.id);
          return (
            <article
              key={c.id}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex items-start gap-4 p-5">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-semibold ${colorAvatar(c.cuit)}`}
                >
                  {iniciales(c.razonSocial)}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="block truncate text-lg font-semibold text-slate-900 group-hover:text-indigo-700"
                  >
                    {c.razonSocial}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">CUIT {cuit(c.cuit)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {CONDICION[c.condicionIva]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.estilo}`}>{estado.texto}</span>
                  </div>
                </div>
              </div>

              <div className="mx-5 rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Facturado en {nombreMes}</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">{moneda(delMes?.total ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {delMes?.cantidad
                    ? `${delMes.cantidad} comprobante${delMes.cantidad === 1 ? "" : "s"}`
                    : "Sin comprobantes este mes"}
                  {ultima ? ` · última ${fecha(ultima)}` : ""}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3 px-5 py-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Puntos de venta</dt>
                  <dd className="font-medium text-slate-800">{c._count.puntosVenta || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Clientes guardados</dt>
                  <dd className="font-medium text-slate-800">{c._count.receptores || "—"}</dd>
                </div>
              </dl>

              <div className="mt-auto flex gap-2 border-t border-slate-100 p-4">
                <Link href={`/clientes/${c.id}`} className="btn-secondary flex-1">Ver ficha</Link>
                {estado.lista ? (
                  <Link href={`/clientes/${c.id}#facturar`} className="btn flex-1">Facturar</Link>
                ) : (
                  <Link href={`/clientes/${c.id}`} className="btn flex-1 bg-amber-500 hover:bg-amber-600">
                    Completar conexión
                  </Link>
                )}
              </div>
            </article>
          );
        })}

        {!q && (
          <Link
            href="/clientes/nuevo"
            className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-600 md:min-h-[280px]"
          >
            <span className="text-3xl leading-none">+</span>
            <span className="text-sm font-medium">Agregar cliente</span>
          </Link>
        )}
      </div>

      {q && !clientes.length && <p className="py-10 text-center text-slate-500">Sin resultados para &quot;{q}&quot;.</p>}
    </div>
  );
}

function estadoArca(certificado: boolean, verificado: boolean, puntosVenta: number) {
  if (certificado && verificado && puntosVenta) {
    return { lista: true, texto: "● Lista para facturar", estilo: "bg-green-100 text-green-800" };
  }
  if (certificado) return { lista: false, texto: "Conexión incompleta", estilo: "bg-amber-100 text-amber-800" };
  return { lista: false, texto: "Sin conectar a ARCA", estilo: "bg-slate-100 text-slate-600" };
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const AVATARES = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
];

/** Color estable por cliente (derivado del CUIT). */
function colorAvatar(cuit: string) {
  const n = [...cuit].reduce((s, d) => s + Number(d), 0);
  return AVATARES[n % AVATARES.length];
}
