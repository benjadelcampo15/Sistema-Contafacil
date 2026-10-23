import { ENDPOINTS, type AmbienteArca } from "./constants";
import { ArcaError, asArray, escapeXml, soapRequest } from "./soap";

/** Auth de WSFEv1. `cuit` es el CUIT REPRESENTADO (el cliente), no el del contador. */
export type WsfeAuth = { token: string; sign: string; cuit: string };

type ArcaMsg = { Code: string; Msg: string };

const NS = "http://ar.gov.afip.dif.FEV1/";

async function call(ambiente: AmbienteArca, metodo: string, inner: string) {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">
  <soapenv:Header/>
  <soapenv:Body><ar:${metodo}>${inner}</ar:${metodo}></soapenv:Body>
</soapenv:Envelope>`;
  const body = await soapRequest(ENDPOINTS[ambiente].wsfe, NS + metodo, envelope);
  const result = (body[`${metodo}Response`] as Record<string, unknown> | undefined)?.[`${metodo}Result`] as
    | Record<string, unknown>
    | undefined;
  if (!result) throw new ArcaError(`Respuesta vacía de ${metodo}`);
  return result;
}

function authXml(a: WsfeAuth) {
  return `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${a.cuit}</ar:Cuit></ar:Auth>`;
}

function errores(result: Record<string, unknown>): ArcaMsg[] {
  return asArray((result.Errors as { Err?: ArcaMsg | ArcaMsg[] } | undefined)?.Err);
}

function throwIfErrors(result: Record<string, unknown>) {
  const errs = errores(result);
  if (errs.length) {
    throw new ArcaError(
      errs.map((e) => `[${e.Code}] ${e.Msg}`).join(" | "),
      errs.map((e) => ({ code: e.Code, msg: e.Msg })),
    );
  }
}

export async function feDummy(ambiente: AmbienteArca) {
  const r = await call(ambiente, "FEDummy", "");
  return r as { AppServer: string; DbServer: string; AuthServer: string };
}

export async function ultimoAutorizado(ambiente: AmbienteArca, auth: WsfeAuth, ptoVta: number, cbteTipo: number) {
  const r = await call(
    ambiente,
    "FECompUltimoAutorizado",
    `${authXml(auth)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`,
  );
  throwIfErrors(r);
  return Number(r.CbteNro);
}

export async function puntosDeVenta(ambiente: AmbienteArca, auth: WsfeAuth) {
  const r = await call(ambiente, "FEParamGetPtosVenta", authXml(auth));
  const errs = errores(r);
  // 602 = "Sin resultados": el contribuyente no tiene puntos de venta web services dados de alta
  if (errs.length && !errs.every((e) => String(e.Code) === "602")) throwIfErrors(r);
  type Pv = { Nro: string; EmisionTipo: string; Bloqueado: string; FchBaja: string };
  return asArray((r.ResultGet as { PtoVenta?: Pv | Pv[] } | undefined)?.PtoVenta).map((p) => ({
    numero: Number(p.Nro),
    emisionTipo: p.EmisionTipo,
    bloqueado: p.Bloqueado === "S",
    baja: p.FchBaja && p.FchBaja !== "NULL" ? p.FchBaja : null,
  }));
}

export type DetalleComprobante = {
  concepto: number;
  docTipo: number;
  docNro: string;
  numero: number;
  fecha: string; // yyyymmdd
  impTotal: number;
  impNoGravado: number;
  impNeto: number;
  impExento: number;
  impIva: number;
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
  monedaId: string;
  monedaCotiz: number;
  condicionIvaReceptorId: number;
  asociados?: { tipo: number; ptoVta: number; nro: number; cuit?: string; fecha?: string }[];
  iva?: { id: number; baseImp: number; importe: number }[];
};

const m = (n: number) => n.toFixed(2);

export type ResultadoCae = {
  resultado: "A" | "R" | "P";
  cae: string | null;
  caeVto: string | null; // yyyymmdd
  observaciones: { code: string; msg: string }[];
  errores: { code: string; msg: string }[];
};

export async function solicitarCae(
  ambiente: AmbienteArca,
  auth: WsfeAuth,
  ptoVta: number,
  cbteTipo: number,
  d: DetalleComprobante,
): Promise<ResultadoCae> {
  // El orden de los elementos debe respetar el XSD de WSFEv1.
  const asoc = d.asociados?.length
    ? `<ar:CbtesAsoc>${d.asociados
        .map(
          (a) =>
            `<ar:CbteAsoc><ar:Tipo>${a.tipo}</ar:Tipo><ar:PtoVta>${a.ptoVta}</ar:PtoVta><ar:Nro>${a.nro}</ar:Nro>` +
            (a.cuit ? `<ar:Cuit>${a.cuit}</ar:Cuit>` : "") +
            (a.fecha ? `<ar:CbteFch>${a.fecha}</ar:CbteFch>` : "") +
            `</ar:CbteAsoc>`,
        )
        .join("")}</ar:CbtesAsoc>`
    : "";
  const iva = d.iva?.length
    ? `<ar:Iva>${d.iva
        .map(
          (i) =>
            `<ar:AlicIva><ar:Id>${i.id}</ar:Id><ar:BaseImp>${m(i.baseImp)}</ar:BaseImp><ar:Importe>${m(i.importe)}</ar:Importe></ar:AlicIva>`,
        )
        .join("")}</ar:Iva>`
    : "";
  const servicios =
    d.concepto !== 1
      ? `<ar:FchServDesde>${d.fchServDesde}</ar:FchServDesde><ar:FchServHasta>${d.fchServHasta}</ar:FchServHasta><ar:FchVtoPago>${d.fchVtoPago}</ar:FchVtoPago>`
      : "";

  const inner = `${authXml(auth)}
<ar:FeCAEReq>
  <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>
  <ar:FeDetReq><ar:FECAEDetRequest>
    <ar:Concepto>${d.concepto}</ar:Concepto>
    <ar:DocTipo>${d.docTipo}</ar:DocTipo>
    <ar:DocNro>${escapeXml(d.docNro)}</ar:DocNro>
    <ar:CbteDesde>${d.numero}</ar:CbteDesde>
    <ar:CbteHasta>${d.numero}</ar:CbteHasta>
    <ar:CbteFch>${d.fecha}</ar:CbteFch>
    <ar:ImpTotal>${m(d.impTotal)}</ar:ImpTotal>
    <ar:ImpTotConc>${m(d.impNoGravado)}</ar:ImpTotConc>
    <ar:ImpNeto>${m(d.impNeto)}</ar:ImpNeto>
    <ar:ImpOpEx>${m(d.impExento)}</ar:ImpOpEx>
    <ar:ImpTrib>0.00</ar:ImpTrib>
    <ar:ImpIVA>${m(d.impIva)}</ar:ImpIVA>
    ${servicios}
    <ar:MonId>${d.monedaId}</ar:MonId>
    <ar:MonCotiz>${d.monedaCotiz}</ar:MonCotiz>
    <ar:CondicionIVAReceptorId>${d.condicionIvaReceptorId}</ar:CondicionIVAReceptorId>
    ${asoc}
    ${iva}
  </ar:FECAEDetRequest></ar:FeDetReq>
</ar:FeCAEReq>`;

  const r = await call(ambiente, "FECAESolicitar", inner);
  const errs = errores(r).map((e) => ({ code: String(e.Code), msg: e.Msg }));

  type Det = {
    Resultado: "A" | "R" | "P";
    CAE?: string;
    CAEFchVto?: string;
    Observaciones?: { Obs?: ArcaMsg | ArcaMsg[] };
  };
  const det = asArray((r.FeDetResp as { FECAEDetResponse?: Det | Det[] } | undefined)?.FECAEDetResponse)[0];
  if (!det) {
    // Sin detalle: error de cabecera (auth, punto de venta, etc.)
    return { resultado: "R", cae: null, caeVto: null, observaciones: [], errores: errs };
  }
  return {
    resultado: det.Resultado,
    cae: det.CAE || null,
    caeVto: det.CAEFchVto || null,
    observaciones: asArray(det.Observaciones?.Obs).map((o) => ({ code: String(o.Code), msg: o.Msg })),
    errores: errs,
  };
}

/** Consulta un comprobante ya emitido (para recuperar el CAE si se cortó la conexión). */
export async function consultarComprobante(
  ambiente: AmbienteArca,
  auth: WsfeAuth,
  ptoVta: number,
  cbteTipo: number,
  numero: number,
) {
  const r = await call(
    ambiente,
    "FECompConsultar",
    `${authXml(auth)}<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`,
  );
  const errs = errores(r);
  // 602 = no existe el comprobante
  if (errs.some((e) => String(e.Code) === "602")) return null;
  throwIfErrors(r);
  const g = r.ResultGet as {
    CodAutorizacion: string;
    FchVto: string;
    Resultado: string;
    ImpTotal: string;
    DocNro: string;
  };
  return {
    cae: g.CodAutorizacion,
    caeVto: g.FchVto,
    resultado: g.Resultado,
    impTotal: Number(g.ImpTotal),
    docNro: g.DocNro,
  };
}
