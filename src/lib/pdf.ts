import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { Cliente, Comprobante, ComprobanteItem, PuntoVenta } from "@prisma/client";
import { ALICUOTAS_IVA, CONCEPTOS, CONDICIONES_IVA_RECEPTOR, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO } from "./arca/constants";
import { cuit, fecha, moneda, numeroComprobante } from "./format";

type ComprobanteCompleto = Comprobante & {
  cliente: Cliente;
  puntoVenta: PuntoVenta;
  items: ComprobanteItem[];
  asociado: (Comprobante & { puntoVenta: PuntoVenta }) | null;
};

const CONDICION_EMISOR = {
  RESPONSABLE_INSCRIPTO: "IVA Responsable Inscripto",
  MONOTRIBUTO: "Responsable Monotributo",
  EXENTO: "IVA Sujeto Exento",
} as const;

/** URL del QR según la especificación de ARCA (RG 4892). */
export function urlQr(c: ComprobanteCompleto) {
  const datos = {
    ver: 1,
    fecha: c.fecha.toISOString().slice(0, 10),
    cuit: Number(c.cliente.cuit),
    ptoVta: c.puntoVenta.numero,
    tipoCmp: c.tipo,
    nroCmp: c.numero,
    importe: Number(c.impTotal),
    moneda: c.moneda,
    ctz: Number(c.cotizacion),
    tipoDocRec: c.docTipo,
    nroDocRec: Number(c.docNro),
    tipoCodAut: "E",
    codAut: Number(c.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString("base64")}`;
}

export async function generarPdf(c: ComprobanteCompleto): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 36;
  const gris = rgb(0.4, 0.4, 0.4);
  const tipo = TIPOS_COMPROBANTE[c.tipo];

  const text = (s: string, x: number, y: number, size = 9, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(s, { x, y, size, font: f, color });
  const textRight = (s: string, xRight: number, y: number, size = 9, f: PDFFont = font) =>
    text(s, xRight - f.widthOfTextAtSize(s, size), y, size, f);
  const box = (x: number, y: number, w: number, h: number) =>
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.8 });

  // ---------- Encabezado ----------
  const headTop = height - M;
  const headH = 130;
  box(M, headTop - headH, width - 2 * M, headH);
  page.drawLine({ start: { x: width / 2, y: headTop - headH }, end: { x: width / 2, y: headTop - 50 }, thickness: 0.8 });

  // Recuadro de la letra
  const lw = 50;
  box(width / 2 - lw / 2, headTop - 50, lw, 50);
  textCentered(page, tipo.letra, width / 2, headTop - 33, 28, bold);
  textCentered(page, `COD. ${String(c.tipo).padStart(2, "0")}`, width / 2, headTop - 46, 7, bold);

  // Emisor (izquierda)
  let y = headTop - 22;
  for (const linea of wrap(c.cliente.razonSocial, bold, 13, width / 2 - M - lw / 2 - 16)) {
    text(linea, M + 10, y, 13, bold);
    y -= 15;
  }
  y -= 6;
  text("Domicilio comercial:", M + 10, y, 8, bold);
  y -= 11;
  for (const linea of wrap(c.cliente.domicilio, font, 8, width / 2 - M - 20)) {
    text(linea, M + 10, y, 8);
    y -= 10;
  }
  text("Condición frente al IVA:", M + 10, y - 4, 8, bold);
  text(CONDICION_EMISOR[c.cliente.condicionIva], M + 10, y - 15, 8);

  // Datos del comprobante (derecha)
  const rx = width / 2 + lw / 2 + 12;
  text(tipo.nombre.toUpperCase(), rx, headTop - 22, 13, bold);
  const [pv, nro] = numeroComprobante(c.puntoVenta.numero, c.numero).split("-");
  const pares: [string, string][] = [
    ["Punto de Venta:", `${pv}    Comp. Nro: ${nro}`],
    ["Fecha de Emisión:", fecha(c.fecha)],
    ["CUIT:", cuit(c.cliente.cuit)],
    ["Ingresos Brutos:", c.cliente.iibb ?? "-"],
    ["Inicio de Actividades:", fecha(c.cliente.inicioActividades)],
  ];
  y = headTop - 45;
  for (const [k, v] of pares) {
    text(k, rx, y, 8, bold);
    text(v, rx + 92, y, 8);
    y -= 14;
  }

  // ---------- Período / concepto ----------
  y = headTop - headH - 4;
  box(M, y - 20, width - 2 * M, 20);
  if (c.concepto !== 1) {
    text("Período Facturado Desde:", M + 8, y - 13, 8, bold);
    text(fecha(c.fchServDesde), M + 112, y - 13, 8);
    text("Hasta:", M + 180, y - 13, 8, bold);
    text(fecha(c.fchServHasta), M + 208, y - 13, 8);
    text("Fecha de Vto. para el pago:", M + 300, y - 13, 8, bold);
    text(fecha(c.fchVtoPago), M + 415, y - 13, 8);
  } else {
    text("Concepto:", M + 8, y - 13, 8, bold);
    text(CONCEPTOS[c.concepto], M + 52, y - 13, 8);
  }
  y -= 24;

  // ---------- Receptor ----------
  const recH = 46;
  box(M, y - recH, width - 2 * M, recH);
  const doc = c.docTipo === 99 ? "-" : c.docTipo === 80 ? cuit(c.docNro) : c.docNro;
  text(`${TIPOS_DOCUMENTO[c.docTipo]}:`, M + 8, y - 14, 8, bold);
  text(doc, M + 60, y - 14, 8);
  text("Apellido y Nombre / Razón Social:", M + 200, y - 14, 8, bold);
  text(c.receptorNombre.slice(0, 45), M + 340, y - 14, 8);
  text("Condición frente al IVA:", M + 8, y - 28, 8, bold);
  text(CONDICIONES_IVA_RECEPTOR[c.receptorCondIvaId] ?? "-", M + 105, y - 28, 8);
  text("Domicilio:", M + 300, y - 28, 8, bold);
  text((c.receptorDomicilio ?? "-").slice(0, 45), M + 345, y - 28, 8);
  if (c.asociado) {
    text("Comprobante asociado:", M + 8, y - 41, 8, bold);
    text(
      `${TIPOS_COMPROBANTE[c.asociado.tipo].nombre} ${numeroComprobante(c.asociado.puntoVenta.numero, c.asociado.numero)} del ${fecha(c.asociado.fecha)}`,
      M + 100,
      y - 41,
      8,
    );
  }
  y -= recH + 8;

  // ---------- Ítems ----------
  const discrimina = tipo.letra === "A";
  const cols = discrimina
    ? { desc: M + 6, cant: 330, precio: 405, iva: 450, sub: width - M - 6 }
    : { desc: M + 6, cant: 380, precio: 470, iva: 0, sub: width - M - 6 };
  page.drawRectangle({ x: M, y: y - 16, width: width - 2 * M, height: 16, color: rgb(0.9, 0.9, 0.9) });
  text("Descripción", cols.desc, y - 11, 8, bold);
  textRight("Cantidad", cols.cant, y - 11, 8, bold);
  textRight("Precio Unit.", cols.precio, y - 11, 8, bold);
  if (discrimina) textRight("% IVA", cols.iva + 20, y - 11, 8, bold);
  textRight(discrimina ? "Subtotal s/IVA" : "Subtotal", cols.sub, y - 11, 8, bold);
  y -= 30;

  for (const it of c.items) {
    // En B el precio se muestra con IVA incluido (no se discrimina)
    const pct = it.alicuotaIvaId != null ? ALICUOTAS_IVA[it.alicuotaIvaId] : 0;
    const factor = tipo.letra === "B" ? 1 + pct / 100 : 1;
    const lineas = wrap(it.descripcion, font, 8, cols.cant - cols.desc - 60);
    textRight(fmtNum(Number(it.cantidad)), cols.cant, y, 8);
    textRight(moneda(Number(it.precioUnitario) * factor), cols.precio, y, 8);
    if (discrimina) textRight(`${String(pct).replace(".", ",")}%`, cols.iva + 20, y, 8);
    textRight(moneda(Number(it.subtotal) + (tipo.letra === "B" ? Number(it.iva) : 0)), cols.sub, y, 8);
    for (const l of lineas) {
      text(l, cols.desc, y, 8);
      y -= 11;
    }
    y -= 3;
  }

  // ---------- Totales ----------
  const totTop = 215;
  box(M, totTop - 70, width - 2 * M, 70);
  let ty = totTop - 16;
  const fila = (k: string, v: string, f: PDFFont = font, size = 9) => {
    textRight(k, width - M - 110, ty, size, f);
    textRight(v, width - M - 8, ty, size, f);
    ty -= 14;
  };
  if (discrimina) {
    fila("Importe Neto Gravado:", moneda(c.impNeto));
    fila("IVA:", moneda(c.impIva));
  }
  fila("Importe Total:", moneda(c.impTotal), bold, 11);
  if (tipo.letra === "B") {
    text("Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", M + 8, totTop - 16, 7, bold);
    text(`IVA Contenido: ${moneda(c.impIva)}`, M + 8, totTop - 28, 7);
  }

  // ---------- Pie: QR + CAE ----------
  if (c.cae) {
    const png = await QRCode.toBuffer(urlQr(c), { margin: 0, width: 300 });
    const qr = await pdf.embedPng(png);
    page.drawImage(qr, { x: M, y: M + 4, width: 90, height: 90 });
    text("ARCA", M + 104, M + 72, 16, bold);
    text("Comprobante Autorizado", M + 104, M + 56, 9, bold);
    text("Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación", M + 104, M + 44, 6, font, gris);
    textRight(`CAE N°: ${c.cae}`, width - M, M + 72, 10, bold);
    textRight(`Fecha de Vto. de CAE: ${fecha(c.caeVto)}`, width - M, M + 56, 10, bold);
  }

  return pdf.save();
}

function textCentered(page: PDFPage, s: string, cx: number, y: number, size: number, f: PDFFont) {
  page.drawText(s, { x: cx - f.widthOfTextAtSize(s, size) / 2, y, size, font: f });
}

function wrap(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of s.split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (f.widthOfTextAtSize(prueba, size) > maxW && linea) {
      out.push(linea);
      linea = palabra;
    } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}

const fmtNum = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 4 });
