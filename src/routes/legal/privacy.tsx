import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      intro="We collect the information needed to run your account, make the images you ask for, and take payment."
      sections={[
        {
          body: "We store your name, email address, and the mobile number you give at your first purchase. We store every prompt you write, the images made from it, and the settings you chose. Payment details are handled by the payment provider and never reach us.",
          heading: "Information collected",
        },
        {
          body: "Your prompt and any reference images you upload are sent to the image provider to make the image. Nothing else is shared. Your images are private by default, and only become readable by others if you turn sharing on for a specific image.",
          heading: "What is shared",
        },
        {
          body: "Generated images are deleted 90 days after they are made, unless you shared them. The record of what you made, and what it cost you, is kept so your credit history stays complete.",
          heading: "How long it is kept",
        },
        {
          body: "Contact the operator listed on this site for access, correction, or deletion requests. Keep this section aligned with your legal and retention requirements.",
          heading: "Your choices",
        },
      ]}
      title="Privacy"
    />
  );
}
