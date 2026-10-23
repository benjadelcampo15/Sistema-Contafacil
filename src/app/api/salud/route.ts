import { db } from "@/lib/db";

/** Diagnóstico de configuración para el deploy. No expone valores, solo si están bien. */
export async function GET() {
  const secret = process.env.APP_SECRET ?? "";
  const dbUrl = process.env.DATABASE_URL ?? "";

  let baseDeDatos: string;
  try {
    await db.$queryRaw`SELECT 1`;
    baseDeDatos = "ok";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Solo la última línea del error de Prisma, sin la URL
    baseDeDatos = msg.split("\n").filter(Boolean).pop()?.replace(/postgres(ql)?:\/\/\S+/g, "postgresql://…") ?? "error";
  }

  const estado = {
    APP_SECRET: !secret ? "FALTA" : secret.length < 32 ? `muy corto (${secret.length} caracteres, mínimo 32)` : "ok",
    DATABASE_URL: !dbUrl
      ? "FALTA"
      : /^postgres(ql)?:\/\//.test(dbUrl)
        ? "ok"
        : "formato inválido (tiene que empezar con postgresql://; ¿quedaron comillas o espacios?)",
    baseDeDatos,
  };
  const ok = Object.values(estado).every((v) => v === "ok");
  return Response.json({ ok, ...estado }, { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}
