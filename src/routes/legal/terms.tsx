import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      intro="These terms describe the basic expectations for generating images, buying credits, and using what you make."
      sections={[
        {
          body: "Credits are spent when a generation starts. What an image costs in credits is shown before you commit to it. Credits have no cash value on their own and do not expire.",
          heading: "Credits",
        },
        {
          body: "The image provider refuses some prompts. A refused prompt keeps its credits, and repeated refusals pause generation on your account for a while.",
          heading: "What you may generate",
        },
        {
          body: "A purchase is only paid once the payment provider confirms the transaction. Returning from a payment page does not confirm payment, and credits arrive when the confirmation does.",
          heading: "Payment",
        },
        {
          body: "Replace this section with the operator's rules on the rights you have over generated images, prohibited use, limitation of liability, governing law, and contact details.",
          heading: "Operator terms",
        },
      ]}
      title="Terms"
    />
  );
}
