import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      intro="We collect the information needed to process orders, support delivery, and keep your account available."
      sections={[
        {
          body: "We may collect your name, contact details, shipping address, order contents, and payment references. Payment details are handled by the selected payment provider.",
          heading: "Information collected",
        },
        {
          body: "Information is used to create and fulfill your order, provide order status, prevent misuse, and improve the storefront.",
          heading: "How information is used",
        },
        {
          body: "Contact the merchant listed on the storefront for access, correction, or deletion requests. Keep this section aligned with your legal and retention requirements.",
          heading: "Your choices",
        },
      ]}
      title="Privacy"
    />
  );
}
