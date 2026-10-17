'use client';

import { Building, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useAdminActions, useAdminLoanApplications, useLoanPartners } from '@/hooks/useFlats';
import { formatDate, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import type { LoanApplication } from '@/lib/types';

/** Loan partner catalogue and application assignment. */
export const LoanPartnerManager = () => {
  const { data: partners, isLoading } = useLoanPartners();
  const { data: applications } = useAdminLoanApplications({ limit: 50 });
  const { createLoanPartner, updateLoanApplication } = useAdminActions();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [leadFee, setLeadFee] = useState(5000);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = partners ?? [];
  const apps = (applications ?? []) as LoanApplication[];

  const create = async () => {
    setError(null);
    if (name.trim().length < 2 || code.trim().length < 2) {
      setError('A partner needs a name and a short code.');
      return;
    }
    setPending('create');
    try {
      await createLoanPartner.mutateAsync({
        name,
        code,
        contactEmail: contactEmail || undefined,
        leadFeeAmount: leadFee,
      });
      setName('');
      setCode('');
      setContactEmail('');
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, 'Could not add the partner.'));
    } finally {
      setPending(null);
    }
  };

  const assign = async (application: LoanApplication, partnerId: string) => {
    const id = application._id ?? application.id ?? '';
    setPending(id);
    setError(null);
    try {
      await updateLoanApplication.mutateAsync({
        id,
        partnerId: partnerId || undefined,
        status: partnerId ? 'assigned' : application.status,
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not update the application.'));
    } finally {
      setPending(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={3} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <section aria-labelledby="lp-partners" className="space-y-3">
          <h2 id="lp-partners" className="text-base font-bold text-slate-900">
            Partners
          </h2>
          {list.length === 0 ? (
            <EmptyState preset="none" title="No loan partners yet" body="Add a partner so buyers can be matched." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((partner) => (
                <li key={partner._id ?? partner.id}>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Building className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                          <p className="truncate text-sm font-semibold text-slate-900">{partner.name}</p>
                        </div>
                        <Badge variant={partner.isActive ? 'success' : 'neutral'}>{partner.code}</Badge>
                      </div>
                      <dl className="grid grid-cols-2 gap-1.5 text-[12px]">
                        <div className="flex justify-between gap-1">
                          <dt className="text-slate-500">Interest</dt>
                          <dd className="font-medium text-slate-800">
                            {partner.interestRateMin}–{partner.interestRateMax}%
                          </dd>
                        </div>
                        <div className="flex justify-between gap-1">
                          <dt className="text-slate-500">Tenure</dt>
                          <dd className="font-medium text-slate-800">{partner.maxTenureYears}y</dd>
                        </div>
                        <div className="flex justify-between gap-1">
                          <dt className="text-slate-500">Max loan</dt>
                          <dd className="font-medium text-slate-800">{formatINR(partner.maxLoanAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-1">
                          <dt className="text-slate-500">Lead fee</dt>
                          <dd className="font-medium text-slate-800">{formatINR(partner.leadFeeAmount)}</dd>
                        </div>
                      </dl>
                      {partner.contactEmail ? (
                        <p className="truncate text-[11px] text-slate-500">{partner.contactEmail}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="lp-apps" className="space-y-3">
          <h2 id="lp-apps" className="text-base font-bold text-slate-900">
            Loan applications
          </h2>
          {apps.length === 0 ? (
            <EmptyState preset="none" title="No applications" body="Buyer applications appear here." />
          ) : (
            <ul className="space-y-2">
              {apps.map((application) => {
                const id = application._id ?? application.id ?? '';
                return (
                  <li key={id}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatINR(application.loanAmount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Applied {formatDate(application.createdAt)}
                            {application.employmentType ? ` · ${application.employmentType}` : ''}
                            {application.annualIncome ? ` · income ${formatINR(application.annualIncome)}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <select
                            aria-label="Assign loan partner"
                            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]"
                            value={application.partnerId ?? ''}
                            disabled={pending === id}
                            onChange={(event) => void assign(application, event.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {list.map((partner) => (
                              <option key={partner._id ?? partner.id} value={partner._id ?? partner.id}>
                                {partner.name}
                              </option>
                            ))}
                          </select>
                          <Badge variant="info" className="capitalize">
                            {application.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4 text-emerald-700" aria-hidden="true" />
              Add a loan partner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name" htmlFor="lp-name" required>
              <Input id="lp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="FlatTown Housing Finance" />
            </Field>
            <Field label="Code" htmlFor="lp-code" required hint="Short identifier shown to buyers.">
              <Input id="lp-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="FTHF" />
            </Field>
            <Field label="Contact email" htmlFor="lp-email">
              <Input id="lp-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
            </Field>
            <Field label="Referral lead fee (₹)" htmlFor="lp-fee" hint="Paid by the partner, never added to the buyer's loan.">
              <Input
                id="lp-fee"
                type="number"
                min={0}
                step={500}
                value={leadFee}
                onChange={(event) => setLeadFee(Number(event.target.value))}
              />
            </Field>
            <Button block onClick={create} disabled={pending === 'create'}>
              {pending === 'create' ? <Loader2 className="animate-spin" /> : <Plus />}
              Add partner
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
};