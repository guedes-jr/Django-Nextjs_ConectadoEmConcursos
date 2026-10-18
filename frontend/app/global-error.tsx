"use client";
import { RenderError } from "@/components/errors/RenderError";

export default function GlobalError(props: {error: Error & {digest?: string}; reset: () => void}) {
  return <html lang="pt-BR"><body><RenderError {...props} /></body></html>;
}
