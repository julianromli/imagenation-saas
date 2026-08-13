import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckIcon,
  CircleQuestionMark,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { markSetupStep } from "@/lib/setup.functions";
import { type SetupGuideStep, setupGuideSteps } from "@/lib/setup-guide";
import { cn } from "@/lib/utils";

/**
 * Remembers that the operator has closed the wizard, per browser.
 *
 * Which steps are finished lives on the server, because it belongs to the app.
 * Whether somebody wants the window in front of them right now belongs to the
 * machine they are sitting at.
 */
const CLOSED_KEY = "imagenation:setup-guide-closed";

function readClosed() {
  try {
    return localStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    // Private browsing and disabled storage both throw. Opening again is the
    // harmless answer.
    return false;
  }
}

function writeClosed(closed: boolean) {
  try {
    if (closed) {
      localStorage.setItem(CLOSED_KEY, "1");
    } else {
      localStorage.removeItem(CLOSED_KEY);
    }
  } catch {
    // Nothing to do. The wizard opens again next time, which is not a failure.
  }
}

/** The first step still outstanding, or the last one when all are finished. */
function firstUnfinished(done: string[]) {
  const index = setupGuideSteps.findIndex((step) => !done.includes(step.id));

  return index === -1 ? setupGuideSteps.length - 1 : index;
}

type SetupGuideButtonProps = {
  /** Step ids already finished, decided by the server. */
  done: string[];
};

/**
 * The first-run wizard, one step at a time.
 *
 * The root route decides whether to render this at all: everyone before setup,
 * administrators afterwards, and nobody once the last step is ticked. So there
 * is no check here.
 *
 * It opens itself, because a fresh deploy is exactly the moment the operator
 * does not know what to do next, and a button they have to find first is a
 * button they miss. It resumes on the first unfinished step, so closing it
 * halfway costs nothing.
 */
export function SetupGuideButton({ done }: SetupGuideButtonProps) {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(() => firstUnfinished(done));
  const [busy, setBusy] = useState(false);
  // Set when the last step is ticked. Holds the window open on a confirmation
  // rather than letting the loader pull it out from under the operator.
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    // Reading storage during render would make the server and the client
    // disagree, so the decision waits until after hydration.
    //
    // Not on `/setup` itself: somebody already standing on step one does not
    // need a window telling them to go there.
    if (pathname !== "/setup" && !readClosed()) {
      setOpen(true);
    }
  }, [pathname]);

  function change(next: boolean) {
    setOpen(next);
    writeClosed(!next);

    if (!next && complete) {
      // Now, and not before: re-reading the loader is what removes this
      // component, so it waits until the operator has seen the confirmation.
      router.invalidate();
    }
  }

  const isLast = index === setupGuideSteps.length - 1;
  const remaining = setupGuideSteps.length - done.length;

  async function setDone(next: boolean) {
    setBusy(true);

    try {
      const updated = await markSetupStep({
        data: { done: next, id: setupGuideSteps[index].id },
      });

      // Answered by the server rather than by the props, which are a render
      // behind. Checked here rather than with the helper in `onboarding.ts`:
      // that module reaches the database and has no business in the browser.
      if (setupGuideSteps.every((entry) => updated.includes(entry.id))) {
        setComplete(true);
        return;
      }

      // The loader owns this list, so it re-reads rather than being told.
      await router.invalidate();

      if (next && !isLast) {
        setIndex(index + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Setup guide"
                // Bottom left, because the TanStack devtools own the opposite
                // corner and both are on screen while an app is set up.
                className="fixed bottom-5 left-5 z-40 size-11 rounded-full bg-background shadow-lg"
                onClick={() => {
                  setIndex(firstUnfinished(done));
                  change(true);
                }}
                size="icon"
                variant="outline"
              />
            }
          >
            <CircleQuestionMark aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right">
            {remaining} setup {remaining === 1 ? "step" : "steps"} left
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog onOpenChange={change} open={open}>
        <DialogContent className="max-h-[85dvh] gap-5 overflow-y-auto sm:max-w-lg">
          {complete ? (
            <CompleteView onClose={() => change(false)} />
          ) : (
            <StepView
              busy={busy}
              done={done}
              index={index}
              isLast={isLast}
              onClose={() => change(false)}
              onIndexChange={setIndex}
              onSetDone={setDone}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompleteView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Setup complete</DialogTitle>
        <DialogDescription>
          All {setupGuideSteps.length} steps are done. This guide does not come
          back.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3 rounded-2xl border px-4 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon aria-hidden="true" className="size-4" />
        </span>
        <p className="text-sm">Imagenation is ready to take payments.</p>
      </div>

      <DialogFooter>
        <Button
          className="min-h-11 rounded-full"
          onClick={onClose}
          type="button"
        >
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

type StepViewProps = {
  busy: boolean;
  done: string[];
  index: number;
  isLast: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onSetDone: (done: boolean) => void;
};

function StepView({
  busy,
  done,
  index,
  isLast,
  onClose,
  onIndexChange,
  onSetDone,
}: StepViewProps) {
  const step = setupGuideSteps[index];
  const finished = done.includes(step.id);

  return (
    <>
      <DialogHeader>
        <DialogDescription>
          Set up · step {index + 1} of {setupGuideSteps.length}
        </DialogDescription>
        <DialogTitle>
          {step.title}
          {step.optional ? (
            <span className="ml-2 font-normal text-muted-foreground text-sm">
              Optional
            </span>
          ) : null}
        </DialogTitle>
      </DialogHeader>

      <ProgressBar done={done} index={index} />

      <p className="text-muted-foreground text-sm leading-6">{step.body}</p>

      <StepLink onNavigate={onClose} step={step} />

      <DialogFooter className="sm:justify-between">
        <Button
          className="min-h-11 rounded-full"
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>

        <div className="flex gap-2">
          {finished ? (
            <Button
              className="min-h-11 rounded-full"
              disabled={busy}
              onClick={() => onSetDone(false)}
              type="button"
              variant="outline"
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Not yet
            </Button>
          ) : null}

          {finished && !isLast ? (
            <Button
              className="min-h-11 rounded-full"
              onClick={() => onIndexChange(index + 1)}
              type="button"
            >
              Next
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}

          {finished ? null : (
            <Button
              className="min-h-11 rounded-full"
              disabled={busy}
              onClick={() => onSetDone(true)}
              type="button"
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CheckIcon aria-hidden="true" />
              )}
              {isLast ? "Finish setup" : "Done, next"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}

function StepLink({
  onNavigate,
  step,
}: {
  onNavigate: () => void;
  step: SetupGuideStep;
}) {
  if (!step.to) {
    return null;
  }

  return (
    <Link
      className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
      onClick={onNavigate}
      to={step.to}
    >
      Open {step.to}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

function ProgressBar({ done, index }: { done: string[]; index: number }) {
  return (
    <ol aria-label="Progress" className="-mt-2 flex gap-1.5">
      {setupGuideSteps.map((entry, position) => {
        const entryDone = done.includes(entry.id);

        return (
          <li
            aria-current={position === index ? "step" : undefined}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              entryDone && "bg-primary",
              !entryDone && position === index && "bg-muted-foreground/40",
              !(entryDone || position === index) && "bg-muted"
            )}
            key={entry.id}
          >
            <span className="sr-only">
              {entry.title}
              {entryDone ? " — done" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
