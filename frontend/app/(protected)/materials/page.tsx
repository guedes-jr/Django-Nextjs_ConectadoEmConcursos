import { redirect } from "next/navigation";

// Compatibilidade com favoritos e links antigos durante a retirada da biblioteca.
export default function MaterialsPage() {
  redirect("/chatIA");
}
