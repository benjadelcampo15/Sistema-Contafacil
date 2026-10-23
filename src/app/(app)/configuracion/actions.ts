"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";

export type ConfigState = { ok?: string; error?: string };

const cuentaSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá el nombre del estudio"),
  ambiente: z.enum(["HOMOLOGACION", "PRODUCCION"]),
});

export async function guardarCuenta(_: ConfigState, form: FormData): Promise<ConfigState> {
  const contador = await requireContador();
  const parsed = cuentaSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.contador.update({ where: { id: contador.id }, data: parsed.data });
  revalidatePath("/", "layout");
  return { ok: "Cambios guardados" };
}
