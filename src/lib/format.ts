import { TIPOS_COMPROBANTE } from "./arca/constants";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export const moneda = (n: number | string | { toString(): string }) => ars.format(Number(n.toString()));

/** Fechas @db.Date vienen a medianoche UTC: formatear en UTC para no correr un día. */
export const fecha = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const cuit = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

export const numeroComprobante = (ptoVta: number, numero: number | null) =>
  `${String(ptoVta).padStart(5, "0")}-${numero == null ? "—" : String(numero).padStart(8, "0")}`;

export const nombreTipo = (tipo: number) => TIPOS_COMPROBANTE[tipo]?.nombre ?? `Tipo ${tipo}`;

/** Valida el dígito verificador de un CUIT/CUIL. */
export function cuitValido(c: string) {
  if (!/^\d{11}$/.test(c)) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = mult.reduce((s, m, i) => s + m * Number(c[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(c[10]);
}

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

export const hoyISO = () => {
  // Fecha local de Argentina (UTC-3)
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};
