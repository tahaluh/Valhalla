import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Valhalla OBR",
    short_name: "Valhalla",
    description: "Operação presencial da Olimpíada Brasileira de Robótica",
    start_url: "/",
    display: "standalone",
    background_color: "#153c67",
    theme_color: "#153c67",
    lang: "pt-BR",
  };
}
