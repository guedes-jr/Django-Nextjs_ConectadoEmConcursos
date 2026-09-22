import { FAQ as FAQType } from "@/types/plans";
import FAQItem from "@/components/plans/FAQItem";

type Props = {
  items: FAQType[];
};

export default function FAQ({ items }: Props) {
  return (
    <div className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
      {items.map((f) => (
        <FAQItem key={f.question} question={f.question} answer={f.answer} />
      ))}
    </div>
  );
}
