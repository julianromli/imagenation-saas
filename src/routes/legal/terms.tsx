import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      intro="These terms describe the basic expectations for browsing, ordering, payment, and delivery."
      sections={[
        {
          body: "Product descriptions, prices, and availability are shown as accurately as possible and may change before an order is confirmed.",
          heading: "Products and orders",
        },
        {
          body: "An order is only considered paid after the payment provider confirms the transaction. A return from a payment page does not confirm payment.",
          heading: "Payment",
        },
        {
          body: "Replace this section with the merchant's rules for prohibited use, limitation of liability, governing law, and contact details.",
          heading: "Merchant terms",
        },
      ]}
      title="Terms"
    />
  );
}
