import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleQuestionMark } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setupGuideSteps } from "@/lib/setup-guide";

/**
 * The floating guide, shown only while setup is unfinished.
 *
 * The root route decides whether to render this at all, so there is no check
 * here. Once `/setup` completes it never appears again: a shopper has no use
 * for instructions on creating an administrator.
 *
 * The tooltip is for pointer devices, which are the only ones that can hover.
 * `aria-label` is what carries the name everywhere else.
 */
export function SetupGuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Guide"
                // Bottom left, because the TanStack devtools own the opposite
                // corner and both are on screen while a store is set up.
                className="fixed bottom-5 left-5 z-40 size-11 rounded-full bg-background shadow-lg"
                onClick={() => setOpen(true)}
                size="icon"
                variant="outline"
              />
            }
          >
            <CircleQuestionMark aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right">Guide</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-md"
          side="left"
        >
          <SheetHeader>
            <SheetTitle>Finish setting up your store</SheetTitle>
            <SheetDescription>
              Five steps between this deploy and taking your first order. This
              guide disappears once setup is complete.
            </SheetDescription>
          </SheetHeader>

          <ol className="flex flex-col gap-7 px-6 pb-8">
            {setupGuideSteps.map((step, index) => (
              <li className="flex gap-4" key={step.title}>
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {step.title}
                    {step.optional ? (
                      <span className="ml-2 font-normal text-muted-foreground text-xs">
                        Optional
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1.5 text-muted-foreground text-sm leading-6">
                    {step.body}
                  </p>
                  {step.to ? (
                    <Link
                      className="mt-2.5 inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
                      onClick={() => setOpen(false)}
                      to={step.to}
                    >
                      Go to {step.to}
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}
