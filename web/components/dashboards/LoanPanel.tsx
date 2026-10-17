'use client';

import { BadgeIndianRupee, Building, Loader2, Percent, Send } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useApplyLoan, useBookings, useLoanApplications, useLoanPartners } from '@/hooks/useFlats';
import { formatDate, formatINR } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import type { Booking } from '@/lib/types';

const LAKH = 100_000;

export const LoanPanel = () => {
  const { data: applications, isLoading } = useLoanApplications();
  const { data: partners } = useLoanPartners();
  const { data: bookings } = useBookings({ scope: 'mine', limit: 20 });
  const applyLoan = useApplyLoan();

  const [flatId, setFlatId] = useState('');
  const [loanAmount, setLoanAmount] = useState(50);
  const [employmentType, setEmploymentType] = useState('salaried');
  const [annualIncome, setAnnualIncome] = useState(15);
  const [error, setError] = useState<string | null>(null);

  const bookingList = (bookings ?? []) as Booking[];

  const submit = async () => {
    setError(null);
    try {
      await applyLoan.mutateAsync({
        flatId: flatId || undefined,
        loanAmount: loanAmount * LAKH,
        employmentType,
        annualIncome: annualIncome * LAKH,
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not submit your application.'));
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Apply for loan assistance</CardTitle>
          <p className="text-[13px] text-slate-600">
            Flat Town assigns a partner from our network. The platform may receive a referral lead fee from the partner
            — it is never added to your loan amount.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Flat you are buying (optional)" htmlFor="loan-flat">
              <select
                id="loan-flat"
                value={flatId}
                onChange={(event) => setFlatId(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Not decided yet</option>
                {bookingList.map((booking) => (
                  <option key={booking.id} value={booking.flat?.id ?? ''}>
                    {booking.flat?.title ?? 'Flat'} — {formatINR(booking.totalPrice)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Loan amount (₹ lakh)" htmlFor="loan-amount" required>
              <Input
                id="loan-amount"
                type="number"
                min={1}
                inputMode="numeric"
                value={loanAmount}
                onChange={(event) => setLoanAmount(Number(event.target.value))}
              />
            </Field>

            <Field label="Employment" htmlFor="loan-employment">
              <select
                id="loan-employment"
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="salaried">Salaried</option>
                <option value="self_employed">Self-employed</option>
                <option value="business">Business owner</option>
              </select>
            </Field>

            <Field label="Annual income (₹ lakh)" htmlFor="loan-income">
              <Input
                id="loan-income"
                type="number"
                min={1}
                inputMode="numeric"
                value={annualIncome}
                onChange={(event) => setAnnualIncome(Number(event.target.value))}
              />
            </Field>
          </div>

          <p className="text-xs text-slate-500">
            Requesting {formatINR(loanAmount * LAKH)} against an annual income of {formatINR(annualIncome * LAKH)}.
          </p>

          <Button onClick={submit} disabled={applyLoan.isPending}>
            {applyLoan.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Submit application
          </Button>
        </CardContent>
      </Card>

      {/* --------------------------- my applications ---------------------- */}
      <section aria-labelledby="loan-apps" className="space-y-3">
        <h2 id="loan-apps" className="text-base font-bold text-slate-900">
          My applications
        </h2>
        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : !applications || applications.length === 0 ? (
          <EmptyState compact title="No applications yet" body="Submit a request and a partner will be assigned." />
        ) : (
          <ul className="space-y-2">
            {applications.map((application) => (
              <li key={application._id ?? application.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatINR(application.loanAmount)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Applied {formatDate(application.createdAt)}
                        {application.employmentType ? ` · ${application.employmentType}` : ''}
                      </p>
                    </div>
                    <Badge variant="info" className="capitalize">
                      {application.status}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------- partners ---------------------------- */}
      {partners && partners.length > 0 ? (
        <section aria-labelledby="loan-partners" className="space-y-3">
          <h2 id="loan-partners" className="text-base font-bold text-slate-900">
            Loan partners
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {partners.map((partner) => (
              <li key={partner._id ?? partner.id}>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center gap-2">
                      <Building className="size-4 text-emerald-700" aria-hidden="true" />
                      <p className="text-sm font-semibold text-slate-900">{partner.name}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-1.5 text-[12px]">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Percent className="size-3" aria-hidden="true" />
                        <span>
                          {partner.interestRateMin}–{partner.interestRateMax}% p.a.
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-600">
                        <BadgeIndianRupee className="size-3" aria-hidden="true" />
                        <span>Up to {formatINR(partner.maxLoanAmount)}</span>
                      </div>
                    </dl>
                    <p className="text-[11px] text-slate-500">
                      Up to {partner.maxTenureYears} years tenure · average disbursal in {partner.avgDisbursalDays}{' '}
                      days
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardContent className="p-4 text-[13px] leading-relaxed text-slate-600">
          <h2 className="text-sm font-bold text-slate-900">How loan assistance works</h2>
          <ol className="mt-2 space-y-1.5">
            <li>1. Set <code>loanAssistanceRequired</code> on your booking or submit an application here.</li>
            <li>2. An admin assigns a Flat Town loan partner and sets the application status.</li>
            <li>3. Upload your loan approval letter under booking documents — escrow stays held until verification.</li>
            <li>4. The platform may receive a referral lead fee from the partner; it is recorded separately and never added to your loan.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};