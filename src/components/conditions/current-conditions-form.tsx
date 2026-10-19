"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collectPricesOnNavigate } from "@/lib/conditions/collected-prices";
import { isValidDecimalInput } from "@/lib/conditions/decimal-input";
import {
  ADDRESS_LABEL,
  ANNUAL_AMOUNT,
  COMPANY_NAME_LABEL,
  COMPANY_NAME_PLACEHOLDER,
  CONDITIONS_TITLE,
  CUPS_LABEL,
  CUSTOMER_DATA_PLACEHOLDER,
  CUSTOMER_DATA_TITLE,
  ENERGY_TITLE,
  EXTRA_SERVICES_PLACEHOLDER,
  EXTRA_SERVICES_TITLE,
  GO_TO_PROPOSALS,
  HOLDER_LABEL,
  POWER_TERM_TITLE,
  PRICE_PLACEHOLDER,
} from "@/lib/conditions/messages";
import { type CurrentConditions, ROUTES } from "@/lib/gate/fee-first";

const EMPTY: CurrentConditions = {
  powerTermPriceByPeriod: {},
  energyPriceByPeriod: {},
  extraServices: "",
  companyName: null,
};

const INPUT = "h-12 bg-card text-base text-table-text md:text-base";

function HighlightHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="rounded-md bg-header-highlight px-3 py-2 text-center text-sm font-bold text-primary-foreground">
      {children}
    </h2>
  );
}

function SubtleHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="rounded-md border border-section-border bg-header-background px-3 py-1.5 text-center text-sm font-medium text-table-text">
      {children}
    </h3>
  );
}

type RowProps = {
  label: string;
  children: (id: string) => React.ReactNode;
};

function Row({ label, children }: RowProps) {
  const id = useId();
  return (
    <div className="grid grid-cols-[1fr_2fr] items-center gap-3 px-3 py-1.5">
      <label htmlFor={id} className="text-xs font-bold text-table-text">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

type DecimalProps = {
  id: string;
  /** Accessible name when the visible label is ambiguous (e.g. "P1"). */
  ariaLabel?: string;
  value: string; placeholder: string; onChange: (v: string) => void };

/** BmApp: a change that fails `isValidDecimalInput` is dropped, so the field keeps its value. */
function DecimalInput({ id, ariaLabel, value, placeholder, onChange }: DecimalProps) {
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        if (isValidDecimalInput(e.target.value)) onChange(e.target.value);
      }}
      className={INPUT}
    />
  );
}

/** Port of BmApp `CurrentUserConditionsMainView`; every valid change is saved immediately. */
export function CurrentConditionsForm() {
  const { session, conditions, setSession, setConditions, stage } = useFeeFirstGate();
  const { user } = useAuth();
  const router = useRouter();
  if (!session) return null;

  const current = conditions ?? EMPTY;
  const update = (patch: Partial<CurrentConditions>) => setConditions({ ...current, ...patch });

  const onGoToProposals = () => {
    if (user) collectPricesOnNavigate(user, session, conditions);
    router.push(ROUTES.proposals);
  };

  return (
    <div className="flex flex-col gap-3">
      <HighlightHeader>{CUSTOMER_DATA_TITLE}</HighlightHeader>
      <div className="border border-table-border">
        <Row label={HOLDER_LABEL}>
          {(id) => (
            <Input
              id={id}
              value={session.holderName ?? ""}
              placeholder={CUSTOMER_DATA_PLACEHOLDER}
              onChange={(e) => setSession({ ...session, holderName: e.target.value })}
              className={INPUT}
            />
          )}
        </Row>
        <Row label={ADDRESS_LABEL}>
          {(id) => (
            <Input
              id={id}
              value={session.address ?? ""}
              placeholder={CUSTOMER_DATA_PLACEHOLDER}
              onChange={(e) => setSession({ ...session, address: e.target.value })}
              className={INPUT}
            />
          )}
        </Row>
        <div className="grid grid-cols-[1fr_2fr] items-center gap-3 px-3 py-1.5">
          <span className="text-xs font-bold text-table-text">{CUPS_LABEL}</span>
          <span className="min-h-12 content-center font-mono text-base break-all text-table-text">
            {session.cups}
          </span>
        </div>
        <Row label={COMPANY_NAME_LABEL}>
          {(id) => (
            <Input
              id={id}
              value={current.companyName ?? ""}
              placeholder={COMPANY_NAME_PLACEHOLDER}
              onChange={(e) => update({ companyName: e.target.value })}
              className={INPUT}
            />
          )}
        </Row>
      </div>

      <HighlightHeader>{CONDITIONS_TITLE}</HighlightHeader>

      <SubtleHeader>{POWER_TERM_TITLE}</SubtleHeader>
      <div className="border border-table-border">
        {session.powerPeriods.map((p) => (
          <Row key={p} label={p}>
            {(id) => (
              <DecimalInput
                id={id}
                ariaLabel={`Potencia ${p}`}
                value={current.powerTermPriceByPeriod[p] ?? ""}
                placeholder={PRICE_PLACEHOLDER}
                onChange={(v) => update({ powerTermPriceByPeriod: { ...current.powerTermPriceByPeriod, [p]: v } })}
              />
            )}
          </Row>
        ))}
      </div>

      <SubtleHeader>{ENERGY_TITLE}</SubtleHeader>
      <div className="border border-table-border">
        {session.energyPeriods.map((p) => (
          <Row key={p} label={p}>
            {(id) => (
              <DecimalInput
                id={id}
                ariaLabel={`Energía ${p}`}
                value={current.energyPriceByPeriod[p] ?? ""}
                placeholder={PRICE_PLACEHOLDER}
                onChange={(v) => update({ energyPriceByPeriod: { ...current.energyPriceByPeriod, [p]: v } })}
              />
            )}
          </Row>
        ))}
      </div>

      <HighlightHeader>{EXTRA_SERVICES_TITLE}</HighlightHeader>
      <div className="border border-table-border">
        <Row label={ANNUAL_AMOUNT}>
          {(id) => (
            <DecimalInput
              id={id}
              value={current.extraServices}
              placeholder={EXTRA_SERVICES_PLACEHOLDER}
              onChange={(v) => update({ extraServices: v })}
            />
          )}
        </Row>
      </div>

      {stage === "UNLOCKED" && (
        <Button type="button" size="lg" className="h-12 w-full text-base font-bold" onClick={onGoToProposals}>
          {GO_TO_PROPOSALS}
        </Button>
      )}
    </div>
  );
}
