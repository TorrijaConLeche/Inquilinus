import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const conIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {};

export default conIntl(config);
