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

  const contador = await db.contador.findUnique({ where: { email: parsed.data.email } });
  if (!contador || !(await bcrypt.compare(parsed.data.password, contador.passwordHash))) {
    return { error: "Email o contraseña incorrectos" };
  }
  await crearSesion(contador.id);
  redirect("/clientes");
}

const registroSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre o el del estudio"),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function registro(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = registroSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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
  redirect("/configuracion");
}

export async function logout() {
  await cerrarSesion();
  redirect("/login");
}
