"use client";

import { useActionState } from "react";
import type { Cliente } from "@prisma/client";
import { Mensaje } from "@/components/mensaje";
import { guardarCliente, type FormState } from "./actions";

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const [state, action, pending] = useActionState<FormState, FormData>(guardarCliente, {});
  return (
    <form action={action} className="card grid max-w-3xl grid-cols-2 gap-4">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      <div className="col-span-2">
        <label className="label" htmlFor="razonSocial">Razón social *</label>
        <input className="input" id="razonSocial" name="razonSocial" defaultValue={cliente?.razonSocial} required />
      </div>
      <div>
        <label className="label" htmlFor="cuit">CUIT *</label>
        <input className="input" id="cuit" name="cuit" defaultValue={cliente?.cuit} placeholder="30-12345678-9" required />
      </div>
      <div>
        <label className="label" htmlFor="condicionIva">Condición frente al IVA *</label>
        <select className="input" id="condicionIva" name="condicionIva" defaultValue={cliente?.condicionIva ?? "MONOTRIBUTO"}>
          <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto (emite A/B)</option>
          <option value="MONOTRIBUTO">Monotributo (emite C)</option>
          <option value="EXENTO">Exento (emite C)</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor="domicilio">Domicilio comercial *</label>
        <input className="input" id="domicilio" name="domicilio" defaultValue={cliente?.domicilio} required />
      </div>
      <div>
        <label className="label" htmlFor="nombreFantasia">Nombre de fantasía</label>
        <input className="input" id="nombreFantasia" name="nombreFantasia" defaultValue={cliente?.nombreFantasia ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" defaultValue={cliente?.email ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="iibb">Ingresos Brutos</label>
        <input className="input" id="iibb" name="iibb" defaultValue={cliente?.iibb ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="inicioActividades">Inicio de actividades</label>
        <input
          className="input"
          id="inicioActividades"
          name="inicioActividades"
          type="date"
          defaultValue={cliente?.inicioActividades?.toISOString().slice(0, 10) ?? ""}
        />
      </div>
      <div className="col-span-2 flex items-center gap-3">
        <button className="btn" disabled={pending}>{cliente ? "Guardar cambios" : "Crear cliente"}</button>
        <Mensaje state={state} />
      </div>
    </form>
  );
}
