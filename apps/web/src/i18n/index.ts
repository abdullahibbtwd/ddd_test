import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import areasBg from "./locales/bg/areas.json";
import auditBg from "./locales/bg/audit.json";
import authBg from "./locales/bg/auth.json";
import clientsBg from "./locales/bg/clients.json";
import commonBg from "./locales/bg/common.json";
import dashboardBg from "./locales/bg/dashboard.json";
import errorsBg from "./locales/bg/errors.json";
import cashBg from "./locales/bg/cash.json";
import invoicesBg from "./locales/bg/invoices.json";
import monthBg from "./locales/bg/month.json";
import navBg from "./locales/bg/nav.json";
import paymentsBg from "./locales/bg/payments.json";
import productsBg from "./locales/bg/products.json";
import certificatesBg from "./locales/bg/certificates.json";
import agreementsBg from "./locales/bg/agreements.json";
import foodBg from "./locales/bg/food.json";
import notificationsBg from "./locales/bg/notifications.json";
import reportsBg from "./locales/bg/reports.json";
import sitesBg from "./locales/bg/sites.json";
import usersBg from "./locales/bg/users.json";
import visitsBg from "./locales/bg/visits.json";

import areasEn from "./locales/en/areas.json";
import auditEn from "./locales/en/audit.json";
import authEn from "./locales/en/auth.json";
import clientsEn from "./locales/en/clients.json";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import errorsEn from "./locales/en/errors.json";
import cashEn from "./locales/en/cash.json";
import invoicesEn from "./locales/en/invoices.json";
import monthEn from "./locales/en/month.json";
import navEn from "./locales/en/nav.json";
import paymentsEn from "./locales/en/payments.json";
import productsEn from "./locales/en/products.json";
import certificatesEn from "./locales/en/certificates.json";
import agreementsEn from "./locales/en/agreements.json";
import foodEn from "./locales/en/food.json";
import notificationsEn from "./locales/en/notifications.json";
import reportsEn from "./locales/en/reports.json";
import sitesEn from "./locales/en/sites.json";
import usersEn from "./locales/en/users.json";
import visitsEn from "./locales/en/visits.json";

export const defaultNS = "common";

export const SUPPORTED_LANGUAGES = ["bg", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "ddcrm.lng";

const namespaces = {
  bg: {
    common: commonBg,
    nav: navBg,
    auth: authBg,
    errors: errorsBg,
    audit: auditBg,
    users: usersBg,
    areas: areasBg,
    clients: clientsBg,
    dashboard: dashboardBg,
    sites: sitesBg,
    visits: visitsBg,
    month: monthBg,
    invoices: invoicesBg,
    payments: paymentsBg,
    cash: cashBg,
    products: productsBg,
    certificates: certificatesBg,
    agreements: agreementsBg,
    food: foodBg,
    notifications: notificationsBg,
    reports: reportsBg,
  },
  en: {
    common: commonEn,
    nav: navEn,
    auth: authEn,
    errors: errorsEn,
    audit: auditEn,
    users: usersEn,
    areas: areasEn,
    clients: clientsEn,
    dashboard: dashboardEn,
    sites: sitesEn,
    visits: visitsEn,
    month: monthEn,
    invoices: invoicesEn,
    payments: paymentsEn,
    cash: cashEn,
    products: productsEn,
    certificates: certificatesEn,
    agreements: agreementsEn,
    food: foodEn,
    notifications: notificationsEn,
    reports: reportsEn,
  },
} as const;

// The dev-only `styleguide` namespace is registered by src/dev/styleguide.tsx (never in prod).
export const resources = namespaces;

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function readStoredLanguage(): SupportedLanguage {
  if (typeof localStorage === "undefined") return "bg";
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored && isSupportedLanguage(stored) ? stored : "bg";
}

export function persistLanguage(lng: SupportedLanguage) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}

const initialLng = readStoredLanguage();
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLng;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: "bg",
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: [
    "common",
    "nav",
    "auth",
    "errors",
    "audit",
    "users",
    "areas",
    "clients",
    "dashboard",
    "sites",
    "visits",
    "month",
    "invoices",
    "payments",
    "cash",
    "products",
    "certificates",
    "agreements",
    "food",
    "notifications",
    "reports",
  ],
  defaultNS,
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

i18n.on("languageChanged", (lng) => {
  if (isSupportedLanguage(lng)) persistLanguage(lng);
});

export default i18n;
