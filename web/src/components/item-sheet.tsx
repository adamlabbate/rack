"use client";

import { useRef, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { Camera, Check, CloudRain, Loader2, Plus, Snowflake, Sparkles, Trash2, Users, X } from "lucide-react";
import { BottomSheet, SheetHeader } from "@/components/bottom-sheet";
import {
  CATEGORIES,
  FIT_FIELDS,
  imageUrl,
  LENGTHS,
  deleteItem,
  retagItem,
  RISES,
  SEASONS,
  SILHOUETTES,
  STYLES,
  updateItem,
  WEATHER,
  type Item,
  type ItemUpdate,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// "smart_casual" -> "smart casual", "n_a" -> "n/a"
function label(value: string) {
  return value === "n_a" ? "n/a" : value.replace(/_/g, " ");
}

type Props = {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemChange: (item: Item) => void;
  onItemDeleted: (item: Item) => void;
};

export function ItemSheet({ item, open, onOpenChange, onItemChange, onItemDeleted }: Props) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      {item && (
        <SheetBody key={item.id} item={item} onItemChange={onItemChange} onItemDeleted={onItemDeleted} />
      )}
    </BottomSheet>
  );
}

function SheetBody({
  item,
  onItemChange,
  onItemDeleted,
}: {
  item: Item;
  onItemChange: (item: Item) => void;
  onItemDeleted: (item: Item) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<"ask" | "busy" | null>(null);
  const [retagging, setRetagging] = useState(false);
  // Edits are optimistic; only the newest request's response may overwrite the UI,
  // so a slow earlier PATCH can't undo a later tap.
  const latestRequest = useRef(0);
  const fitUnknown = item.silhouette === "unknown" || item.length === "unknown";

  function save(changes: ItemUpdate) {
    const before = item;
    const touchesFit = FIT_FIELDS.some((f) => f in changes) || changes.fit_confirmed;
    const onlySharing = Object.keys(changes).every((k) => k === "shared"); // not a tag edit
    onItemChange({
      ...item,
      ...changes,
      user_edited: onlySharing ? item.user_edited : true,
      fit_confirmed: touchesFit ? true : item.fit_confirmed,
    });
    setError(null);

    const requestId = ++latestRequest.current;
    updateItem(item.id, changes)
      .then((saved) => requestId === latestRequest.current && onItemChange(saved))
      .catch(() => {
        if (requestId !== latestRequest.current) return;
        onItemChange(before);
        setError("Couldn't save that change. Check your connection and try again.");
      });
  }

  async function remove() {
    setDeleting("busy");
    setError(null);
    try {
      await deleteItem(item.id);
      onItemDeleted(item);
    } catch (err) {
      setDeleting(null);
      setError((err as Error).message);
    }
  }

  async function retag() {
    setRetagging(true);
    setError(null);
    try {
      onItemChange(await retagItem(item.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetagging(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <Drawer.Close className="flex h-11 items-center rounded-full px-4 text-base font-semibold">
          Done
        </Drawer.Close>
      </SheetHeader>

      <Drawer.Content className="min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-[#F5F5F3] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- images come from the API server */}
          <img
            src={imageUrl(item.cutout_path ?? item.image_path)}
            alt={item.subtype ?? "Clothing item"}
            className={cn("max-h-full max-w-full", item.cutout_path ? "object-contain" : "rounded-lg object-cover")}
          />
        </div>

        <Drawer.Title className="sr-only">{item.subtype ?? "Clothing item"}</Drawer.Title>
        <TextField
          key={item.subtype}
          value={item.subtype ?? ""}
          placeholder="What is it? (e.g. hoodie)"
          onCommit={(subtype) => save({ subtype })}
          className="mt-4 text-xl font-semibold capitalize"
        />

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <button
          role="switch"
          aria-checked={item.shared}
          onClick={() => save({ shared: !item.shared })}
          className="mt-3 flex w-full items-center gap-3 rounded-xl bg-muted px-3 py-2.5 text-left"
        >
          <Users className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Shared with friends</span>
            <span className="block text-xs text-muted-foreground">
              {item.shared ? "Friends and groups can see it and ask to borrow it" : "Only you can see it"}
            </span>
          </span>
          <span
            className={cn(
              "flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
              item.shared ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "size-6 rounded-full bg-background shadow-sm transition-transform",
                item.shared && "translate-x-5",
              )}
            />
          </span>
        </button>

        {item.needs_retake && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Camera className="mt-0.5 size-4 shrink-0" />
            This piece overlapped another one in the photo. Retake it on its own for a clean cutout.
          </p>
        )}

        {!item.category && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
            <p className="text-sm text-muted-foreground">Gemini couldn&apos;t tag this one.</p>
            <button
              onClick={retag}
              disabled={retagging}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {retagging ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Try again
            </button>
          </div>
        )}

        <Section title="Category">
          <Chips options={CATEGORIES} value={item.category} onChange={(category) => save({ category })} />
        </Section>
        <Section title="Style">
          <Chips options={STYLES} value={item.style} onChange={(style) => save({ style })} />
        </Section>
        <Section title="Colors">
          <ListEditor
            values={item.colors}
            placeholder="Add color"
            onChange={(colors) => save({ colors })}
          />
        </Section>
        <Section title="Formality" hint="1 lounge · 5 black tie">
          <Scale value={item.formality} onChange={(formality) => save({ formality })} />
        </Section>
        <Section title="Season">
          <Chips options={SEASONS} value={item.season} onChange={(season) => save({ season })} />
        </Section>
        <Section title="Warmth" hint="1 very light · 5 heavy winter">
          <Scale value={item.warmth} onChange={(warmth) => save({ warmth })} />
        </Section>
        <Section title="OK in">
          <div className="flex gap-2">
            {WEATHER.map((w) => {
              const on = item.weather_ok.includes(w);
              const Icon = w === "rain" ? CloudRain : Snowflake;
              return (
                <button
                  key={w}
                  aria-pressed={on}
                  onClick={() =>
                    save({ weather_ok: on ? item.weather_ok.filter((x) => x !== w) : [...item.weather_ok, w] })
                  }
                  className={cn(pill, "gap-1.5", on ? pillOn : pillOff)}
                >
                  <Icon className="size-4" />
                  {w}
                </button>
              );
            })}
          </div>
        </Section>

        <div className="mt-6 rounded-2xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Fit</h3>
            {item.fit_confirmed ? (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-4" /> Confirmed
              </span>
            ) : fitUnknown ? null : (
              <button
                onClick={() => save({ fit_confirmed: true })}
                className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <Check className="size-4" /> Looks right
              </button>
            )}
          </div>
          {!item.fit_confirmed && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full bg-amber-500" />
              {fitUnknown
                ? "Gemini couldn't judge the fit from this photo. Pick it yourself."
                : "Gemini's guess. Fix anything that's off."}
            </p>
          )}
          <Section title="Silhouette">
            <Chips options={SILHOUETTES} value={item.silhouette} onChange={(silhouette) => save({ silhouette })} />
          </Section>
          <Section title="Length">
            <Chips options={LENGTHS} value={item.length} onChange={(length) => save({ length })} />
          </Section>
          <Section title="Rise">
            <Chips options={RISES} value={item.rise} onChange={(rise) => save({ rise })} />
          </Section>
        </div>

        <Section title="Your tags">
          <ListEditor
            values={item.custom_tags}
            placeholder="Add tag"
            onChange={(custom_tags) => save({ custom_tags })}
          />
        </Section>

        {/* Two taps to delete, so a stray tap while scrolling can't lose an item. */}
        <div className="mt-8 border-t pt-4">
          {deleting === null ? (
            <button
              onClick={() => setDeleting("ask")}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-medium text-destructive"
            >
              <Trash2 className="size-5" /> Delete item
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDeleting(null)}
                disabled={deleting === "busy"}
                className="h-12 rounded-full bg-muted text-base font-medium"
              >
                Keep
              </button>
              <button
                onClick={remove}
                disabled={deleting === "busy"}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-destructive text-base font-medium text-white disabled:opacity-60"
              >
                {deleting === "busy" && <Loader2 className="size-4 animate-spin" />}
                Delete for good
              </button>
            </div>
          )}
        </div>
      </Drawer.Content>
    </>
  );
}

const pill = "flex h-10 items-center rounded-full px-4 text-sm font-medium capitalize transition-colors";
const pillOn = "bg-primary text-primary-foreground";
const pillOff = "bg-muted text-foreground";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        {title}
        {hint && <span className="ml-2 font-normal text-muted-foreground/70">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          aria-pressed={value === option}
          onClick={() => value !== option && onChange(option)}
          className={cn(pill, value === option ? pillOn : pillOff)}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

function Scale({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          aria-pressed={value === n}
          onClick={() => value !== n && onChange(n)}
          className={cn("h-11 rounded-xl text-base font-semibold", value === n ? pillOn : pillOff)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// Removable chips plus an "add" input; used for colors and custom tags.
function ListEditor({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim().toLowerCase();
    setDraft("");
    if (value && !values.includes(value)) onChange([...values, value]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <button
          key={value}
          onClick={() => onChange(values.filter((v) => v !== value))}
          aria-label={`Remove ${value}`}
          className={cn(pill, pillOff, "gap-1.5 pr-3")}
        >
          {value}
          <X className="size-4 text-muted-foreground" />
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex h-10 items-center rounded-full border pr-1 pl-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="done"
          className="w-24 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" aria-label={placeholder} className="flex size-8 items-center justify-center">
          <Plus className="size-4" />
        </button>
      </form>
    </div>
  );
}

// Saves on blur or Enter, not on every keystroke.
function TextField({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim();
    if (next !== value) onCommit(next || null);
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder={placeholder}
      enterKeyHint="done"
      className={cn(
        "-mx-2 w-[calc(100%+1rem)] rounded-lg bg-transparent px-2 py-1 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground focus:bg-muted",
        className,
      )}
    />
  );
}
