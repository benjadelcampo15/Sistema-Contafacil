// Códigos de las tablas paramétricas de WSFEv1 (FEParamGet*).

export const TIPOS_COMPROBANTE: Record<number, { nombre: string; letra: "A" | "B" | "C"; clase: "F" | "ND" | "NC" }> = {
  1: { nombre: "Factura A", letra: "A", clase: "F" },
  2: { nombre: "Nota de Débito A", letra: "A", clase: "ND" },
  3: { nombre: "Nota de Crédito A", letra: "A", clase: "NC" },
  6: { nombre: "Factura B", letra: "B", clase: "F" },
  7: { nombre: "Nota de Débito B", letra: "B", clase: "ND" },
  8: { nombre: "Nota de Crédito B", letra: "B", clase: "NC" },
  11: { nombre: "Factura C", letra: "C", clase: "F" },
  12: { nombre: "Nota de Débito C", letra: "C", clase: "ND" },
  13: { nombre: "Nota de Crédito C", letra: "C", clase: "NC" },
};

export const TIPOS_DOCUMENTO: Record<number, string> = {
  80: "CUIT",
  86: "CUIL",
  96: "DNI",
  99: "Consumidor Final",
};

export const CONCEPTOS: Record<number, string> = {
  1: "Productos",
  2: "Servicios",
  3: "Productos y Servicios",
};

/** Alícuotas de IVA: id ARCA → porcentaje */
export const ALICUOTAS_IVA: Record<number, number> = {
  3: 0,
  9: 2.5,
  8: 5,
  4: 10.5,
  5: 21,
  6: 27,
};

/** Condición frente al IVA del receptor (RG 5616, campo CondicionIVAReceptorId) */
export const CONDICIONES_IVA_RECEPTOR: Record<number, string> = {
  1: "IVA Responsable Inscripto",
  4: "IVA Sujeto Exento",
  5: "Consumidor Final",
  6: "Responsable Monotributo",
  7: "Sujeto No Categorizado",
  8: "Proveedor del Exterior",
  9: "Cliente del Exterior",
  10: "IVA Liberado – Ley 19.640",
  13: "Monotributista Social",
  15: "IVA No Alcanzado",
  16: "Monotributo Trabajador Independiente Promovido",
};

const RECEPTORES_FACTURA_A = new Set([1, 6, 13, 16]);

/** Letra de comprobante que corresponde según emisor y receptor. */
export function letraComprobante(
  condicionEmisor: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO",
  condIvaReceptorId: number,
): "A" | "B" | "C" {
  if (condicionEmisor !== "RESPONSABLE_INSCRIPTO") return "C";
  return RECEPTORES_FACTURA_A.has(condIvaReceptorId) ? "A" : "B";
}

export function tiposPorLetra(letra: "A" | "B" | "C") {
  return Object.entries(TIPOS_COMPROBANTE)
    .filter(([, t]) => t.letra === letra)
    .map(([id, t]) => ({ id: Number(id), ...t }));
}

export const ENDPOINTS = {
  HOMOLOGACION: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  PRODUCCION: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
} as const;

export type AmbienteArca = keyof typeof ENDPOINTS;
