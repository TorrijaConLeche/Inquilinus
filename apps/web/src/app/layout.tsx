import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import "./globals.css";

// next/font descarga la fuente al compilar y la sirve desde la propia app.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--fuente-figtree",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadatos");
  return { title: t("titulo"), description: t("descripcion") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const idioma = await getLocale();
  return (
    <html lang={idioma} className={figtree.variable}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
