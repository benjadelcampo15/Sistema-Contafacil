"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CONDICIONES_IVA_RECEPTOR, TIPOS_COMPROBANTE } from "@/lib/arca/constants";
import { interpretarLote, type FacturaLote, type FilaExcel } from "@/lib/lote";
import { moneda } from "@/lib/format";
import { emitir } from "../facturar/actions";

type Estado =
  | { tipo: "pendiente" }
  | { tipo: "emitiendo" }
  | { tipo: "ok"; comprobanteId: string }
  | { tipo: "error"; mensaje: string; pendienteId?: string };

const MAX_FACTURAS = 300;

export function LoteForm(props: {
  clienteId: string;
  condicionEmisor: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO";
  hoy: string;
  produccion: boolean;
  puntosVenta: { id: string; numero: number }[];
}) {
  const [puntoVentaId, setPuntoVentaId] = useState(props.puntosVenta[0].id);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [facturas, setFacturas] = useState<FacturaLote[]>([]);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [emitiendo, setEmitiendo] = useState(false);
  const detener = useRef(false);

  // Evitar cerrar la pestaña en medio de la emisión
  useEffect(() => {
    if (!emitiendo) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [emitiendo]);

  const leerArchivo = async (file: File) => {
    setErrorArchivo(null);
    setAviso(null);
    setFacturas([]);
    setEstados({});
    setArchivo(file.name);
    try {
      const esTexto = /\.(csv|txt)$/i.test(file.name);
      // CSV: UTF-8 y sin conversión automática (si no, "2.500,00" se lee como 2,5); lo interpreta lib/lote.
      const libro = XLSX.read(await file.arrayBuffer(), { cellDates: true, raw: esTexto, codepage: 65001 });
      const nombreHoja = libro.SheetNames.find((n) => n.toLowerCase() === "facturas") ?? libro.SheetNames[0];
      const filas = XLSX.utils.sheet_to_json<FilaExcel>(libro.Sheets[nombreHoja], { defval: "", raw: true });
      const { facturas, columnasDesconocidas } = interpretarLote(filas, props.condicionEmisor, props.hoy);
      if (!facturas.length) {
        setErrorArchivo(
          "No encontré facturas para emitir. Si usaste la plantilla, agregá tus filas debajo de los ejemplos (las filas EJEMPLO se ignoran).",
        );
        return;
      }
      if (facturas.length > MAX_FACTURAS) {
        setErrorArchivo(`El archivo tiene ${facturas.length} facturas. El máximo por archivo es ${MAX_FACTURAS}.`);
        return;
      }
      if (columnasDesconocidas.length) {
        setAviso(`Estas columnas no se usan y se ignoraron: ${columnasDesconocidas.join(", ")}.`);
      }
      setFacturas(facturas);
    } catch {
      setErrorArchivo("No se pudo leer el archivo. Tiene que ser un Excel (.xlsx o .xls) o un .csv.");
    }
  };

  const validas = facturas.filter((f) => !f.errores.length);
  const conErrores = facturas.length - validas.length;
  const porEmitir = validas.filter((f) => estados[f.id]?.tipo !== "ok");
  const emitidas = facturas.filter((f) => estados[f.id]?.tipo === "ok");
  const fallidas = facturas.filter((f) => estados[f.id]?.tipo === "error");
  const totalPorEmitir = porEmitir.reduce((s, f) => s + f.total, 0);
  const progreso = emitidas.length + fallidas.length;

  const emitirTodas = async () => {
    const lista = porEmitir;
    if (!lista.length) return;
    const texto =
      `Vas a emitir ${lista.length} factura${lista.length === 1 ? "" : "s"} por un total de ${moneda(totalPorEmitir)}` +
      (props.produccion ? " en ARCA (PRODUCCIÓN: son facturas reales)." : " en homologación.") +
      "\n\nSi este archivo ya lo subiste antes, las facturas se van a duplicar. ¿Continuar?";
    if (!confirm(texto)) return;

    detener.current = false;
    setEmitiendo(true);
    for (const f of lista) {
      if (detener.current) break;
      setEstados((e) => ({ ...e, [f.id]: { tipo: "emitiendo" } }));
      let estado: Estado;
      try {
        const res = await emitir({
          clienteId: props.clienteId,
          puntoVentaId,
          tipo: f.tipo,
          fecha: f.fecha,
          concepto: f.concepto,
          fchServDesde: f.fchServDesde,
          fchServHasta: f.fchServHasta,
          fchVtoPago: f.fchVtoPago,
          receptor: { ...f.receptor, guardar: f.receptor.docTipo !== 99 },
          items: f.items,
        });
        estado = res.ok
          ? { tipo: "ok", comprobanteId: res.comprobanteId }
          : {
              tipo: "error",
              mensaje: res.errores.map((e) => (e.code ? `[${e.code}] ${e.msg}` : e.msg)).join(" · "),
              pendienteId: res.pendienteId,
            };
      } catch {
        estado = { tipo: "error", mensaje: "Se cortó la conexión con el servidor" };
      }
      setEstados((e) => ({ ...e, [f.id]: estado }));
    }
    setEmitiendo(false);
  };

  return (
    <div className="space-y-6">
      {/* Paso 1: archivo */}
      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="h2">1. Subí el Excel</h2>
            <p className="text-sm text-slate-600">
              Una fila por factura. Para varios ítems en una factura, repetí el mismo valor en la columna &quot;Factura&quot;.
            </p>
          </div>
          <a href="/api/plantilla-facturas" className="btn-secondary">Descargar plantilla</a>
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <label className="label" htmlFor="pv">Punto de venta</label>
            <select
              id="pv"
              className="input"
              value={puntoVentaId}
              disabled={emitiendo}
              onChange={(e) => setPuntoVentaId(e.target.value)}
            >
              {props.puntosVenta.map((p) => (
                <option key={p.id} value={p.id}>{String(p.numero).padStart(5, "0")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="archivo">Archivo (.xlsx, .xls o .csv)</label>
            <input
              id="archivo"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input"
              disabled={emitiendo}
              onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
            />
          </div>
        </div>
        {errorArchivo && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorArchivo}</p>}
        {aviso && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{aviso}</p>}
      </section>

      {facturas.length > 0 && (
        <>
          {/* Paso 2: resumen y emisión */}
          <section className="card space-y-4">
            <h2 className="h2">2. Revisá y emití</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato titulo="Archivo" valor={archivo ?? ""} />
              <Dato titulo="Facturas válidas" valor={String(validas.length)} />
              <Dato titulo="Con errores" valor={String(conErrores)} alerta={conErrores > 0} />
              <Dato titulo="Total a emitir" valor={moneda(totalPorEmitir)} />
            </div>
            {conErrores > 0 && (
              <p className="text-sm text-amber-800">
                Las facturas con errores no se van a emitir. Corregilas en el Excel y volvé a subirlo, o emití las
                válidas ahora.
              </p>
            )}

            {(emitiendo || progreso > 0) && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>
                    {emitidas.length} autorizadas{fallidas.length ? ` · ${fallidas.length} con error` : ""}
                  </span>
                  <span>{progreso} / {validas.length}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-indigo-600 transition-all"
                    style={{ width: `${validas.length ? (progreso / validas.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {emitiendo ? (
                <button type="button" className="btn-secondary" onClick={() => (detener.current = true)}>
                  Detener después de la actual
                </button>
              ) : (
                porEmitir.length > 0 && (
                  <button type="button" className="btn px-6 py-3 text-base" onClick={emitirTodas}>
                    {fallidas.length ? `Reintentar ${porEmitir.length}` : `Emitir ${porEmitir.length}`} factura
                    {porEmitir.length === 1 ? "" : "s"} · {moneda(totalPorEmitir)}
                  </button>
                )
              )}
              {!emitiendo && emitidas.length > 0 && (
                <Link href={`/comprobantes?cliente=${props.clienteId}`} className="btn-secondary">
                  Ver comprobantes emitidos
                </Link>
              )}
              {emitiendo && <span className="text-sm text-slate-600">Emitiendo… no cierres esta pestaña.</span>}
            </div>
          </section>

          {/* Detalle */}
          <section className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Comprador</th>
                  <th>Detalle</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id} className={f.errores.length ? "bg-red-50/50" : ""}>
                    <td className="whitespace-nowrap text-slate-500">{f.filas.join(", ")}</td>
                    <td>
                      <p className="font-medium">{f.receptor.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {f.receptor.docTipo === 99 ? "Sin documento" : f.receptor.docNro} ·{" "}
                        {CONDICIONES_IVA_RECEPTOR[f.receptor.condicionIvaId]}
                      </p>
                    </td>
                    <td>
                      <p>{TIPOS_COMPROBANTE[f.tipo].nombre} · {f.fecha.split("-").reverse().join("/")}</p>
                      <p className="text-xs text-slate-500">
                        {f.items.map((i) => `${i.cantidad} × ${i.descripcion || "—"}`).join(" · ")}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-right">{moneda(f.total)}</td>
                    <td className="min-w-48">
                      <EstadoFila factura={f} estado={estados[f.id]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function EstadoFila({ factura, estado }: { factura: FacturaLote; estado?: Estado }) {
  if (factura.errores.length) {
    return (
      <ul className="list-disc pl-4 text-xs text-red-700">
        {factura.errores.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    );
  }
  switch (estado?.tipo) {
    case "emitiendo":
      return <span className="text-xs text-indigo-700">Emitiendo…</span>;
    case "ok":
      return (
        <Link href={`/comprobantes/${estado.comprobanteId}`} target="_blank" className="text-xs font-medium text-green-700 hover:underline">
          ✓ Autorizada · ver
        </Link>
      );
    case "error":
      return (
        <div className="text-xs text-red-700">
          {estado.mensaje}
          {estado.pendienteId && (
            <Link href={`/comprobantes/${estado.pendienteId}`} target="_blank" className="ml-1 underline">verificar</Link>
          )}
        </div>
      );
    default:
      return <span className="text-xs text-slate-500">Lista para emitir</span>;
  }
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`truncate font-semibold ${alerta ? "text-red-700" : "text-slate-900"}`}>{valor}</p>
    </div>
  );
}
