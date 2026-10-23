import https from "node:https";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // dejamos todo como string: CUITs, CAE y números de comprobante no deben perder precisión
});

export function parseXml<T = unknown>(xml: string): T {
  return parser.parse(xml) as T;
}

export function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class ArcaError extends Error {
  constructor(
    message: string,
    public readonly detalles: { code?: string | number; msg: string }[] = [],
  ) {
    super(message);
    this.name = "ArcaError";
  }
}

export async function soapRequest(url: string, soapAction: string, envelope: string, timeoutMs = 30000) {
  const { status, text } = await post(url, soapAction, envelope, timeoutMs);
  const parsed = parseXml<{ Envelope?: { Body?: Record<string, unknown> } }>(text);
  const body = parsed.Envelope?.Body;
  if (!body) throw new ArcaError(`Respuesta inválida de ARCA (HTTP ${status})`);

  const fault = body.Fault as { faultstring?: string } | undefined;
  if (fault) throw new ArcaError(fault.faultstring ?? "SOAP Fault");

  return body;
}

/** Los servidores de producción de ARCA (servicios1.afip.gov.ar) negocian DH de 1024 bits, que OpenSSL 3
 *  rechaza por defecto ("dh key too small"). Bajamos el nivel de seguridad SOLO para estas conexiones;
 *  la verificación del certificado del servidor sigue activa. */
const arcaAgent = new https.Agent({ keepAlive: true, ciphers: "DEFAULT@SECLEVEL=1" });

function post(url: string, soapAction: string, body: string, timeoutMs: number) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent: arcaAgent,
        timeout: timeoutMs,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          SOAPAction: soapAction,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("Tiempo de espera agotado con ARCA"), { name: "TimeoutError" })));
    req.on("error", reject);
    req.end(body);
  });
}

/** fast-xml-parser devuelve objeto si hay un solo elemento y array si hay varios. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}
