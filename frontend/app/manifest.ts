import type { MetadataRoute } from "next";

const themeColor = "#2563eb";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/login",
    name: "Conectado em Concursos",
    short_name: "Concursos",
    description:
      "Plataforma de estudos para concursos públicos: questões, simulados, plano de estudos, IA e acompanhamento de concursos e notícias.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/login?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: themeColor,
    background_color: "#ffffff",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        url: "/dashboard?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Simulados",
        short_name: "Simulados",
        url: "/simulations?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Questões",
        short_name: "Questões",
        url: "/questions?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Plano de estudos",
        short_name: "Plano",
        url: "/study?source=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
