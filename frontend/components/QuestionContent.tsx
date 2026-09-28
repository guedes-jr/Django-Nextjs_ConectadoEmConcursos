"use client";

import { useEffect, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";

type Props = { text: string; className?: string };

const marker = /^\[\[image:(.+)\]\]$/;
const safeImage = /^(https:\/\/[^\s]+|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$/;
const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "SUB", "SUP", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "A", "IMG"]);

function sanitizeQuestionHtml(value: string) {
  const document = new DOMParser().parseFromString(value, "text/html");
  const clean = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const element = child as HTMLElement;
      if (!allowedTags.has(element.tagName)) { while (element.firstChild) node.insertBefore(element.firstChild, element); element.remove(); continue; }
      const href = element.getAttribute("data-href") || "";
      const src = element.getAttribute("data-src") || "";
      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
      if (element.tagName === "A" && /^https?:\/\//i.test(href)) { element.setAttribute("href", href); element.setAttribute("target", "_blank"); element.setAttribute("rel", "noreferrer noopener"); }
      if (element.tagName === "IMG") { if (safeImage.test(src)) { element.setAttribute("src", src); element.setAttribute("alt", "Figura da questão"); } else { element.remove(); continue; } }
      clean(element);
    }
  };
  // Preserve only validated attributes before the generic attribute cleanup.
  for (const link of Array.from(document.querySelectorAll("a"))) link.setAttribute("data-href", link.getAttribute("href") || "");
  for (const image of Array.from(document.querySelectorAll("img"))) image.setAttribute("data-src", image.getAttribute("src") || "");
  clean(document.body);
  return document.body.innerHTML;
}

export function QuestionContent({ text, className = "" }: Props) {
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const hasHtml = /<\/?[a-z][^>]*>/i.test(text);

  useEffect(() => {
    if (!activeImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeImage]);

  useEffect(() => {
    if (!hasHtml || !htmlRef.current) return;
    htmlRef.current.innerHTML = sanitizeQuestionHtml(text);
  }, [hasHtml, text]);

  if (hasHtml) return <div ref={htmlRef} className={`question-rich-content whitespace-pre-wrap [&_a]:text-blue-700 [&_a]:underline dark:[&_a]:text-blue-300 [&_img]:my-4 [&_img]:max-h-[540px] [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:object-contain ${className}`} />;

  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {text.split(/(\[\[image:[^\]]+\]\])/g).map((part, index) => {
        const src = part.match(marker)?.[1];
        if (src && safeImage.test(src)) {
          return (
            <button key={index} type="button" onClick={() => setActiveImage(src)} className="group relative my-4 block max-w-full rounded-xl border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:bg-slate-800" aria-label="Ampliar figura da questão">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Figura da questão" className="h-auto max-h-[540px] max-w-full object-contain" loading="lazy" />
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300"><ZoomIn size={14} /> Clique para ampliar</span>
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
      {activeImage && (
        <div role="dialog" aria-modal="true" aria-label="Figura ampliada" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setActiveImage(null)}>
          <button type="button" onClick={() => setActiveImage(null)} aria-label="Fechar figura" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"><X size={22} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeImage} alt="Figura da questão ampliada" className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
