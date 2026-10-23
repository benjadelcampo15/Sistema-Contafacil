import Link from "next/link";
import { requireContador } from "@/lib/auth";
import { CuentaForm } from "./forms";

export default async function ConfiguracionPage() {
  const contador = await requireContador();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="h1">Configuración</h1>

      <section className="card space-y-4">
        <h2 className="h2">Cuenta</h2>
        <p className="text-sm text-slate-600">Ingresás con {contador.email}.</p>
        <CuentaForm nombre={contador.nombre} ambiente={contador.ambiente} />
        {contador.ambiente === "HOMOLOGACION" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            En homologación los certificados de producción no funcionan: usá certificados sacados desde WSASS.
          </p>
        )}
      </section>

      <section className="card space-y-2 text-sm text-slate-600">
        <h2 className="h2 text-slate-900">Conexión con ARCA</h2>
        <p>
          Cada cliente se conecta con su propio certificado. Se configura desde la ficha de cada uno en{" "}
          <Link href="/clientes" className="text-indigo-600 hover:underline">Clientes</Link>, en la sección
          &quot;Conexión con ARCA&quot;.
        </p>
      </section>
    </div>
  );
}
