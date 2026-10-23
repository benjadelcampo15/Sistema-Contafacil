"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { emitirComprobante } from "@/lib/facturacion";
import { ALICUOTAS_IVA, CONDICIONES_IVA_RECEPTOR, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO } from "@/lib/arca/constants";
import { cuitValido, soloDigitos } from "@/lib/format";

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const aDate = (s: string) => new Date(`${s}T00:00:00Z`);

const schema = z
  .object({
    clienteId: z.string(),
    puntoVentaId: z.string().min(1, "Elegí un punto de venta"),
    tipo: z.number().refine((t) => t in TIPOS_COMPROBANTE, "Tipo inválido"),
    fecha: fechaISO,
    concepto: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    fchServDesde: fechaISO.optional(),
    fchServHasta: fechaISO.optional(),
    fchVtoPago: fechaISO.optional(),
    receptor: z.object({
      docTipo: z.number().refine((t) => t in TIPOS_DOCUMENTO, "Tipo de documento inválido"),
      docNro: z.string().transform(soloDigitos),
      nombre: z.string().trim().min(1, "Ingresá el nombre del receptor"),
      domicilio: z.string().trim().optional(),
      condicionIvaId: z.number().refine((c) => c in CONDICIONES_IVA_RECEPTOR, "Condición de IVA inválida"),
      email: z.string().trim().optional(),
      guardar: z.boolean(),
    }),
    asociadoId: z.string().optional(),
    items: z
      .array(
        z.object({
          descripcion: z.string().trim().min(1, "Cada ítem necesita descripción"),
          cantidad: z.number().positive("Cantidad inválida"),
          precioUnitario: z.number().positive("Precio inválido"),
          alicuotaIvaId: z.number().refine((a) => a in ALICUOTAS_IVA).nullable(),
        }),
      )
      .min(1, "Agregá al menos un ítem"),
  })
  .superRefine((v, ctx) => {
    if (v.concepto !== 1 && (!v.fchServDesde || !v.fchServHasta || !v.fchVtoPago)) {
      ctx.addIssue({ code: "custom", message: "Para servicios completá período y vencimiento de pago" });
    }
    const r = v.receptor;
    if (r.docTipo === 99) {
      if (r.condicionIvaId !== 5) ctx.addIssue({ code: "custom", message: "Doc. 99 solo para Consumidor Final" });
    } else if ((r.docTipo === 80 || r.docTipo === 86) && !cuitValido(r.docNro)) {
      ctx.addIssue({ code: "custom", message: "CUIT/CUIL del receptor inválido" });
    } else if (r.docTipo === 96 && !/^\d{7,8}$/.test(r.docNro)) {
      ctx.addIssue({ code: "custom", message: "DNI inválido" });
    }
  });

export type EmitirPayload = z.input<typeof schema>;
export type EmitirRespuesta =
  | { ok: true; comprobanteId: string }
  | { ok: false; pendienteId?: string; errores: { code?: string; msg: string }[] };

export async function emitir(payload: EmitirPayload): Promise<EmitirRespuesta> {
  const contador = await requireContador();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, errores: parsed.error.issues.map((i) => ({ msg: i.message })) };
  const v = parsed.data;
  const r = v.receptor;
  const docNro = r.docTipo === 99 ? "0" : r.docNro;

  const res = await emitirComprobante(contador.id, {
    clienteId: v.clienteId,
    puntoVentaId: v.puntoVentaId,
    tipo: v.tipo,
    fecha: aDate(v.fecha),
    concepto: v.concepto,
    fchServDesde: v.fchServDesde ? aDate(v.fchServDesde) : undefined,
    fchServHasta: v.fchServHasta ? aDate(v.fchServHasta) : undefined,
    fchVtoPago: v.fchVtoPago ? aDate(v.fchVtoPago) : undefined,
    docTipo: r.docTipo,
    docNro,
    receptorNombre: r.nombre,
    receptorDomicilio: r.domicilio || undefined,
    receptorCondIvaId: r.condicionIvaId,
    asociadoId: v.asociadoId || undefined,
    items: v.items,
  });

  if (r.guardar && r.docTipo !== 99 && (res.ok || res.pendienteId)) {
    const data = {
      razonSocial: r.nombre,
      condicionIvaId: r.condicionIvaId,
      domicilio: r.domicilio || null,
      email: r.email || null,
    };
    await db.receptor.upsert({
      where: { clienteId_docTipo_docNro: { clienteId: v.clienteId, docTipo: r.docTipo, docNro } },
      create: { clienteId: v.clienteId, docTipo: r.docTipo, docNro, ...data },
      update: data,
    });
  }

  revalidatePath(`/clientes/${v.clienteId}`);
  revalidatePath("/comprobantes");
  if (res.ok) return { ok: true, comprobanteId: res.comprobanteId };
  return res;
}
