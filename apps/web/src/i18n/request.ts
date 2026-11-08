import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { COOKIE_IDIOMA, elegirIdioma } from "./idiomas";

export default getRequestConfig(async () => {
  const locale = elegirIdioma({
    cookie: (await cookies()).get(COOKIE_IDIOMA)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
  });
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
