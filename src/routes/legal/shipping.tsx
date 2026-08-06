import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/shipping")({
  component: ShippingPage,
});

function ShippingPage() {
  return (
    <LegalPage
      intro="Orders are shipped to the address entered at checkout using the merchant's configured flat-rate shipping."
      sections={[
        {
          body: "Review your address before payment. Orders are reserved for 30 minutes while payment is completed and are prepared after the payment provider confirms the order.",
          heading: "Preparing your order",
        },
        {
          body: "Add the delivery areas, carrier, estimated timelines, tracking process, and handling exceptions for your store.",
          heading: "Delivery times",
        },
        {
          body: "Contact the merchant as soon as possible if your address is incorrect or your package has not arrived within the published delivery window.",
          heading: "Delivery support",
        },
      ]}
      title="Shipping"
    />
  );
}
