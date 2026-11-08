import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const conIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Los paquetes del monorepo se publican como TypeScript sin compilar.
const config: NextConfig = {
  transpilePackages: ["@inquilinus/api", "@inquilinus/contracts"],
};

export default conIntl(config);
