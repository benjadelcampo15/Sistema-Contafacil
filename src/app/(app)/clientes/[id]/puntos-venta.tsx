"use client";

import { useActionState } from "react";
import type { PuntoVenta } from "@prisma/client";
import { Mensaje } from "@/components/mensaje";
import { agregarPuntoVenta, sincronizarPuntosVenta, type FormState } from "../actions";

export function PuntosVenta({ clienteId, puntos }: { clienteId: string; puntos: PuntoVenta[] }) {
  const [addState, addAction, adding] = useActionState<FormState, FormData>(
    agregarPuntoVenta.bind(null, clienteId),
    {},
  );
  const [syncState, syncAction, syncing] = useActionState<FormState>(sincronizarPuntosVenta.bind(null, clienteId), {});

  return (
    <div className="space-y-4">
      {puntos.length ? (
        <ul className="flex flex-wrap gap-2">
          {puntos.map((p) => (
            <li key={p.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
              <span className="font-mono font-medium">{String(p.numero).padStart(5, "0")}</span>
              {p.descripcion && <span className="ml-2 text-slate-500">{p.descripcion}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">
          Sin puntos de venta. El cliente debe tener uno de tipo <em>Web Services</em> dado de alta en ARCA.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form action={syncAction}>
          <button className="btn-secondary" disabled={syncing}>{syncing ? "Consultando…" : "Traer desde ARCA"}</button>
        </form>
        <form action={addAction} className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="numero">N° punto de venta</label>
            <input className="input w-28" id="numero" name="numero" type="number" min={1} required />
          </div>
          <div>
            <label className="label" htmlFor="descripcion">Descripción</label>
            <input className="input" id="descripcion" name="descripcion" placeholder="Opcional" />
          </div>
          <button className="btn-secondary" disabled={adding}>Agregar</button>
        </form>
      </div>
      <Mensaje state={syncState} />
      <Mensaje state={addState} />
    </div>
  );
}
