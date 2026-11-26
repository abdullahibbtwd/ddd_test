import type areas from "./locales/bg/areas.json";
import type audit from "./locales/bg/audit.json";
import type auth from "./locales/bg/auth.json";
import type clients from "./locales/bg/clients.json";
import type common from "./locales/bg/common.json";
import type dashboard from "./locales/bg/dashboard.json";
import type errors from "./locales/bg/errors.json";
import type cash from "./locales/bg/cash.json";
import type invoices from "./locales/bg/invoices.json";
import type month from "./locales/bg/month.json";
import type nav from "./locales/bg/nav.json";
import type payments from "./locales/bg/payments.json";
import type products from "./locales/bg/products.json";
import type certificates from "./locales/bg/certificates.json";
import type agreements from "./locales/bg/agreements.json";
import type food from "./locales/bg/food.json";
import type notifications from "./locales/bg/notifications.json";
import type reports from "./locales/bg/reports.json";
import type sites from "./locales/bg/sites.json";
import type users from "./locales/bg/users.json";
import type visits from "./locales/bg/visits.json";
import type styleguide from "./locales/bg/styleguide.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      nav: typeof nav;
      auth: typeof auth;
      errors: typeof errors;
      audit: typeof audit;
      users: typeof users;
      areas: typeof areas;
      clients: typeof clients;
      dashboard: typeof dashboard;
      sites: typeof sites;
      visits: typeof visits;
      month: typeof month;
      invoices: typeof invoices;
      payments: typeof payments;
      cash: typeof cash;
      products: typeof products;
      certificates: typeof certificates;
      agreements: typeof agreements;
      food: typeof food;
      notifications: typeof notifications;
      reports: typeof reports;
      styleguide: typeof styleguide;
    };
  }
}
