"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { RefreshCw, Sparkles } from "lucide-react";
import { BottomSheet, SheetHeader } from "@/components/bottom-sheet";
import { BodyPhotoUpload } from "@/components/body-photo-upload";
import { useUser } from "@/components/user-context";
import { renderOutfit, type StyledOutfit } from "@/lib/api";

type Props = {
  styled: StyledOutfit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRendered: (updated: StyledOutfit) => void; // so the Style page keeps the render_path
};

// "See it on me": the outfit rendered on the user's own full-body photo by Nano Banana.
export function RenderSheet({ styled, open, onOpenChange, onRendered }: Props) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      {styled && <SheetBody key={styled.outfit.id} styled={styled} onRendered={onRendered} />}
    </BottomSheet>
  );
}

function SheetBody({ styled, onRendered }: { styled: StyledOutfit; onRendered: Props["onRendered"] }) {
  const { currentUser } = useUser();
  const hasPhoto = Boolean(currentUser?.full_body_photo);
  const [rendering, setRendering] = useState(hasPhoto);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Cache-buster: a regenerated render keeps the same file name.
  const [src, setSrc] = useState<string | null>(null);
  const started = useRef(false);

  // What the wait looks like: one line per piece, then the finish.
  const steps = [
    "Getting your photo ready…",
    ...styled.items.map((i) => `Fitting the ${(i.subtype ?? i.category ?? "piece").replace(/_/g, " ")}…`),
    "Adding the final details…",
  ];

  async function render(force: boolean) {
    setRendering(true);
    setStep(0);
    setError(null);
    try {
      const updated = await renderOutfit(styled.outfit.id, force);
      onRendered(updated);
      setSrc(`${updated.outfit.render_path}?v=${Date.now()}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    // The ref keeps dev Strict Mode's second effect run from starting a second (paid) render.
    if (!hasPhoto || started.current) return;
    started.current = true;
    render(false); // also runs right after a first photo is added in this sheet
  }, [hasPhoto]); // eslint-disable-line react-hooks/exhaustive-deps -- once per opened outfit

  useEffect(() => {
    if (!rendering) return;
    const timer = setInterval(() => setStep((n) => Math.min(n + 1, steps.length - 1)), 2500);
    return () => clearInterval(timer);
  }, [rendering, steps.length]);

  return (
    <>
      <SheetHeader />
      <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Drawer.Title className="text-lg font-semibold">{styled.outfit.name}</Drawer.Title>

        {!hasPhoto ? (
          <>
            <Drawer.Description className="mt-0.5 mb-4 text-sm text-muted-foreground">
              Add a full-body photo once, and Gemini will dress you in this outfit.
            </Drawer.Description>
            <BodyPhotoUpload />
          </>
        ) : (
          <>
            <Drawer.Description className="mt-0.5 mb-4 text-sm text-muted-foreground">
              This outfit on you, made from your photo and each piece&apos;s fit.
            </Drawer.Description>
            {rendering ? (
              <div
                role="status"
                className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-3xl bg-[#F5F5F3] text-muted-foreground"
              >
                <Sparkles className="size-8 animate-pulse" />
                <p key={step} className="animate-in fade-in text-sm font-medium text-foreground duration-500">
                  {steps[step]}
                </p>
                <p className="text-xs">This usually takes 10–20 seconds</p>
              </div>
            ) : src ? (
              <div className="relative overflow-hidden rounded-3xl bg-[#F5F5F3]">
                {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
                <img
                  src={src}
                  alt={`${styled.outfit.name} on you`}
                  className="mx-auto max-h-[62dvh] w-auto object-contain"
                />
                <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm">
                  <Sparkles className="size-3" />
                  AI preview
                </span>
              </div>
            ) : null}

            {error && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            {!rendering && (
              <button
                onClick={() => render(Boolean(src))}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground active:scale-[0.98]"
              >
                <RefreshCw className="size-4" />
                {src ? "Regenerate" : "Try again"}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
