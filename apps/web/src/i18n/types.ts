import type areas from "./locales/bg/areas.json";
import type audit from "./locales/bg/audit.json";
import type auth from "./locales/bg/auth.json";
import type clients from "./locales/bg/clients.json";
import type common from "./locales/bg/common.json";
import type errors from "./locales/bg/errors.json";
import type month from "./locales/bg/month.json";
import type nav from "./locales/bg/nav.json";
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
      sites: typeof sites;
      visits: typeof visits;
      month: typeof month;
      styleguide: typeof styleguide;
    };
  }
}
