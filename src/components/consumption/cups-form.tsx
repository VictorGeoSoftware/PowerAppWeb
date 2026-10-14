"use client";

import { AlertCircleIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidCups, toSubmittableCups } from "@/lib/consumption/cups";

export const CUPS_HELP_EMPTY = "Introduce el CUPS que aparece en la factura";
export const CUPS_HELP_VALID = "Formato válido";
export const CUPS_HELP_INVALID = "Formato no válido";

type Props = {
  initialValue?: string;
  error?: string | null;
  /** Receives the corrected CUPS (`toSubmittableCups`). */
  onSubmit: (cups: string) => void;
};

/** Manual CUPS entry with BmApp scanner's live validation. */
export function CupsForm({ initialValue = "", error, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);
  const helpId = useId();
  const valid = isValidCups(value);
  const invalid = value !== "" && !valid;
  const help = value === "" ? CUPS_HELP_EMPTY : valid ? CUPS_HELP_VALID : CUPS_HELP_INVALID;

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(toSubmittableCups(value));
      }}
    >
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-foreground"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {error}
        </p>
      )}
      <Label htmlFor="cups" className="text-base font-semibold">
        Introducir código CUPS
      </Label>
      <Input
        id="cups"
        name="cups"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ES0021000012345678XX"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="go"
        maxLength={30}
        aria-invalid={invalid || undefined}
        aria-describedby={helpId}
        className="h-12 bg-card font-mono text-base tracking-wide md:text-base"
      />
      <p id={helpId} className={invalid ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {help}
      </p>
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!valid}>
        Confirmar
      </Button>
    </form>
  );
}
