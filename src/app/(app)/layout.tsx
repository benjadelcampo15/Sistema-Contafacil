import Link from "next/link";
import { requireContador } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const contador = await requireContador();
  const produccion = contador.ambiente === "PRODUCCION";

  return (
    <div className="min-h-screen md:flex">
      {/* Celular: barra superior con pestañas */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Link href="/clientes" className="text-lg font-semibold text-indigo-600">ContaFácil</Link>
          <div className="flex items-center gap-3 text-xs">
            <span className={produccion ? "font-semibold text-green-700" : "font-semibold text-amber-600"}>
              {produccion ? "Producción" : "Homologación"}
            </span>
            <form action={logout}>
              <button className="text-slate-500">Salir</button>
            </form>
          </div>
        </div>
        <div className="px-2">
          <NavLinks />
        </div>
      </header>

      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/clientes" className="mb-6 text-lg font-semibold text-indigo-600">ContaFácil</Link>
        <NavLinks vertical />
        <div className="mt-auto space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p className="truncate font-medium text-slate-700">{contador.nombre}</p>
          <p>
            Ambiente:{" "}
            <span className={produccion ? "font-semibold text-green-700" : "font-semibold text-amber-600"}>
              {produccion ? "Producción" : "Homologación"}
            </span>
          </p>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">Cerrar sesión</button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
