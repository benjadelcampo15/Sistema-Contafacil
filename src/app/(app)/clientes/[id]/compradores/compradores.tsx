"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CONDICIONES_IVA_RECEPTOR, TIPOS_DOCUMENTO } from "@/lib/arca/constants";
import { cuit, fecha } from "@/lib/format";
import { Mensaje } from "@/components/mensaje";
import { eliminarComprador, guardarComprador, type FormState } from "../../actions";

export type Comprador = {
  id: string;
  docTipo: number;
  docNro: string;
  razonSocial: string;
  condicionIvaId: number;
  domicilio: string;
  email: string;
  comprobantes: number;
  ultima: string | null;
};

const vacio: Omit<Comprador, "comprobantes" | "ultima"> = {
  id: "",
  docTipo: 80,
  docNro: "",
  razonSocial: "",
  condicionIvaId: 1,
  domicilio: "",
  email: "",
};

export function Compradores({ clienteId, q, compradores }: { clienteId: string; q: string; compradores: Comprador[] }) {
  const [editando, setEditando] = useState<typeof vacio | null>(null);
  const [borrando, startBorrar] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  const editar = (c: typeof vacio) => {
    setEditando(c);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="w-full max-w-sm">
          <input className="input" name="q" defaultValue={q} placeholder="Buscar por nombre, CUIT o DNI…" />
        </form>
        {!editando && (
          <button className="btn" onClick={() => editar(vacio)}>+ Agregar cliente</button>
        )}
      </div>

      {editando && (
        <div ref={formRef}>
          <CompradorForm
            key={editando.id || "nuevo"}
            clienteId={clienteId}
            inicial={editando}
            onListo={() => setEditando(null)}
          />
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre / Razón social</th>
              <th>Documento</th>
              <th>Condición IVA</th>
              <th>Comprobantes</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {compradores.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td>
                  <p className="font-medium">{c.razonSocial}</p>
                  {(c.domicilio || c.email) && (
                    <p className="text-xs text-slate-500">{[c.domicilio, c.email].filter(Boolean).join(" · ")}</p>
                  )}
                </td>
                <td className="font-mono text-xs">
                  {TIPOS_DOCUMENTO[c.docTipo]} {c.docTipo === 96 ? c.docNro : cuit(c.docNro)}
                </td>
                <td>{CONDICIONES_IVA_RECEPTOR[c.condicionIvaId]}</td>
                <td className="text-slate-600">
                  {c.comprobantes ? `${c.comprobantes} · última ${fecha(c.ultima ? new Date(c.ultima) : null)}` : "—"}
                </td>
                <td>
                  <div className="flex justify-end gap-3 text-sm">
                    <Link
                      href={`/clientes/${clienteId}/facturar?comprador=${c.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      Facturar
                    </Link>
                    <button className="text-slate-600 hover:underline" onClick={() => editar(c)}>Editar</button>
                    <button
                      className="text-red-600 hover:underline disabled:opacity-50"
                      disabled={borrando}
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${c.razonSocial}? Las facturas ya emitidas no se modifican.`)) {
                          startBorrar(() => eliminarComprador(clienteId, c.id));
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!compradores.length && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-500">
                  {q ? "Sin resultados." : "Todavía no hay clientes guardados. Agregalos acá o tildá “Guardar” al facturar."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompradorForm({
  clienteId,
  inicial,
  onListo,
}: {
  clienteId: string;
  inicial: typeof vacio;
  onListo: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(guardarComprador.bind(null, clienteId), {});
  const [docTipo, setDocTipo] = useState(inicial.docTipo);

  useEffect(() => {
    if (state.ok) onListo();
  }, [state, onListo]);

  return (
    <form action={action} className="card grid grid-cols-2 gap-4 md:grid-cols-4">
      <h2 className="h2 col-span-2 md:col-span-4">{inicial.id ? `Editar ${inicial.razonSocial}` : "Nuevo cliente"}</h2>
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <div>
        <label className="label" htmlFor="docTipo">Tipo doc.</label>
        <select
          className="input"
          id="docTipo"
          name="docTipo"
          value={docTipo}
          onChange={(e) => setDocTipo(Number(e.target.value))}
        >
          <option value={80}>CUIT</option>
          <option value={86}>CUIL</option>
          <option value={96}>DNI</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="docNro">Número *</label>
        <input
          className="input"
          id="docNro"
          name="docNro"
          defaultValue={inicial.docNro}
          placeholder={docTipo === 96 ? "12345678" : "20-12345678-9"}
          required
        />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor="condicionIvaId">Condición frente al IVA *</label>
        <select className="input" id="condicionIvaId" name="condicionIvaId" defaultValue={inicial.condicionIvaId}>
          {Object.entries(CONDICIONES_IVA_RECEPTOR).map(([id, n]) => (
            <option key={id} value={id}>{n}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor="razonSocial">Nombre / Razón social *</label>
        <input className="input" id="razonSocial" name="razonSocial" defaultValue={inicial.razonSocial} required />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" defaultValue={inicial.email} />
      </div>
      <div className="col-span-2 md:col-span-4">
        <label className="label" htmlFor="domicilio">Domicilio</label>
        <input className="input" id="domicilio" name="domicilio" defaultValue={inicial.domicilio} />
      </div>
      <div className="col-span-2 flex items-center gap-3 md:col-span-4">
        <button className="btn" disabled={pending}>{inicial.id ? "Guardar cambios" : "Agregar"}</button>
        <button type="button" className="btn-secondary" onClick={onListo}>Cancelar</button>
        <Mensaje state={state} />
      </div>
    </form>
  );
}
