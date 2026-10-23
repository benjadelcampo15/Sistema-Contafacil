import * as XLSX from "xlsx";
import { contadorOpcional } from "@/lib/auth";
import { COLUMNAS } from "@/lib/lote";

// La columna Factura = "EJEMPLO…" hace que la app ignore estas filas aunque no se borren.
const EJEMPLOS = [
  ["EJEMPLO", "", "Consumidor Final", "", "", "Consumidor Final", "", "Servicios", "", "", "", "Clase de yoga", 1, 15000, ""],
  ["EJEMPLO", "", "DNI", "30123456", "María Gómez", "Consumidor Final", "San Juan 450", "Servicios", "", "", "", "Abono mensual", 1, 25000, ""],
  ["EJEMPLO-A1", "", "CUIT", "20111111112", "Juan Pérez", "Monotributo", "Belgrano 100", "Productos", "", "", "", "Producto 1", 2, 3500, ""],
  ["EJEMPLO-A1", "", "", "", "", "", "", "", "", "", "", "Producto 2", 1, 1200, ""],
];

export async function GET() {
  if (!(await contadorOpcional())) return new Response("No autorizado", { status: 401 });

  const libro = XLSX.utils.book_new();

  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS.map((c) => c.titulo), ...EJEMPLOS]);
  hoja["!cols"] = COLUMNAS.map((c) => ({ wch: Math.max(12, c.titulo.length + 2) }));
  XLSX.utils.book_append_sheet(libro, hoja, "Facturas");

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ["Cómo completar la hoja Facturas"],
    ["Cada fila es una factura. Para una factura con varios ítems, poné el mismo valor en la columna Factura."],
    ["Las filas que dicen EJEMPLO en la columna Factura se ignoran: podés borrarlas o dejarlas."],
    ["En la columna Factura poné cualquier valor (1, 2, A1…) para agrupar ítems; nunca algo que empiece con EJEMPLO."],
    [],
    ["Columna", "Qué poner"],
    ...COLUMNAS.map((c) => [c.titulo, c.ayuda]),
  ]);
  instrucciones["!cols"] = [{ wch: 18 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(libro, instrucciones, "Instrucciones");

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-facturas-contafacil.xlsx"',
    },
  });
}
