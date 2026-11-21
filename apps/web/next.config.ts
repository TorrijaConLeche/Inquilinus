import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const conIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Los paquetes del monorepo se publican como TypeScript sin compilar.
const config: NextConfig = {
  transpilePackages: ["@inquilinus/api", "@inquilinus/contracts", "@inquilinus/domain"],
  // Spec 004, R11: la vista del inquilino, sin caché compartida, sin buscadores
  // y sin mandar el enlace (con su token) en la cabecera Referer.
  async headers() {
    return [
      {
        source: "/i/:token*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default conIntl(config);
