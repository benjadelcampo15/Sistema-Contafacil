"use client";

import { useActionState } from "react";
import { Mensaje } from "@/components/mensaje";
import { guardarCuenta, type ConfigState } from "./actions";

export function CuentaForm({ nombre, ambiente }: { nombre: string; ambiente: string }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(guardarCuenta, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="nombre">Nombre del estudio</label>
        <input className="input" id="nombre" name="nombre" defaultValue={nombre} required />
      </div>
      <div>
        <label className="label" htmlFor="ambiente">Ambiente de ARCA</label>
        <select className="input" id="ambiente" name="ambiente" defaultValue={ambiente}>
          <option value="PRODUCCION">Producción (facturas reales)</option>
          <option value="HOMOLOGACION">Homologación (pruebas)</option>
        </select>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={pending}>Guardar</button>
        <Mensaje state={state} />
      </div>
    </form>
  );
}
