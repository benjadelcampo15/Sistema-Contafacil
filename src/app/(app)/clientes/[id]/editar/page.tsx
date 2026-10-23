import { notFound } from "next/navigation";
import { requireContador } from "@/lib/auth";
import { db } from "@/lib/db";
import { ClienteForm } from "../../cliente-form";

export default async function EditarClientePage({ params }: PageProps<"/clientes/[id]/editar">) {
  const contador = await requireContador();
  const { id } = await params;
  const cliente = await db.cliente.findFirst({ where: { id, contadorId: contador.id } });
  if (!cliente) notFound();
  return (
    <div className="space-y-6">
      <h1 className="h1">Editar {cliente.razonSocial}</h1>
      <ClienteForm cliente={cliente} />
    </div>
  );
}
