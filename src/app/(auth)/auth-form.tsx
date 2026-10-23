"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, registro, type AuthState } from "./actions";

export function AuthForm({ modo }: { modo: "login" | "registro" }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(modo === "login" ? login : registro, {});
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">ContaFácil</p>
          <h1 className="h1">{modo === "login" ? "Ingresar" : "Crear cuenta de estudio"}</h1>
        </div>
        {modo === "registro" && (
          <div>
            <label className="label" htmlFor="nombre">Nombre / Estudio</label>
            <input className="input" id="nombre" name="nombre" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete={modo === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn w-full" disabled={pending}>
          {pending ? "Procesando…" : modo === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
        <p className="text-center text-sm text-slate-600">
          {modo === "login" ? (
            <>¿No tenés cuenta? <Link className="text-indigo-600 hover:underline" href="/registro">Registrate</Link></>
          ) : (
            <>¿Ya tenés cuenta? <Link className="text-indigo-600 hover:underline" href="/login">Ingresá</Link></>
          )}
        </p>
      </form>
    </main>
  );
}
