export function Mensaje({ state }: { state: { ok?: string; error?: string } }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700">{state.ok}</p>;
  return null;
}

export function EstadoBadge({ estado }: { estado: "PENDIENTE" | "AUTORIZADO" | "RECHAZADO" }) {
  const estilos = {
    AUTORIZADO: "bg-green-100 text-green-800",
    PENDIENTE: "bg-amber-100 text-amber-800",
    RECHAZADO: "bg-red-100 text-red-800",
  };
  const textos = { AUTORIZADO: "Autorizado", PENDIENTE: "Pendiente", RECHAZADO: "Rechazado" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estilos[estado]}`}>{textos[estado]}</span>;
}
