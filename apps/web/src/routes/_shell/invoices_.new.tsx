import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getInvoicesControllerListQueryKey,
  useInvoicesControllerCreate,
} from "@/api/generated/invoices/invoices";
import { isApiRequestError } from "@/api/mutator";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { translateApiError } from "@/lib/error-message";
import { InvoiceForm, type InvoiceFormValues } from "./-invoice-form";

export const Route = createFileRoute("/_shell/invoices_/new")({
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const { t } = useTranslation("invoices");
  const { t: te } = useTranslation("errors");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = useInvoicesControllerCreate();

  async function handleSubmit(values: InvoiceFormValues) {
    try {
      const res = await createMutation.mutateAsync({
        data: {
          clientId: values.clientId,
          visitIds: values.visitIds,
          lines: values.lines
            .filter((line) => line.description.trim().length > 0)
            .map((line) => ({
              description: line.description.trim(),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
            })),
          notes: values.notes.trim() ? values.notes.trim() : null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getInvoicesControllerListQueryKey() });
      void navigate({ to: "/invoices/$id", params: { id: res.data.id } });
    } catch (err) {
      if (isApiRequestError(err)) {
        toast.error(translateApiError(te, err.code));
      } else {
        toast.error(te("unknown"));
      }
    }
  }

  return (
    <div>
      <PageHeader
        title={t("createTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link to="/invoices">{t("back")}</Link>
          </Button>
        }
      />
      <InvoiceForm
        mode="create"
        saving={createMutation.isPending}
        primaryLabel={t("saveDraft")}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
