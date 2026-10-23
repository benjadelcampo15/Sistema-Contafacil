"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { cerrarSesion, crearSesion } from "@/lib/auth";

export type AuthState = { error?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(1, "Ingresá la contraseña"),
});

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const contador = await db.contador.findUnique({ where: { email: parsed.data.email } });
    if (!contador || !(await bcrypt.compare(parsed.data.password, contador.passwordHash))) {
      return { error: "Email o contraseña incorrectos" };
    }
    await crearSesion(contador.id);
  } catch (e) {
    return errorServidor(e);
  }
  redirect("/clientes");
}

/** Error inesperado (base caída, variables de entorno faltantes): mensaje entendible en vez de la pantalla de error. */
function errorServidor(e: unknown): AuthState {
  console.error("[auth]", e);
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("APP_SECRET")) return { error: "Error de configuración del servidor: falta APP_SECRET. Revisá /api/salud." };
  return { error: "No se pudo conectar con el servidor o la base de datos. Revisá /api/salud." };
}

const registroSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre o el del estudio"),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function registro(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = registroSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    if (await db.contador.findUnique({ where: { email: parsed.data.email } })) {
      return { error: "Ya existe una cuenta con ese email" };
    }
    const contador = await db.contador.create({
      data: {
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
      },
    });
    await crearSesion(contador.id);
  } catch (e) {
    return errorServidor(e);
  }
  redirect("/clientes");
}

export async function logout() {
  await cerrarSesion();
  redirect("/login");
}
