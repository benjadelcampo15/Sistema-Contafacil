"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/clientes", label: "Clientes" },
  { href: "/comprobantes", label: "Comprobantes" },
  { href: "/configuracion", label: "Configuración" },
];

/** `vertical` para la barra lateral de escritorio; horizontal (pestañas) para celular. */
export function NavLinks({ vertical = false }: { vertical?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={vertical ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {NAV.map((n) => {
        const activo = pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={
              vertical
                ? `rounded-md px-3 py-2 text-sm ${activo ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`
                : `whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${activo ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-600"}`
            }
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
