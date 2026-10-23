"use server";

import { revalidatePath } from "next/cache";
import { requireContador } from "@/lib/auth";
import { mensajeError, verificarComprobante } from "@/lib/facturacion";

export async function verificar(comprobanteId: string): Promise<{ error?: string }> {
  const contador = await requireContador();
  try {
    await verificarComprobante(contador.id, comprobanteId);
  } catch (e) {
    return { error: mensajeError(e) };
  }
  revalidatePath(`/comprobantes/${comprobanteId}`);
  return {};
}
