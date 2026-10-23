"use client";

import { useActionState } from "react";
import { verificar } from "../actions";

export function VerificarButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<{ error?: string }>(verificar.bind(null, id), {});
  return (
    <form action={action} className="flex items-center gap-3">
      <button className="btn" disabled={pending}>{pending ? "Consultando…" : "Verificar en ARCA"}</button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
