import { redirect } from "next/navigation";

/** Rota legada: a curadoria agora tem uma página própria de fila. */
export default function QuestoesPage() {
  redirect("/admin/fila-questoes");
}
