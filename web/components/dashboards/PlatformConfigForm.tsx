'use client';

import { Calculator, Loader2, Percent, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { TierBadge } from '@/components/common/Badges';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { SwitchRow } from '@/components/ui/switch';
import { useAdminActions, usePlatformConfig } from '@/hooks/useFlats';
import { calcCommission, calcTier, formatCompactINR, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import type { PlatformConfigView } from '@/lib/types';

const LAKH = 100_000;

/** Tier thresholds, commission percentage, agent split, tokens and visit rules. */
export const PlatformConfigForm = () => {
  const { data, isLoading } = usePlatformConfig();
  const { updateConfig } = useAdminActions();

  const [budgetMax, setBudgetMax] = useState(50);
  const [midMax, setMidMax] = useState(150);
  const [commissionPercent, setCommissionPercent] = useState(10);
  const [agentPlatformPercent, setAgentPlatformPercent] = useState(70);
  const [freeVisits, setFreeVisits] = useState(2);
  const [defaultToken, setDefaultToken] = useState(50);
  const [allowedTokens, setAllowedTokens] = useState('50000,100000,200000,500000');
  const [escrowAccount, setEscrowAccount] = useState('flattown-escrow');
  const [requireDocs, setRequireDocs] = useState(true);
  const [loanEnabled, setLoanEnabled] = useState(true);
  const [loanLeadFee, setLoanLeadFee] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const config = data?.config as PlatformConfigView | undefined;
    if (!config) return;
    setBudgetMax(config.tiers.budgetMax / LAKH);
    setMidMax(config.tiers.midMax / LAKH);
    setCommissionPercent(config.commission.bookingTokenPercent);
    setAgentPlatformPercent(config.commission.agentPlatformPercent);
    setFreeVisits(config.visits.freeVisitsForVerifiedBuilders);
    setDefaultToken(config.booking.defaultTokenAmount / LAKH);
    setAllowedTokens(config.booking.allowedTokenAmounts.join(','));
    setEscrowAccount(config.booking.escrowAccountId);
    setRequireDocs(config.booking.requireDocumentsBeforeRelease);
    setLoanEnabled(config.loan.enabled);
    setLoanLeadFee(config.loan.defaultLeadFee);
  }, [data]);

  if (isLoading) return <ListSkeleton rows={3} />;

  const midThreshold = midMax * LAKH;
  const budgetThreshold = budgetMax * LAKH;
  const invalidTiers = midThreshold <= budgetThreshold;

  const submit = async () => {
    setError(null);
    if (invalidTiers) {
      setError('The mid threshold must be higher than the budget threshold.');
      return;
    }
    const tokens = allowedTokens
      .split(',')
      .map((t) => Number(t.trim()))
      .filter((t) => Number.isFinite(t) && t >= 1000);
    if (tokens.length === 0) {
      setError('Provide at least one allowed token amount of ₹1,000 or more.');
      return;
    }
    try {
      await updateConfig.mutateAsync({
        tiers: { budgetMax: budgetThreshold, midMax: midThreshold },
        commission: {
          bookingTokenPercent: commissionPercent,
          agentPlatformPercent,
          agentAgentPercent: 100 - agentPlatformPercent,
        },
        visits: { freeVisitsForVerifiedBuilders: freeVisits },
        booking: {
          defaultTokenAmount: defaultToken * LAKH,
          allowedTokenAmounts: tokens,
          escrowAccountId: escrowAccount,
          requireDocumentsBeforeRelease: requireDocs,
        },
        loan: { enabled: loanEnabled, defaultLeadFee: loanLeadFee },
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the configuration.'));
    }
  };

  const sampleCommission = calcCommission(50_000, commissionPercent);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="size-4 text-emerald-700" aria-hidden="true" />
              Tier thresholds (RULE 1)
            </CardTitle>
            <p className="text-[13px] text-slate-600">
              A flat&rsquo;s tier is derived from its total price — never submitted by the builder. Changing these
              re-bands every existing flat.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Budget up to (₹ lakh)" htmlFor="cfg-budget" required>
                <Input
                  id="cfg-budget"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={budgetMax}
                  onChange={(event) => setBudgetMax(Number(event.target.value))}
                />
              </Field>
              <Field label="Mid up to (₹ lakh)" htmlFor="cfg-mid" required error={invalidTiers ? 'Must be above the budget threshold' : undefined}>
                <Input
                  id="cfg-mid"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={midMax}
                  onChange={(event) => setMidMax(Number(event.target.value))}
                />
              </Field>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Resulting bands</p>
              <div className="mt-2 space-y-1.5 text-[13px]">
                {[
                  { tier: 'budget' as const, range: `Below ${formatCompactINR(budgetThreshold)}` },
                  { tier: 'mid' as const, range: `${formatCompactINR(budgetThreshold)} – ${formatCompactINR(midThreshold)}` },
                  { tier: 'luxury' as const, range: `${formatCompactINR(midThreshold)} and above` },
                ].map((band) => (
                  <div key={band.tier} className="flex items-center justify-between gap-2">
                    <TierBadge tier={band.tier} />
                    <span className="text-slate-600">{band.range}</span>
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-0.5 text-[12px] text-slate-600">
                {[2_800_000, 7_000_000, 36_710_000].map((total) => (
                  <li key={total} className="flex justify-between gap-2">
                    <span>A flat at {formatINR(total)}</span>
                    <TierBadge tier={calcTier(total, { budget: budgetThreshold, mid: midThreshold })} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="size-4 text-emerald-700" aria-hidden="true" />
              Commission & agent split (RULE 4)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Commission on booking token (%)"
                htmlFor="cfg-commission"
                required
                hint="Charged on the token only — never on the property price."
              >
                <Input
                  id="cfg-commission"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={commissionPercent}
                  onChange={(event) => setCommissionPercent(Number(event.target.value))}
                />
              </Field>
              <Field
                label="Platform share of commission (%)"
                htmlFor="cfg-platform"
                required
                hint={`Agent receives ${100 - agentPlatformPercent}% of the commission.`}
              >
                <Input
                  id="cfg-platform"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={agentPlatformPercent}
                  onChange={(event) => setAgentPlatformPercent(Number(event.target.value))}
                />
              </Field>
            </div>

            <div className="rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-900">
              <p className="font-semibold">On a ₹50,000 token</p>
              <ul className="mt-1.5 space-y-0.5">
                <li className="flex justify-between gap-2">
                  <span>Platform commission ({commissionPercent}%)</span>
                  <span className="font-semibold tabular-nums">{formatINR(sampleCommission)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Platform share ({agentPlatformPercent}% of commission)</span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(Math.round((sampleCommission * agentPlatformPercent) / 100))}
                  </span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Agent share ({100 - agentPlatformPercent}% of commission)</span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(sampleCommission - Math.round((sampleCommission * agentPlatformPercent) / 100))}
                  </span>
                </li>
                <li className="flex justify-between gap-2 border-t border-emerald-200 pt-1">
                  <span className="font-semibold">Builder receives</span>
                  <span className="font-bold tabular-nums">{formatINR(50_000 - sampleCommission)}</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visits, tokens & loan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Free visits for verified builders"
                htmlFor="cfg-freevisits"
                hint="Free for the first N confirmed visits."
              >
                <Input
                  id="cfg-freevisits"
                  type="number"
                  min={0}
                  max={50}
                  value={freeVisits}
                  onChange={(event) => setFreeVisits(Number(event.target.value))}
                />
              </Field>
              <Field label="Default booking token (₹ lakh)" htmlFor="cfg-token">
                <Input
                  id="cfg-token"
                  type="number"
                  min={1}
                  value={defaultToken}
                  onChange={(event) => setDefaultToken(Number(event.target.value))}
                />
              </Field>
            </div>

            <Field
              label="Allowed token amounts (₹, comma separated)"
              htmlFor="cfg-tokens"
              hint="Buyers may only choose from this list — they cannot send an arbitrary amount."
            >
              <Input id="cfg-tokens" value={allowedTokens} onChange={(event) => setAllowedTokens(event.target.value)} />
            </Field>

            <Field label="Escrow account reference" htmlFor="cfg-escrow" hint="Recorded on every booking for reconciliation.">
              <Input id="cfg-escrow" value={escrowAccount} onChange={(event) => setEscrowAccount(event.target.value)} />
            </Field>

            <SwitchRow
              id="cfg-requiredocs"
              label="Require verified documents before escrow release"
              hint="Blocks release until Aadhaar and PAN are verified."
              checked={requireDocs}
              onCheckedChange={setRequireDocs}
            />
            <SwitchRow
              id="cfg-loan"
              label="Loan assistance enabled"
              checked={loanEnabled}
              onCheckedChange={setLoanEnabled}
            />

            {loanEnabled ? (
              <Field label="Default loan lead fee (₹)" htmlFor="cfg-loanfee" hint="Referral fee from the loan partner, never added to the buyer's loan.">
                <Input
                  id="cfg-loanfee"
                  type="number"
                  min={0}
                  step={500}
                  value={loanLeadFee}
                  onChange={(event) => setLoanLeadFee(Number(event.target.value))}
                />
              </Field>
            ) : null}
          </CardContent>
        </Card>

        <Button size="lg" onClick={submit} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save configuration
        </Button>
      </div>

      <aside className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>What changes immediately</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-[13px] leading-relaxed text-slate-600">
              <li>· Tier thresholds re-band every existing flat and purge the discovery cache.</li>
              <li>· Commission percentage applies to every new token booking.</li>
              <li>· The agent split is recorded on each booking, so historic bookings keep their applied ratio.</li>
              <li>· Allowed token amounts are enforced by the API on token creation.</li>
            </ul>
          </CardContent>
        </Card>

        <Alert tone="info" title="Server-side source of truth">
          The API keeps an in-memory pricing context that the Mongoose validators and the booking engine both read, so
          these values are applied consistently — a client can never post its own tier, commission or escrow figures.
        </Alert>
      </aside>
    </div>
  );
};