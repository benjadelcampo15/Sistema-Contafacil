import { ALICUOTAS_IVA, CONCEPTOS, CONDICIONES_IVA_RECEPTOR, letraComprobante, tiposPorLetra } from "./arca/constants";
import { calcularTotales } from "./totales";
import { cuitValido } from "./format";

/** Columnas de la plantilla, en orden. `clave` es el nombre interno. */
export const COLUMNAS = [
  { clave: "factura", titulo: "Factura", ayuda: "Opcional. Filas con el mismo número forman una sola factura con varios ítems." },
  { clave: "fecha", titulo: "Fecha", ayuda: "Opcional (dd/mm/aaaa). Si está vacía, hoy." },
  { clave: "tipoDoc", titulo: "Tipo doc", ayuda: "CUIT, CUIL, DNI o Consumidor Final." },
  { clave: "nroDoc", titulo: "Nro doc", ayuda: "Sin guiones. Vacío para Consumidor Final." },
  { clave: "nombre", titulo: "Nombre", ayuda: "Nombre o razón social del comprador." },
  { clave: "condicionIva", titulo: "Condición IVA", ayuda: "Consumidor Final, Monotributo, Responsable Inscripto o Exento." },
  { clave: "domicilio", titulo: "Domicilio", ayuda: "Opcional." },
  { clave: "concepto", titulo: "Concepto", ayuda: "Productos, Servicios o Ambos. Si está vacío, Servicios." },
  { clave: "desde", titulo: "Servicio desde", ayuda: "Opcional. Si está vacío, el 1° del mes de la fecha." },
  { clave: "hasta", titulo: "Servicio hasta", ayuda: "Opcional. Si está vacío, la fecha de la factura." },
  { clave: "vto", titulo: "Vto pago", ayuda: "Opcional. Si está vacío, la fecha de la factura." },
  { clave: "descripcion", titulo: "Descripción", ayuda: "Detalle del ítem." },
  { clave: "cantidad", titulo: "Cantidad", ayuda: "Opcional. Si está vacía, 1." },
  { clave: "precio", titulo: "Precio unitario", ayuda: "Factura C: precio final. Factura A/B: precio sin IVA." },
  { clave: "iva", titulo: "IVA %", ayuda: "Solo Responsables Inscriptos: 0, 2.5, 5, 10.5, 21 o 27. Si está vacío, 21." },
] as const;

type Clave = (typeof COLUMNAS)[number]["clave"];
export type FilaExcel = Record<string, unknown>;

export type FacturaLote = {
  id: string;
  filas: number[]; // números de fila del Excel (para mostrar errores)
  errores: string[];
  tipo: number;
  fecha: string; // yyyy-mm-dd
  concepto: 1 | 2 | 3;
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
  receptor: { docTipo: number; docNro: string; nombre: string; domicilio?: string; condicionIvaId: number };
  items: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIvaId: number | null }[];
  total: number;
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Encabezado del Excel → clave interna (tolera mayúsculas, acentos y algunas variantes). */
const ALIAS: Record<string, Clave> = Object.fromEntries([
  ...COLUMNAS.map((c) => [normalizar(c.titulo), c.clave]),
  ["nfactura", "factura"],
  ["nrofactura", "factura"],
  ["documento", "nroDoc"],
  ["cuit", "nroDoc"],
  ["dni", "nroDoc"],
  ["numerodoc", "nroDoc"],
  ["razonsocial", "nombre"],
  ["cliente", "nombre"],
  ["condicion", "condicionIva"],
  ["detalle", "descripcion"],
  ["precio", "precio"],
  ["importe", "precio"],
  ["alicuota", "iva"],
  ["iva", "iva"],
  ["vencimiento", "vto"],
  ["vtodepago", "vto"],
  ["desde", "desde"],
  ["hasta", "hasta"],
]);

function texto(v: unknown) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Números en formato argentino ("1.234,56") o de Excel. */
function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = texto(v).replace(/[$\s%]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fechas como Date de Excel, "dd/mm/aaaa", "dd-mm-aa" o "aaaa-mm-dd". */
function fecha(v: unknown): string | null | undefined {
  if (v == null || texto(v) === "") return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
  const s = texto(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(anio, Number(m[2]) - 1, Number(m[1]));
    return d.getMonth() === Number(m[2]) - 1 ? iso(d) : null;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function tipoDoc(v: unknown): number | null {
  const s = normalizar(texto(v));
  if (!s || s === "cf" || s.startsWith("consumidor") || s === "99") return 99;
  if (s === "cuit" || s === "80") return 80;
  if (s === "cuil" || s === "86") return 86;
  if (s === "dni" || s === "96") return 96;
  return null;
}

function condicionIva(v: unknown, docTipo: number): number | null {
  const s = normalizar(texto(v));
  if (!s) return docTipo === 99 || docTipo === 96 ? 5 : null;
  if (/^\d+$/.test(s)) return Number(s) in CONDICIONES_IVA_RECEPTOR ? Number(s) : null;
  if (s === "cf" || s.startsWith("consumidor")) return 5;
  if (s === "ri" || s.startsWith("responsable") || s.includes("inscripto")) return 1;
  if (s.startsWith("monotrib") || s === "mt") return 6;
  if (s.startsWith("exento")) return 4;
  if (s.includes("noalcanzado")) return 15;
  return null;
}

function concepto(v: unknown): 1 | 2 | 3 | null {
  const s = normalizar(texto(v));
  if (!s || s.startsWith("serv") || s === "2") return 2;
  if (s.startsWith("prod") || s === "1") return 1;
  if (s.startsWith("ambos") || s.includes("productosyservicios") || s === "3") return 3;
  return null;
}

const ALICUOTA_POR_PCT = Object.fromEntries(Object.entries(ALICUOTAS_IVA).map(([id, pct]) => [String(pct), Number(id)]));

function alicuota(v: unknown): number | null {
  let n = numero(v);
  if (n == null) return 5; // 21%
  if (n > 0 && n < 1) n = Math.round(n * 1000) / 10; // 0.21 → 21
  return ALICUOTA_POR_PCT[String(n)] ?? null;
}

/** Convierte las filas de la planilla en facturas listas para emitir. */
export function interpretarLote(
  filas: FilaExcel[],
  condicionEmisor: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO",
  hoy: string,
): { facturas: FacturaLote[]; columnasDesconocidas: string[] } {
  const desconocidas = new Set<string>();
  const grupos = new Map<string, { fila: number; datos: Partial<Record<Clave, unknown>> }[]>();

  filas.forEach((f, i) => {
    const datos: Partial<Record<Clave, unknown>> = {};
    for (const [col, valor] of Object.entries(f)) {
      const clave = ALIAS[normalizar(col)];
      if (clave) datos[clave] = valor;
      else if (!col.startsWith("__")) desconocidas.add(col);
    }
    if (Object.values(datos).every((v) => texto(v) === "")) return; // fila vacía
    if (/^ejemplo/i.test(texto(datos.factura))) return; // filas de ejemplo de la plantilla: nunca se emiten
    const nroFila = i + 2; // fila 1 = encabezados
    const clave = texto(datos.factura) ? `f:${texto(datos.factura)}` : `fila:${nroFila}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push({ fila: nroFila, datos });
  });

  const facturas: FacturaLote[] = [];
  for (const [id, filasGrupo] of grupos) {
    const errores: string[] = [];
    const cab = filasGrupo[0].datos;

    const fch = fecha(cab.fecha);
    if (fch === null) errores.push("Fecha inválida");
    const fechaFactura = fch ?? hoy;

    const docTipo = tipoDoc(cab.tipoDoc);
    if (docTipo == null) errores.push(`Tipo de documento "${texto(cab.tipoDoc)}" no reconocido`);
    const docNro = texto(cab.nroDoc).replace(/\D/g, "");
    if (docTipo === 80 || docTipo === 86) {
      if (!cuitValido(docNro)) errores.push(`CUIT/CUIL "${texto(cab.nroDoc)}" inválido`);
    } else if (docTipo === 96 && !/^\d{7,8}$/.test(docNro)) {
      errores.push(`DNI "${texto(cab.nroDoc)}" inválido`);
    }

    const condIva = condicionIva(cab.condicionIva, docTipo ?? 99);
    if (condIva == null) errores.push(`Condición de IVA "${texto(cab.condicionIva)}" no reconocida`);
    if (docTipo === 99 && condIva != null && condIva !== 5) errores.push("Sin documento solo se puede facturar a Consumidor Final");

    const nombre = texto(cab.nombre) || (docTipo === 99 ? "Consumidor Final" : "");
    if (!nombre) errores.push("Falta el nombre del comprador");

    const conc = concepto(cab.concepto);
    if (conc == null) errores.push(`Concepto "${texto(cab.concepto)}" no reconocido`);

    const desde = fecha(cab.desde);
    const hasta = fecha(cab.hasta);
    const vto = fecha(cab.vto);
    if (desde === null || hasta === null || vto === null) errores.push("Fecha de servicio o vencimiento inválida");

    const letra = letraComprobante(condicionEmisor, condIva ?? 5);
    const items = filasGrupo.map(({ fila, datos }) => {
      const descripcion = texto(datos.descripcion);
      const cantidad = numero(datos.cantidad) ?? 1;
      const precio = numero(datos.precio);
      const alic = letra === "C" ? null : alicuota(datos.iva);
      if (!descripcion) errores.push(`Fila ${fila}: falta la descripción`);
      if (!(cantidad > 0)) errores.push(`Fila ${fila}: cantidad inválida`);
      if (precio == null || !(precio > 0)) errores.push(`Fila ${fila}: precio inválido`);
      if (letra !== "C" && alic == null) errores.push(`Fila ${fila}: alícuota de IVA "${texto(datos.iva)}" inválida`);
      return { descripcion, cantidad, precioUnitario: precio ?? 0, alicuotaIvaId: letra === "C" ? null : (alic ?? 5) };
    });

    const primerDia = `${fechaFactura.slice(0, 8)}01`;
    facturas.push({
      id,
      filas: filasGrupo.map((f) => f.fila),
      errores,
      tipo: tiposPorLetra(letra).find((t) => t.clase === "F")!.id,
      fecha: fechaFactura,
      concepto: conc ?? 2,
      ...(conc !== 1 && {
        fchServDesde: desde ?? primerDia,
        fchServHasta: hasta ?? fechaFactura,
        fchVtoPago: vto ?? fechaFactura,
      }),
      receptor: {
        docTipo: docTipo ?? 99,
        docNro: docTipo === 99 ? "0" : docNro,
        nombre,
        domicilio: texto(cab.domicilio) || undefined,
        condicionIvaId: condIva ?? 5,
      },
      items,
      total: calcularTotales(items, letra).impTotal,
    });
  }
  return { facturas, columnasDesconocidas: [...desconocidas] };
}

export const nombreConcepto = (c: number) => CONCEPTOS[c];
