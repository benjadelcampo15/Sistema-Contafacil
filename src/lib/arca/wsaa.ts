import forge from "node-forge";
import { ENDPOINTS, type AmbienteArca } from "./constants";
import { ArcaError, parseXml, soapRequest } from "./soap";

export type TicketAcceso = { token: string; sign: string; expiresAt: Date };

/** Ticket de Requerimiento de Acceso (TRA) firmado en CMS, como pide WSAA. */
function buildTra(servicio: string): string {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now / 1000)}</uniqueId>
    <generationTime>${iso(now - 10 * 60 * 1000)}</generationTime>
    <expirationTime>${iso(now + 10 * 60 * 1000)}</expirationTime>
  </header>
  <service>${servicio}</service>
</loginTicketRequest>`;
}

function signTra(tra: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

export async function loginCms(
  ambiente: AmbienteArca,
  servicio: string,
  certPem: string,
  keyPem: string,
): Promise<TicketAcceso> {
  const cms = signTra(buildTra(servicio), certPem, keyPem);
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const body = await soapRequest(ENDPOINTS[ambiente].wsaa, "", envelope);
  const ret = (body.loginCmsResponse as { loginCmsReturn?: string } | undefined)?.loginCmsReturn;
  if (!ret) throw new ArcaError("WSAA no devolvió el ticket de acceso");

  const ta = parseXml<{
    loginTicketResponse: { header: { expirationTime: string }; credentials: { token: string; sign: string } };
  }>(ret).loginTicketResponse;

  return {
    token: ta.credentials.token,
    sign: ta.credentials.sign,
    expiresAt: new Date(ta.header.expirationTime),
  };
}

/** Genera clave privada RSA 2048 + CSR para pedir el certificado en ARCA. */
export function generarClaveYCsr(opts: { cuit: string; nombre: string; alias: string }) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: opts.nombre },
    { name: "commonName", value: opts.alias },
    { type: "2.5.4.5", value: `CUIT ${opts.cuit}` }, // serialNumber
  ]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    csrPem: forge.pki.certificationRequestToPem(csr),
  };
}

/** Datos básicos del certificado para mostrar en pantalla. */
export function infoCertificado(certPem: string) {
  const cert = forge.pki.certificateFromPem(certPem);
  const attr = (name: string) => cert.subject.getField(name)?.value as string | undefined;
  return {
    alias: attr("CN"),
    serial: cert.subject.getField({ type: "2.5.4.5" })?.value as string | undefined,
    emisor: cert.issuer.getField("CN")?.value as string | undefined,
    validoDesde: cert.validity.notBefore,
    validoHasta: cert.validity.notAfter,
  };
}

export function claveCorrespondeACertificado(certPem: string, keyPem: string): boolean {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  return pub.n.equals(key.n) && pub.e.equals(key.e);
}
