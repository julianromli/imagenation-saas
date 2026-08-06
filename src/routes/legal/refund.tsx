import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/refund")({
  component: RefundPage,
});

function RefundPage() {
  return (
    <LegalPage
      intro="Refunds are handled by the merchant after reviewing the order and the applicable policy."
      sections={[
        {
          body: "Replace this section with the eligible reasons, request window, item condition requirements, and contact process for a full refund.",
          heading: "Eligibility",
        },
        {
          body: "A refund is only shown as complete in this storefront after the merchant completes it in Mayar and marks the order as refunded.",
          heading: "Payment status",
        },
        {
          body: "Explain how returned goods, shipping costs, damaged items, and refund timing are handled for this store.",
          heading: "After approval",
        },
      ]}
      title="Refunds"
    />
  );
}
