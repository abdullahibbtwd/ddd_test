import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import type { NavKey } from "@/config/nav";

/** Temporary page body for sections that have no business screen yet. */
export function SectionPlaceholder({ section }: { section: NavKey }) {
  const { t } = useTranslation();
  const { t: tNav } = useTranslation("nav");

  return (
    <>
      <PageHeader title={tNav(section)} />
      <EmptyState message={t(`empty.${section}`)} />
    </>
  );
}
