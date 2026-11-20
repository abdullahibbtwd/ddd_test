import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@/i18n";

afterEach(() => {
  cleanup();
});

// jsdom does not implement scrolling; TanStack Router calls it on navigation.
window.scrollTo = () => undefined;
