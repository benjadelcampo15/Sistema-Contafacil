import "server-only";
import type { Cliente, Contador } from "@prisma/client";
import { db } from "./db";
import { decrypt } from "./crypto";
import { loginCms } from "./arca/wsaa";
import {
  consultarComprobante,
  solicitarCae,
  ultimoAutorizado,
  type DetalleComprobante,
  type WsfeAuth,
} from "./arca/wsfe";
import { TIPOS_COMPROBANTE, letraComprobante } from "./arca/constants";
import { ArcaError } from "./arca/soap";
import { calcularTotales, type ItemInput } from "./totales";

const SERVICIO = "wsfe";

// ---------- Autenticación WSAA con cache en base ----------

type Certificado = { titular: string; certPem: string; keyEnc: string };

/** Ticket WSAA. Sin `cert` usa el certificado del contador; con `cert`, el del cliente. */
export async function ticketWsfe(contador: Contador, cert?: Certificado) {
  const c: Certificado | null =
    cert ?? (contador.certPem && contador.keyEnc ? { titular: "", certPem: contador.certPem, keyEnc: contador.keyEnc } : null);
  if (!c) throw new ArcaError("Falta configurar el certificado de ARCA en Configuración");

  const where = {
    contadorId_titular_servicio_ambiente: {
      contadorId: contador.id,
      titular: c.titular,
      servicio: SERVICIO,
      ambiente: contador.ambiente,
    },
  };
  const cached = await db.tokenArca.findUnique({ where });
  if (cached && cached.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) return cached;

  const ta = await loginCms(contador.ambiente, SERVICIO, c.certPem, decrypt(c.keyEnc));
  return db.tokenArca.upsert({
    where,
    create: { ...where.contadorId_titular_servicio_ambiente, ...ta },
    update: ta,
  });
}

/** Auth para operar en nombre del cliente: con su propio certificado si lo tiene,
 *  o con el del contador si el cliente le delegó wsfe. */
export async function authCliente(
  contador: Contador,
  cliente: Pick<Cliente, "cuit" | "certPem" | "keyEnc">,
): Promise<WsfeAuth> {
  if (cliente.keyEnc && !cliente.certPem && !contador.certPem) {
    throw new ArcaError("Falta subir el certificado (.crt) de este cliente en su ficha");
  }
  const t =
    cliente.certPem && cliente.keyEnc
      ? await ticketWsfe(contador, { titular: cliente.cuit, certPem: cliente.certPem, keyEnc: cliente.keyEnc })
      : await ticketWsfe(contador);
  return { token: t.token, sign: t.sign, cuit: cliente.cuit };
}

// ---------- Emisión ----------

/** Serializa emisiones por cliente+punto de venta+tipo para no pisar la numeración.
 *  Alcanza con una sola instancia del servidor; con varias, reemplazar por un lock en Postgres. */
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const fromYyyymmdd = (s: string) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);

export type EmitirInput = {
  clienteId: string;
  puntoVentaId: string;
  tipo: number;
  fecha: Date;
  concepto: number;
  fchServDesde?: Date;
  fchServHasta?: Date;
  fchVtoPago?: Date;
  docTipo: number;
  docNro: string;
  receptorNombre: string;
  receptorDomicilio?: string;
  receptorCondIvaId: number;
  asociadoId?: string;
  items: ItemInput[];
};

export type EmitirResultado =
  | { ok: true; comprobanteId: string; observaciones: { code: string; msg: string }[] }
  | { ok: false; pendienteId?: string; errores: { code?: string; msg: string }[] };

export async function emitirComprobante(contadorId: string, input: EmitirInput): Promise<EmitirResultado> {
  const cliente = await db.cliente.findFirst({
    where: { id: input.clienteId, contadorId },
    include: { contador: true, puntosVenta: { where: { id: input.puntoVentaId } } },
  });
  if (!cliente) return { ok: false, errores: [{ msg: "Cliente inexistente" }] };
  const pv = cliente.puntosVenta[0];
  if (!pv) return { ok: false, errores: [{ msg: "Punto de venta inválido" }] };

  const tipoInfo = TIPOS_COMPROBANTE[input.tipo];
  if (!tipoInfo) return { ok: false, errores: [{ msg: "Tipo de comprobante inválido" }] };
  const letraEsperada = letraComprobante(cliente.condicionIva, input.receptorCondIvaId);
  if (tipoInfo.letra !== letraEsperada) {
    return {
      ok: false,
      errores: [{ msg: `Para este emisor y receptor corresponde comprobante ${letraEsperada}, no ${tipoInfo.letra}` }],
    };
  }
  if (!input.items.length) return { ok: false, errores: [{ msg: "Agregá al menos un ítem" }] };

  let asociado: { tipo: number; ptoVta: number; nro: number; fecha: string } | undefined;
  if (tipoInfo.clase !== "F") {
    if (!input.asociadoId) return { ok: false, errores: [{ msg: "Las notas de crédito/débito requieren comprobante asociado" }] };
    const a = await db.comprobante.findFirst({
      where: { id: input.asociadoId, clienteId: cliente.id, estado: "AUTORIZADO" },
      include: { puntoVenta: true },
    });
    if (!a || a.numero == null) return { ok: false, errores: [{ msg: "Comprobante asociado inválido" }] };
    asociado = { tipo: a.tipo, ptoVta: a.puntoVenta.numero, nro: a.numero, fecha: yyyymmdd(a.fecha) };
  }

  const tot = calcularTotales(input.items, tipoInfo.letra);
  const ambiente = cliente.contador.ambiente;

  let auth: WsfeAuth;
  try {
    auth = await authCliente(cliente.contador, cliente);
  } catch (e) {
    return { ok: false, errores: [{ msg: mensajeError(e) }] };
  }

  return withLock(`${cliente.id}:${pv.numero}:${input.tipo}`, async () => {
    try {
      await reconciliarPendientes(ambiente, auth, pv.id, pv.numero, input.tipo);
      const numero = (await ultimoAutorizado(ambiente, auth, pv.numero, input.tipo)) + 1;

      const comp = await db.comprobante.create({
        data: {
          clienteId: cliente.id,
          puntoVentaId: pv.id,
          tipo: input.tipo,
          numero,
          fecha: input.fecha,
          concepto: input.concepto,
          fchServDesde: input.concepto !== 1 ? input.fchServDesde : null,
          fchServHasta: input.concepto !== 1 ? input.fchServHasta : null,
          fchVtoPago: input.concepto !== 1 ? input.fchVtoPago : null,
          docTipo: input.docTipo,
          docNro: input.docNro,
          receptorNombre: input.receptorNombre,
          receptorDomicilio: input.receptorDomicilio,
          receptorCondIvaId: input.receptorCondIvaId,
          impNeto: tot.impNeto,
          impIva: tot.impIva,
          impTotal: tot.impTotal,
          asociadoId: input.asociadoId,
          items: { create: tot.items },
        },
      });

      const det: DetalleComprobante = {
        concepto: input.concepto,
        docTipo: input.docTipo,
        docNro: input.docNro,
        numero,
        fecha: yyyymmdd(input.fecha),
        impTotal: tot.impTotal,
        impNoGravado: 0,
        impNeto: tot.impNeto,
        impExento: 0,
        impIva: tot.impIva,
        fchServDesde: input.fchServDesde && yyyymmdd(input.fchServDesde),
        fchServHasta: input.fchServHasta && yyyymmdd(input.fchServHasta),
        fchVtoPago: input.fchVtoPago && yyyymmdd(input.fchVtoPago),
        monedaId: "PES",
        monedaCotiz: 1,
        condicionIvaReceptorId: input.receptorCondIvaId,
        asociados: asociado ? [{ ...asociado, cuit: cliente.cuit }] : undefined,
        iva: tot.alicuotas,
      };

      let res;
      try {
        res = await solicitarCae(ambiente, auth, pv.numero, input.tipo, det);
      } catch (e) {
        // No sabemos si ARCA lo autorizó: queda PENDIENTE y se verifica con FECompConsultar.
        await db.comprobante.update({
          where: { id: comp.id },
          data: { observaciones: [{ msg: `Sin respuesta de ARCA: ${mensajeError(e)}` }] },
        });
        return {
          ok: false as const,
          pendienteId: comp.id,
          errores: [{ msg: "ARCA no respondió. El comprobante quedó pendiente de verificación." }],
        };
      }

      if (res.resultado === "R" || !res.cae) {
        await db.comprobante.delete({ where: { id: comp.id } });
        return { ok: false as const, errores: [...res.errores, ...res.observaciones] };
      }

      await db.comprobante.update({
        where: { id: comp.id },
        data: {
          estado: "AUTORIZADO",
          cae: res.cae,
          caeVto: res.caeVto ? fromYyyymmdd(res.caeVto) : null,
          observaciones: res.observaciones.length ? res.observaciones : undefined,
        },
      });
      return { ok: true as const, comprobanteId: comp.id, observaciones: res.observaciones };
    } catch (e) {
      return { ok: false as const, errores: [{ msg: mensajeError(e) }] };
    }
  });
}

/** Resuelve comprobantes PENDIENTES consultando a ARCA si llegaron a autorizarse. */
async function reconciliarPendientes(
  ambiente: Contador["ambiente"],
  auth: WsfeAuth,
  puntoVentaId: string,
  ptoVta: number,
  tipo: number,
) {
  const pendientes = await db.comprobante.findMany({ where: { puntoVentaId, tipo, estado: "PENDIENTE" } });
  for (const p of pendientes) await verificarPendiente(ambiente, auth, p.id, ptoVta, tipo, p.numero!);
}

async function verificarPendiente(
  ambiente: Contador["ambiente"],
  auth: WsfeAuth,
  id: string,
  ptoVta: number,
  tipo: number,
  numero: number,
) {
  const r = await consultarComprobante(ambiente, auth, ptoVta, tipo, numero);
  if (r && r.cae) {
    return db.comprobante.update({
      where: { id },
      data: { estado: "AUTORIZADO", cae: r.cae, caeVto: fromYyyymmdd(r.caeVto), observaciones: undefined },
    });
  }
  return db.comprobante.update({
    where: { id },
    data: {
      estado: "RECHAZADO",
      numero: null,
      observaciones: [{ msg: "ARCA no registra este comprobante: nunca llegó a autorizarse." }],
    },
  });
}

export async function verificarComprobante(contadorId: string, comprobanteId: string) {
  const c = await db.comprobante.findFirst({
    where: { id: comprobanteId, cliente: { contadorId }, estado: "PENDIENTE" },
    include: { cliente: { include: { contador: true } }, puntoVenta: true },
  });
  if (!c || c.numero == null) return;
  const auth = await authCliente(c.cliente.contador, c.cliente);
  await withLock(`${c.clienteId}:${c.puntoVenta.numero}:${c.tipo}`, () =>
    verificarPendiente(c.cliente.contador.ambiente, auth, c.id, c.puntoVenta.numero, c.tipo, c.numero!),
  );
}

export function mensajeError(e: unknown) {
  if (e instanceof ArcaError) return e.message;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "Tiempo de espera agotado con ARCA";
  if (e instanceof Error) return e.message;
  return String(e);
}
