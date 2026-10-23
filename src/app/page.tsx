import { redirect } from "next/navigation";
import { contadorOpcional } from "@/lib/auth";

export default async function Home() {
  redirect((await contadorOpcional()) ? "/clientes" : "/login");
}
