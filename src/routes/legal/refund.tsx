import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/refund")({
  component: RefundPage,
});

function RefundPage() {
  return (
    <LegalPage
      intro="Credits are refunded automatically when a generation fails. Refunds of money are handled by the operator."
      sections={[
        {
          body: "A generation that fails for any reason other than a blocked prompt returns its credits to your balance automatically, usually within seconds and at the latest within five minutes. A prompt blocked for content keeps its credits, because that check runs before the image is made.",
          heading: "Failed generations",
        },
        {
          body: "Replace this section with the operator's policy on refunding a credit purchase: the window, the conditions, and how to ask. Credits that have already been spent on images cannot be returned.",
          heading: "Credit purchases",
        },
        {
          body: "A money refund is only complete once the operator completes it in Mayar. The credit balance is adjusted separately, from the admin area, and that adjustment is recorded with its reason.",
          heading: "Payment status",
        },
      ]}
      title="Refunds"
    />
  );
}
