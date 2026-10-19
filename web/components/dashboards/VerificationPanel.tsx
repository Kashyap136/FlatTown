'use client';

import { BadgeCheck, Loader2, Send, ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';

import { RERABadge, RatingStars, VerificationBadge } from '@/components/common/Badges';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toastSuccess } from '@/components/ui/toast';
import { useUploadRera, useProjects } from '@/hooks/useFlats';
import { formatDate } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

/** Builder verification: what the platform has verified, and how to submit RERA. */
export const VerificationPanel = () => {
  const { user, refreshProfile } = useAuthStore();
  const { data: projects } = useProjects({ limit: 30 });
  const uploadRera = useUploadRera();

  const [projectId, setProjectId] = useState('');
  const [reraNumber, setReraNumber] = useState('');
  const [reraState, setReraState] = useState('Maharashtra');
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const isBuilder = user.role === 'builder';
  const kycDone = user.kycStatus === 'approved';
  const reraDone = user.isRERAVerified;
  const steps = [
    { label: 'Account created', done: true },
    { label: 'KYC submitted', done: user.kycDocs.length > 0 },
    { label: 'KYC approved by admin', done: kycDone },
    { label: 'RERA number submitted', done: Boolean(user.reraNumber) },
    { label: 'RERA verified by admin', done: reraDone },
    { label: 'Project approved', done: (projects ?? []).some((p) => p.isApproved) },
  ];
  const completedSteps = steps.filter((s) => s.done).length;
  const progress = Math.round((completedSteps / steps.length) * 100);

  const submitRera = async () => {
    if (!projectId) {
      setError('Choose the project this RERA registration covers.');
      return;
    }
    setError(null);
    try {
      await uploadRera.mutateAsync({ id: projectId, reraNumber: reraNumber || undefined, reraState });
      toastSuccess('RERA details submitted', 'An admin will verify your registration.');
      await refreshProfile();
    } catch (err) {
      setError(errorMessage(err, 'Could not submit the RERA details.'));
    }
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------ progress --------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Verification progress</CardTitle>
          <p className="text-[13px] text-slate-600">
            Verified builders rank above unverified ones in search and get two free site visits.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} aria-label={`Verification ${progress}% complete`} />
          <p className="text-sm font-semibold text-slate-900">{progress}% complete</p>
          <ol className="space-y-1.5">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-2 text-[13px]">
                <span
                  aria-hidden="true"
                  className={`grid size-4 place-items-center rounded-full border text-[9px] ${
                    step.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className={step.done ? 'text-slate-800' : 'text-slate-500'}>{step.label}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ------------------------------- status ---------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
            Current status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt>
              <dd className="font-medium capitalize text-slate-900">{user.role}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Company</dt>
              <dd className="truncate font-medium text-slate-900">{user.companyName ?? user.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">KYC</dt>
              <dd>
                <VerificationBadge status={user.kycStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">RERA</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <RERABadge verified={user.isRERAVerified} reraNumber={user.reraNumber} />
                {user.reraVerifiedAt ? (
                  <span className="text-[11px] text-slate-500">on {formatDate(user.reraVerifiedAt)}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Rating</dt>
              <dd>
                <RatingStars value={user.rating.avg} count={user.rating.count} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Default rating rule</dt>
              <dd className="text-slate-600">New builders start at 3.5 / 5</dd>
            </div>
          </dl>

          {user.kycDocs.length > 0 ? (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</p>
              <ul className="mt-1.5 space-y-1">
                {user.kycDocs.map((doc) => (
                  <li key={doc.type} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="capitalize text-slate-700">{doc.type.replace(/_/g, ' ')}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {formatDate(doc.uploadedAt)}
                      <Badge variant={doc.verified ? 'success' : 'warning'}>
                        {doc.verified ? 'Verified' : 'Pending'}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ----------------------------- RERA upload ------------------------- */}
      {isBuilder ? (
        <Card>
          <CardHeader>
            <CardTitle>Submit or update RERA registration</CardTitle>
            <p className="text-[13px] text-slate-600">
              Submitting a number does <strong>not</strong> verify it. Only a Flat Town admin can set the verified
              flag, and verified projects get priority ranking in discovery.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <Alert tone="error">{error}</Alert> : null}

            <Field label="Project" htmlFor="vp-project" required>
              <select
                id="vp-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Select a project</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName} {project.isRERAVerified ? '(verified)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="RERA registration number" htmlFor="vp-rera" hint="As printed on your state RERA certificate">
                <Input
                  id="vp-rera"
                  value={reraNumber || user.reraNumber || ''}
                  onChange={(event) => setReraNumber(event.target.value)}
                  placeholder="P52100012345"
                />
              </Field>
              <Field label="State" htmlFor="vp-state">
                <select
                  id="vp-state"
                  value={reraState}
                  onChange={(event) => setReraState(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {['Maharashtra', 'Karnataka', 'Telangana', 'Tamil Nadu', 'Gujarat', 'Delhi', 'Uttar Pradesh'].map(
                    (state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            </div>

            <Button onClick={submitRera} disabled={uploadRera.isPending}>
              {uploadRera.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Submit for admin verification
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert tone="info" title="Agent accounts">
          Agents list inventory on behalf of verified builders. The builder&rsquo;s KYC and RERA status determine
          whether the project can be published and how it ranks in search.
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-2 p-4 text-[13px] leading-relaxed text-slate-600">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <BadgeCheck className="size-4 text-emerald-700" aria-hidden="true" />
            Why we never allow self-verification
          </h2>
          <p>
            A RERA badge is a promise to buyers. If builders could set it themselves the badge would be worthless, so
            the only route to a verified state is{' '}
            <code className="rounded bg-slate-100 px-1 text-slate-700">PUT /admin/verify-rera/:builderId</code>, which is protected by
            the admin role middleware and written to the audit log.
          </p>
          <p className="flex items-center gap-1.5">
            <Upload className="size-3.5" aria-hidden="true" />
            Project images, brochures and floor plans are stored in Cloudinary; only the URLs live in MongoDB.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};