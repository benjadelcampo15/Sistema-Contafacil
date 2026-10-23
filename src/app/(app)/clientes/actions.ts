"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { puntosDeVenta } from "@/lib/arca/wsfe";
import { claveCorrespondeACertificado, generarClaveYCsr } from "@/lib/arca/wsaa";
import { decrypt, encrypt } from "@/lib/crypto";
import { authCliente, mensajeError } from "@/lib/facturacion";
import { cuitValido, soloDigitos } from "@/lib/format";

export type FormState = { ok?: string; error?: string };

const vacioANull = (v: unknown) => (v === "" ? null : v);

const clienteSchema = z.object({
  id: z.string().optional(),
  razonSocial: z.string().trim().min(2, "Ingresá la razón social"),
  nombreFantasia: z.preprocess(vacioANull, z.string().trim().nullable()),
  cuit: z.string().transform(soloDigitos).refine(cuitValido, "CUIT inválido"),
  condicionIva: z.enum(["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"]),
  domicilio: z.string().trim().min(3, "Ingresá el domicilio comercial"),
  iibb: z.preprocess(vacioANull, z.string().trim().nullable()),
  inicioActividades: z.preprocess(vacioANull, z.coerce.date().nullable()),
  email: z.preprocess(vacioANull, z.string().trim().email("Email inválido").nullable()),
});

export async function guardarCliente(_: FormState, form: FormData): Promise<FormState> {
  const contador = await requireContador();
  const parsed = clienteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;

  const duplicado = await db.cliente.findFirst({
    where: { contadorId: contador.id, cuit: data.cuit, NOT: id ? { id } : undefined },
  });
  if (duplicado) return { error: "Ya tenés un cliente con ese CUIT" };

  let clienteId = id;
  if (id) {
    const r = await db.cliente.updateMany({ where: { id, contadorId: contador.id }, data });
    if (!r.count) return { error: "Cliente inexistente" };
  } else {
    clienteId = (await db.cliente.create({ data: { ...data, contadorId: contador.id } })).id;
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${clienteId}`);
}

async function clienteDelContador(clienteId: string) {
  const contador = await requireContador();
  const cliente = await db.cliente.findFirst({ where: { id: clienteId, contadorId: contador.id } });
  return { contador, cliente };
}

export async function agregarPuntoVenta(clienteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { cliente } = await clienteDelContador(clienteId);
  if (!cliente) return { error: "Cliente inexistente" };
  const numero = Number(form.get("numero"));
  if (!Number.isInteger(numero) || numero < 1 || numero > 99998) return { error: "Número de punto de venta inválido" };
  const descripcion = String(form.get("descripcion") ?? "").trim() || null;

  await db.puntoVenta.upsert({
    where: { clienteId_numero: { clienteId, numero } },
    create: { clienteId, numero, descripcion },
    update: { descripcion },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: `Punto de venta ${numero} guardado` };
}

export async function sincronizarPuntosVenta(clienteId: string): Promise<FormState> {
  const { contador, cliente } = await clienteDelContador(clienteId);
  if (!cliente) return { error: "Cliente inexistente" };
  try {
    const pvs = (await puntosDeVenta(contador.ambiente, await authCliente(contador, cliente))).filter(
      (p) => !p.bloqueado && !p.baja,
    );
    await db.cliente.update({ where: { id: cliente.id }, data: { arcaVerificadoAt: new Date() } });
    for (const p of pvs) {
      await db.puntoVenta.upsert({
        where: { clienteId_numero: { clienteId, numero: p.numero } },
        create: { clienteId, numero: p.numero, descripcion: p.emisionTipo },
        update: {},
      });
    }
    revalidatePath(`/clientes/${clienteId}`);
    return pvs.length
      ? { ok: `Se encontraron ${pvs.length} puntos de venta habilitados` }
      : {
          error:
            contador.ambiente === "PRODUCCION"
              ? "ARCA no tiene ningún punto de venta Web Services habilitado para este cliente. Crealo en ARCA (sistema \"Factura Electrónica – … – Web Services\") y volvé a intentar; puede tardar unos minutos en aparecer."
              : "ARCA no devolvió puntos de venta (en homologación es normal: cargalo a mano).",
        };
  } catch (e) {
    return { error: mensajeError(e) };
  }
}

export async function archivarCliente(clienteId: string) {
  const { contador } = await clienteDelContador(clienteId);
  await db.cliente.updateMany({ where: { id: clienteId, contadorId: contador.id }, data: { activo: false } });
  revalidatePath("/clientes");
  redirect("/clientes");
}

// ---------- Compradores (clientes del cliente) ----------

const compradorSchema = z
  .object({
    id: z.string().optional(),
    docTipo: z.coerce.number().refine((t) => [80, 86, 96].includes(t), "Tipo de documento inválido"),
    docNro: z.string().transform(soloDigitos),
    razonSocial: z.string().trim().min(2, "Ingresá el nombre o razón social"),
    condicionIvaId: z.coerce.number().int().positive("Elegí la condición frente al IVA"),
    domicilio: z.preprocess(vacioANull, z.string().trim().nullable()),
    email: z.preprocess(vacioANull, z.string().trim().email("Email inválido").nullable()),
  })
  .superRefine((v, ctx) => {
    if (v.docTipo === 96 ? !/^\d{7,8}$/.test(v.docNro) : !cuitValido(v.docNro)) {
      ctx.addIssue({ code: "custom", message: v.docTipo === 96 ? "DNI inválido" : "CUIT/CUIL inválido" });
    }
  });

export async function guardarComprador(clienteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { cliente } = await clienteDelContador(clienteId);
  if (!cliente) return { error: "Cliente inexistente" };
  const parsed = compradorSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;

  const duplicado = await db.receptor.findFirst({
    where: { clienteId, docTipo: data.docTipo, docNro: data.docNro, NOT: id ? { id } : undefined },
  });
  if (duplicado) return { error: `Ya está cargado: ${duplicado.razonSocial}` };

  if (id) {
    const r = await db.receptor.updateMany({ where: { id, clienteId }, data });
    if (!r.count) return { error: "Comprador inexistente" };
  } else {
    await db.receptor.create({ data: { ...data, clienteId } });
  }
  revalidatePath(`/clientes/${clienteId}`, "layout");
  return { ok: id ? "Cambios guardados" : `${data.razonSocial} agregado` };
}

export async function eliminarComprador(clienteId: string, compradorId: string) {
  const { cliente } = await clienteDelContador(clienteId);
  if (!cliente) return;
  // Los comprobantes guardan una copia de los datos del receptor: borrarlo no afecta lo ya emitido.
  await db.receptor.deleteMany({ where: { id: compradorId, clienteId } });
  revalidatePath(`/clientes/${clienteId}`, "layout");
}

// ---------- Certificado propio del cliente ----------

export type CertState = FormState & { csr?: string };

export async function generarCsrCliente(clienteId: string): Promise<CertState> {
  const { cliente } = await clienteDelContador(clienteId);
  if (!cliente) return { error: "Cliente inexistente" };
  const { keyPem, csrPem } = generarClaveYCsr({ cuit: cliente.cuit, nombre: cliente.razonSocial, alias: "contafacil" });
  await db.cliente.update({ where: { id: cliente.id }, data: { keyEnc: encrypt(keyPem), certPem: null, arcaVerificadoAt: null } });
  await db.tokenArca.deleteMany({ where: { contadorId: cliente.contadorId, titular: cliente.cuit } });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Clave generada. Descargá el CSR y subilo en ARCA con la clave fiscal del cliente.", csr: csrPem };
}

export async function subirCertificadoCliente(clienteId: string, _: CertState, form: FormData): Promise<CertState> {
  const { cliente } = await clienteDelContador(clienteId);
  if (!cliente) return { error: "Cliente inexistente" };
  if (!cliente.keyEnc) return { error: "Primero generá la clave y el CSR de este cliente" };
  const f = form.get("cert");
  const certPem = f instanceof File && f.size > 0 ? (await f.text()).trim() : "";
  if (certPem.includes("CERTIFICATE REQUEST")) {
    return { error: "Ese archivo es el CSR (el pedido). Acá va el .crt que descargás de ARCA después de crear el alias." };
  }
  if (!certPem.includes("BEGIN CERTIFICATE-----")) return { error: "Elegí el archivo .crt que descargaste de ARCA" };
  try {
    if (!claveCorrespondeACertificado(certPem, decrypt(cliente.keyEnc))) {
      return { error: "Ese certificado no corresponde al CSR generado para este cliente" };
    }
  } catch (e) {
    return { error: `No se pudo leer el certificado: ${mensajeError(e)}` };
  }
  await db.cliente.update({ where: { id: cliente.id }, data: { certPem, arcaVerificadoAt: null } });
  await db.tokenArca.deleteMany({ where: { contadorId: cliente.contadorId, titular: cliente.cuit } });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Certificado guardado" };
}

export async function probarConexionCliente(clienteId: string): Promise<CertState> {
  const { contador, cliente } = await clienteDelContador(clienteId);
  if (!cliente) return { error: "Cliente inexistente" };
  try {
    const auth = await authCliente(contador, cliente);
    const pvs = await puntosDeVenta(contador.ambiente, auth);
    await db.cliente.update({ where: { id: cliente.id }, data: { arcaVerificadoAt: new Date() } });
    revalidatePath(`/clientes/${clienteId}`);
    return { ok: `Conexión OK con ARCA (${contador.ambiente === "PRODUCCION" ? "producción" : "homologación"}). Puntos de venta web services: ${pvs.length ? pvs.map((p) => p.numero).join(", ") : "ninguno todavía"}.` };
  } catch (e) {
    return { error: mensajeError(e) };
  }
}
