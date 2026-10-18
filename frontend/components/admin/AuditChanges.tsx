import type { AuditChange } from "@/lib/backoffice";

function valueText(value:unknown, present:boolean) {
  if (!present) return "Ausente";
  if (value === null) return "Nulo";
  if (value === "") return "Texto vazio";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return typeof value === "string" ? value : JSON.stringify(value,null,2);
}

export function AuditChanges({changes}:{changes:AuditChange[]}) {
  if (!changes.length) return <p className="py-3 text-sm text-slate-500">Este evento não contém alterações nos campos registrados.</p>;
  const labels = {added:"Adicionado",removed:"Removido",changed:"Alterado"};
  return <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Comparação dos campos alterados, com valores anteriores e posteriores</caption>
    <thead><tr className="border-b"><th className="p-3">Campo / alteração</th><th className="p-3">Antes</th><th className="p-3">Depois</th></tr></thead>
    <tbody>{changes.map(change=><tr key={change.path} className="border-b align-top">
      <th scope="row" className="p-3 font-medium"><code className="break-all">{change.path}</code><span className="mt-1 block text-xs font-normal text-slate-500">{labels[change.kind]}</span></th>
      <td className="min-w-40 max-w-md p-3"><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans">{valueText(change.before,change.before_present)}</pre></td>
      <td className="min-w-40 max-w-md p-3"><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans">{valueText(change.after,change.after_present)}</pre></td>
    </tr>)}</tbody>
  </table></div>;
}
