"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ALICUOTAS_IVA,
  CONCEPTOS,
  CONDICIONES_IVA_RECEPTOR,
  TIPOS_COMPROBANTE,
  TIPOS_DOCUMENTO,
  letraComprobante,
  tiposPorLetra,
} from "@/lib/arca/constants";
import { calcularTotales } from "@/lib/totales";
import { moneda } from "@/lib/format";
import { emitir, type EmitirRespuesta } from "./actions";

type Receptor = {
  id: string;
  docTipo: number;
  docNro: string;
  nombre: string;
  domicilio: string;
  email: string;
  condicionIvaId: number;
};

type Factura = {
  id: string;
  tipo: number;
  label: string;
  docTipo: number;
  docNro: string;
  receptorNombre: string;
  receptorDomicilio: string;
  receptorCondIvaId: number;
  puntoVentaId: string;
};

type Item = { descripcion: string; cantidad: string; precioUnitario: string; alicuotaIvaId: number };

const itemVacio = (): Item => ({ descripcion: "", cantidad: "1", precioUnitario: "", alicuotaIvaId: 5 });
const ALICUOTAS_ORDENADAS = Object.entries(ALICUOTAS_IVA).sort(([, a], [, b]) => a - b);
const num = (s: string) => Number(s.replace(",", "."));

export function FacturaForm(props: {
  clienteId: string;
  condicionEmisor: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO";
  hoy: string;
  asociadoInicial?: string;
  compradorInicial?: string;
  puntosVenta: { id: string; numero: number; descripcion: string | null }[];
  receptores: Receptor[];
  facturas: Factura[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<EmitirRespuesta | null>(null);

  const facturaInicial = props.facturas.find((f) => f.id === props.asociadoInicial);

  const [puntoVentaId, setPuntoVentaId] = useState(facturaInicial?.puntoVentaId ?? props.puntosVenta[0].id);
  const [clase, setClase] = useState<"F" | "NC" | "ND">(facturaInicial ? "NC" : "F");
  const [asociadoId, setAsociadoId] = useState(facturaInicial?.id ?? "");
  const [fecha, setFecha] = useState(props.hoy);
  const [concepto, setConcepto] = useState<1 | 2 | 3>(2);
  const [servDesde, setServDesde] = useState(props.hoy.slice(0, 8) + "01");
  const [servHasta, setServHasta] = useState(props.hoy);
  const [vtoPago, setVtoPago] = useState(props.hoy);

  const compradorInicial = props.receptores.find((r) => r.id === props.compradorInicial);
  const [receptor, setReceptor] = useState(
    compradorInicial
      ? { ...compradorInicial, guardar: false }
      : {
          docTipo: facturaInicial?.docTipo ?? 99,
          docNro: facturaInicial?.docNro ?? "",
          nombre: facturaInicial?.receptorNombre ?? "Consumidor Final",
          domicilio: facturaInicial?.receptorDomicilio ?? "",
          email: "",
          condicionIvaId: facturaInicial?.receptorCondIvaId ?? 5,
          guardar: true, // los receptores nuevos se guardan por defecto
        },
  );
  /** Cliente guardado que coincide con el documento cargado (si hay). */
  const guardado = props.receptores.find(
    (r) => r.docTipo === receptor.docTipo && r.docNro === receptor.docNro.replace(/\D/g, ""),
  );
  const [items, setItems] = useState<Item[]>([itemVacio()]);

  const letra = letraComprobante(props.condicionEmisor, receptor.condicionIvaId);
  const tipo = tiposPorLetra(letra).find((t) => t.clase === clase)!.id;
  const facturasAsociables = props.facturas.filter((f) => TIPOS_COMPROBANTE[f.tipo].letra === letra);

  const totales = useMemo(
    () =>
      calcularTotales(
        items.map((i) => ({
          descripcion: i.descripcion,
          cantidad: num(i.cantidad) || 0,
          precioUnitario: num(i.precioUnitario) || 0,
          alicuotaIvaId: i.alicuotaIvaId,
        })),
        letra,
      ),
    [items, letra],
  );

  const elegirReceptor = (r: Receptor) => setReceptor({ ...r, guardar: false });

  /** Al terminar de tipear un documento que ya está guardado, completa el resto de los datos. */
  const autocompletarPorDocumento = () => {
    const digitos = receptor.docNro.replace(/\D/g, "");
    const r = props.receptores.find((x) => x.docTipo === receptor.docTipo && x.docNro === digitos);
    if (r) elegirReceptor(r);
  };

  const elegirAsociado = (id: string) => {
    setAsociadoId(id);
    const f = props.facturas.find((x) => x.id === id);
    if (f) {
      setPuntoVentaId(f.puntoVentaId);
      setReceptor({
        docTipo: f.docTipo,
        docNro: f.docNro,
        nombre: f.receptorNombre,
        domicilio: f.receptorDomicilio,
        email: "",
        condicionIvaId: f.receptorCondIvaId,
        guardar: false,
      });
    }
  };

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResultado(null);
    startTransition(async () => {
      const res = await emitir({
        clienteId: props.clienteId,
        puntoVentaId,
        tipo,
        fecha,
        concepto,
        fchServDesde: concepto !== 1 ? servDesde : undefined,
        fchServHasta: concepto !== 1 ? servHasta : undefined,
        fchVtoPago: concepto !== 1 ? vtoPago : undefined,
        receptor: { ...receptor, docNro: receptor.docTipo === 99 ? "0" : receptor.docNro },
        asociadoId: clase !== "F" ? asociadoId : undefined,
        items: items.map((i) => ({
          descripcion: i.descripcion,
          cantidad: num(i.cantidad),
          precioUnitario: num(i.precioUnitario),
          alicuotaIvaId: letra === "C" ? null : i.alicuotaIvaId,
        })),
      });
      if (res.ok) router.push(`/comprobantes/${res.comprobanteId}?nuevo=1`);
      else if (res.pendienteId) router.push(`/comprobantes/${res.pendienteId}`);
      else setResultado(res);
    });
  };

  return (
    <form onSubmit={submit} className="grid max-w-5xl gap-6">
      {/* Cabecera */}
      <section className="card grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <label className="label">Comprobante</label>
          <div className="flex rounded-md border border-slate-300 p-0.5 text-sm">
            {(["F", "NC", "ND"] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setClase(c)}
                className={`flex-1 rounded px-2 py-1.5 ${clase === c ? "bg-indigo-600 text-white" : "text-slate-600"}`}
              >
                {c === "F" ? "Factura" : c === "NC" ? "N. Crédito" : "N. Débito"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Se emitirá: <strong>{TIPOS_COMPROBANTE[tipo].nombre}</strong>
          </p>
        </div>
        <div>
          <label className="label" htmlFor="pv">Punto de venta</label>
          <select id="pv" className="input" value={puntoVentaId} onChange={(e) => setPuntoVentaId(e.target.value)}>
            {props.puntosVenta.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.numero).padStart(5, "0")} {p.descripcion ? `— ${p.descripcion}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="concepto">Concepto</label>
          <select
            id="concepto"
            className="input"
            value={concepto}
            onChange={(e) => setConcepto(Number(e.target.value) as 1 | 2 | 3)}
          >
            {Object.entries(CONCEPTOS).map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
        </div>
        {concepto !== 1 && (
          <>
            <div>
              <label className="label" htmlFor="sd">Servicio desde</label>
              <input id="sd" type="date" className="input" value={servDesde} onChange={(e) => setServDesde(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sh">Servicio hasta</label>
              <input id="sh" type="date" className="input" value={servHasta} onChange={(e) => setServHasta(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="vp">Vto. de pago</label>
              <input id="vp" type="date" className="input" value={vtoPago} onChange={(e) => setVtoPago(e.target.value)} />
            </div>
          </>
        )}
        {clase !== "F" && (
          <div className="col-span-2 md:col-span-4">
            <label className="label" htmlFor="asoc">Comprobante asociado</label>
            <select id="asoc" className="input" value={asociadoId} onChange={(e) => elegirAsociado(e.target.value)} required>
              <option value="">Elegí la factura que corrige…</option>
              {facturasAsociables.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Receptor */}
      <section className="card grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 md:col-span-4">
          <h2 className="h2">Receptor</h2>
          <div className="flex items-center gap-3">
            {props.receptores.length > 0 && <BuscadorComprador receptores={props.receptores} onElegir={elegirReceptor} />}
            <Link
              href={`/clientes/${props.clienteId}/compradores`}
              className="whitespace-nowrap text-sm text-indigo-600 hover:underline"
            >
              Administrar clientes
            </Link>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="docTipo">Tipo doc.</label>
          <select
            id="docTipo"
            className="input"
            value={receptor.docTipo}
            onChange={(e) => {
              const docTipo = Number(e.target.value);
              setReceptor((r) =>
                docTipo === 99
                  ? { ...r, docTipo, docNro: "", nombre: "Consumidor Final", condicionIvaId: 5 }
                  : { ...r, docTipo },
              );
            }}
          >
            {Object.entries(TIPOS_DOCUMENTO).map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="docNro">Número</label>
          <input
            id="docNro"
            className="input"
            value={receptor.docNro}
            disabled={receptor.docTipo === 99}
            onChange={(e) => setReceptor((r) => ({ ...r, docNro: e.target.value }))}
            onBlur={autocompletarPorDocumento}
          />
          {guardado && <p className="mt-1 text-xs text-green-700">✓ Cliente guardado</p>}
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="condIva">Condición frente al IVA</label>
          <select
            id="condIva"
            className="input"
            value={receptor.condicionIvaId}
            disabled={receptor.docTipo === 99}
            onChange={(e) => setReceptor((r) => ({ ...r, condicionIvaId: Number(e.target.value) }))}
          >
            {Object.entries(CONDICIONES_IVA_RECEPTOR).map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="nombre">Nombre / Razón social</label>
          <input
            id="nombre"
            className="input"
            value={receptor.nombre}
            onChange={(e) => setReceptor((r) => ({ ...r, nombre: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="dom">Domicilio</label>
          <input
            id="dom"
            className="input"
            value={receptor.domicilio}
            onChange={(e) => setReceptor((r) => ({ ...r, domicilio: e.target.value }))}
          />
        </div>
        {receptor.docTipo !== 99 && (
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 md:col-span-4">
            <input
              type="checkbox"
              checked={receptor.guardar}
              onChange={(e) => setReceptor((r) => ({ ...r, guardar: e.target.checked }))}
            />
            {guardado ? "Actualizar los datos guardados con estos cambios" : "Guardar en los clientes de este cliente"}
          </label>
        )}
      </section>

      {/* Ítems */}
      <section className="card space-y-3 overflow-x-auto">
        <h2 className="h2">Ítems</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th className="w-24">Cant.</th>
              <th className="w-36">{letra === "C" ? "Precio unit." : "Precio unit. s/IVA"}</th>
              {letra !== "C" && <th className="w-28">IVA</th>}
              <th className="w-32 text-right">Subtotal</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <input className="input" value={it.descripcion} onChange={(e) => setItem(i, { descripcion: e.target.value })} />
                </td>
                <td>
                  <input className="input" inputMode="decimal" value={it.cantidad} onChange={(e) => setItem(i, { cantidad: e.target.value })} />
                </td>
                <td>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={it.precioUnitario}
                    onChange={(e) => setItem(i, { precioUnitario: e.target.value })}
                  />
                </td>
                {letra !== "C" && (
                  <td>
                    <select
                      className="input"
                      value={it.alicuotaIvaId}
                      onChange={(e) => setItem(i, { alicuotaIvaId: Number(e.target.value) })}
                    >
                      {ALICUOTAS_ORDENADAS.map(([id, pct]) => (
                        <option key={id} value={id}>{pct.toLocaleString("es-AR")}%</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="text-right">{moneda(totales.items[i]?.subtotal ?? 0)}</td>
                <td>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Quitar ítem"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-secondary" onClick={() => setItems((p) => [...p, itemVacio()])}>
          + Agregar ítem
        </button>

        <dl className="ml-auto grid w-full max-w-72 grid-cols-2 gap-1 text-sm">
          {letra !== "C" && (
            <>
              <dt className="text-slate-600">Neto gravado</dt>
              <dd className="text-right">{moneda(totales.impNeto)}</dd>
              {totales.alicuotas.map((a) => (
                <div key={a.id} className="contents">
                  <dt className="text-slate-600">IVA {ALICUOTAS_IVA[a.id].toLocaleString("es-AR")}%</dt>
                  <dd className="text-right">{moneda(a.importe)}</dd>
                </div>
              ))}
            </>
          )}
          <dt className="border-t border-slate-200 pt-1 font-semibold">Total</dt>
          <dd className="border-t border-slate-200 pt-1 text-right font-semibold">{moneda(totales.impTotal)}</dd>
        </dl>
      </section>

      {resultado && !resultado.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">No se pudo emitir el comprobante:</p>
          <ul className="mt-1 list-disc pl-5">
            {resultado.errores.map((e, i) => (
              <li key={i}>{e.code ? `[${e.code}] ` : ""}{e.msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn px-6 py-3 text-base" disabled={pending}>
          {pending ? "Solicitando CAE a ARCA…" : `Emitir ${TIPOS_COMPROBANTE[tipo].nombre}`}
        </button>
      </div>
    </form>
  );
}

/** Buscador de clientes guardados por nombre o documento. */
function BuscadorComprador({ receptores, onElegir }: { receptores: Receptor[]; onElegir: (r: Receptor) => void }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const t = texto.trim().toLowerCase();
  const digitos = t.replace(/\D/g, "");
  const resultados = receptores
    .filter((r) => !t || r.nombre.toLowerCase().includes(t) || (digitos && r.docNro.includes(digitos)))
    .slice(0, 8);

  const elegir = (r: Receptor) => {
    onElegir(r);
    setTexto("");
    setAbierto(false);
  };

  return (
    <div className="relative w-full sm:w-72">
      <input
        className="input"
        placeholder={`Buscar entre ${receptores.length} clientes guardados…`}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (resultados[0]) elegir(resultados[0]);
          }
          if (e.key === "Escape") setAbierto(false);
        }}
      />
      {abierto && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-indigo-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(r)}
              >
                <span className="font-medium">{r.nombre}</span>
                <span className="block text-xs text-slate-500">
                  {TIPOS_DOCUMENTO[r.docTipo]} {r.docNro} · {CONDICIONES_IVA_RECEPTOR[r.condicionIvaId]}
                </span>
              </button>
            </li>
          ))}
          {!resultados.length && <li className="px-3 py-2 text-slate-500">Sin coincidencias</li>}
        </ul>
      )}
    </div>
  );
}
