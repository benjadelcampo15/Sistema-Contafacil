/**
 * Prueba rápida sin base de datos:  npm run smoke
 * - Conectividad con WSFEv1 de homologación (FEDummy)
 * - Firma CMS del TRA contra WSAA (con un certificado autofirmado: ARCA debe rechazarlo por no confiable,
 *   lo que confirma que el sobre SOAP y el CMS se parsean bien)
 * - Cálculo de totales A/B/C
 * - Generación de PDF con QR (sale en ./tmp-factura.pdf)
 */
import { writeFileSync } from "node:fs";
import forge from "node-forge";
import { feDummy } from "../src/lib/arca/wsfe";
import { generarClaveYCsr, loginCms } from "../src/lib/arca/wsaa";
import { calcularTotales } from "../src/lib/totales";
import { generarPdf, urlQr } from "../src/lib/pdf";

async function main() {
  console.log("1) FEDummy homologación…");
  console.log("   ", await feDummy("HOMOLOGACION"));

  console.log("2) WSAA con certificado autofirmado…");
  const { keyPem } = generarClaveYCsr({ cuit: "20111111112", nombre: "Prueba", alias: "smoke" });
  const key = forge.pki.privateKeyFromPem(keyPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: "commonName", value: "smoke" }]);
  cert.setIssuer([{ name: "commonName", value: "smoke" }]);
  cert.sign(key, forge.md.sha256.create());
  try {
    await loginCms("HOMOLOGACION", "wsfe", forge.pki.certificateToPem(cert), keyPem);
    console.log("    ¿ARCA aceptó un cert autofirmado? Inesperado");
  } catch (e) {
    console.log("    Rechazo esperado:", (e as Error).message);
  }

  console.log("3) Totales…");
  const items = [
    { descripcion: "Honorarios", cantidad: 1, precioUnitario: 100000, alicuotaIvaId: 5 },
    { descripcion: "Libro", cantidad: 3, precioUnitario: 1234.56, alicuotaIvaId: 4 },
  ];
  const a = calcularTotales(items, "A");
  const c = calcularTotales(items, "C");
  console.log("    A:", { neto: a.impNeto, iva: a.impIva, total: a.impTotal, alicuotas: a.alicuotas });
  console.log("    C:", { neto: c.impNeto, iva: c.impIva, total: c.impTotal });
  if (a.impTotal !== 125092.57 || c.impTotal !== 103703.68) throw new Error("Totales incorrectos");

  console.log("4) PDF…");
  const comp = {
    id: "x", clienteId: "c", puntoVentaId: "p", tipo: 1, numero: 123,
    fecha: new Date("2026-10-22T00:00:00Z"), concepto: 2,
    fchServDesde: new Date("2026-10-01T00:00:00Z"), fchServHasta: new Date("2026-10-31T00:00:00Z"),
    fchVtoPago: new Date("2026-11-10T00:00:00Z"), estado: "AUTORIZADO",
    docTipo: 80, docNro: "30712345671", receptorNombre: "Cliente Ejemplo SRL",
    receptorDomicilio: "Av. Corrientes 1234, CABA", receptorCondIvaId: 1,
    moneda: "PES", cotizacion: 1, impNeto: a.impNeto, impIva: a.impIva, impExento: 0, impTotal: a.impTotal,
    asociadoId: null, cae: "76432178901234", caeVto: new Date("2026-11-01T00:00:00Z"), observaciones: null,
    createdAt: new Date(),
    cliente: {
      id: "c", contadorId: "k", razonSocial: "Estudio de Prueba SA", nombreFantasia: null, cuit: "30700000001",
      condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "San Martín 500, Córdoba", iibb: "904-123456-7",
      inicioActividades: new Date("2015-03-01T00:00:00Z"), email: null, activo: true, createdAt: new Date(),
    },
    puntoVenta: { id: "p", clienteId: "c", numero: 3, descripcion: null },
    items: a.items.map((i, n) => ({ ...i, id: String(n), comprobanteId: "x" })),
    asociado: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bytes = await generarPdf(comp as any);
  writeFileSync("tmp-factura.pdf", bytes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log("    OK →", "tmp-factura.pdf", "| QR:", urlQr(comp as any).slice(0, 60) + "…");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
