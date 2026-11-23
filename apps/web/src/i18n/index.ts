import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import areas from "./locales/bg/areas.json";
import audit from "./locales/bg/audit.json";
import auth from "./locales/bg/auth.json";
import clients from "./locales/bg/clients.json";
import common from "./locales/bg/common.json";
import errors from "./locales/bg/errors.json";
import month from "./locales/bg/month.json";
import nav from "./locales/bg/nav.json";
import sites from "./locales/bg/sites.json";
import users from "./locales/bg/users.json";
import visits from "./locales/bg/visits.json";

export const defaultNS = "common";
// The dev-only `styleguide` namespace is registered by src/dev/styleguide.tsx (never in prod).
export const resources = {
  bg: { common, nav, auth, errors, audit, users, areas, clients, sites, visits, month },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "bg",
  fallbackLng: "bg",
  supportedLngs: ["bg"],
  ns: [
    "common",
    "nav",
    "auth",
    "errors",
    "audit",
    "users",
    "areas",
    "clients",
    "sites",
    "visits",
    "month",
  ],
  defaultNS,
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

export default i18n;
