"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS, type Category, type Condition } from "@/lib/labels";
import { errorMessage } from "@/lib/errors";
import { Button, ErrorText, inputClass } from "./ui";

export type ToolValues = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolValues = { name: "", category: "power_tools", condition: "good", description: "" };

/** Formulario para publicar o editar una herramienta. */
export function ToolForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolValues;
  submitLabel: string;
  onSubmit: (values: ToolValues) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolValues>(k: K, v: ToolValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(values);
      if (initial === EMPTY) setValues(EMPTY);
      onCancel?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-sm">
        Name
        <input required minLength={2} maxLength={80} value={values.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="Cordless drill" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Category
          <select value={values.category} onChange={(e) => set("category", e.target.value as Category)} className={inputClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Condition
          <select value={values.condition} onChange={(e) => set("condition", e.target.value as Condition)} className={inputClass}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm">
        Short description
        <textarea maxLength={500} rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} className={inputClass} placeholder="18V, two batteries included" />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </form>
  );
}
