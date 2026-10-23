import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "cf_session";
const DURACION_SEG = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(s);
}

export async function crearSesion(contadorId: string) {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(contadorId)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SEG}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SEG,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

async function contadorIdDeSesion(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Contador logueado o redirección a /login. Cacheado por request. */
export const requireContador = cache(async () => {
  const id = await contadorIdDeSesion();
  const contador = id ? await db.contador.findUnique({ where: { id } }) : null;
  if (!contador) redirect("/login");
  return contador;
});

export async function contadorOpcional() {
  const id = await contadorIdDeSesion();
  return id ? db.contador.findUnique({ where: { id } }) : null;
}
