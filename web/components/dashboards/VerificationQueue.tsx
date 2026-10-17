'use client';

import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';

import { RERABadge } from '@/components/common/Badges';
import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminActions, useVerificationQueue } from '@/hooks/useFlats';
import { formatDate } from '@/lib/price';

interface QueueBuilder {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyName?: string;
  reraNumber?: string;
  reraState?: string;
  kycStatus?: string;
  isAdminVerified?: boolean;
  isRERAVerified?: boolean;
  submittedAt?: string;
  kycDocs?: Array<{ type: string; uploadedAt: string }>;
}

interface QueueProject {
  id: string;
  projectName: string;
  city: string;
  locality: string;
  status: string;
  reraNumber?: string;
  isRERAVerified: boolean;
  builderName?: string;
  submittedAt: string;
}

/** The admin verification queue: KYC, RERA and project approval. */
export const VerificationQueue = () => {
  const [tab, setTab] = useState<'kyc' | 'rera' | 'project'>('kyc');
  const { data, isLoading } = useVerificationQueue('all');
  const { verifyKyc, verifyRera, approveProject } = useAdminActions();

  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  const kycQueue = (data?.kyc ?? []) as QueueBuilder[];
  const reraQueue = (data?.rera ?? []) as QueueBuilder[];
  const projectQueue = (data?.projects ?? []) as QueueProject[];

  const act = async (key: string, run: () => Promise<unknown>) => {
    setPending(key);
    try {
      await run();
    } finally {
      setPending(null);
    }
  };

  if (isLoading) return <ListSkeleton rows={4} />;

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <TabsList>
        <TabsTrigger value="kyc">Builder KYC ({kycQueue.length})</TabsTrigger>
        <TabsTrigger value="rera">RERA review ({reraQueue.length})</TabsTrigger>
        <TabsTrigger value="project">Project approval ({projectQueue.length})</TabsTrigger>
      </TabsList>

      {/* ------------------------------- KYC ------------------------------ */}
      <TabsContent value="kyc">
        {kycQueue.length === 0 ? (
          <EmptyState preset="none" title="No KYC pending" body="Every builder has been reviewed." />
        ) : (
          <ul className="space-y-3">
            {kycQueue.map((builder) => (
              <li key={builder.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-900">
                          {builder.companyName ?? builder.name}
                        </h3>
                        <p className="truncate text-xs text-slate-500">
                          {builder.name} · {builder.email} · {builder.phone}
                        </p>
                      </div>
                      <Badge variant="warning">
                        {builder.kycStatus ?? 'pending'} · submitted {formatDate(builder.submittedAt)}
                      </Badge>
                    </div>

                    {builder.kycDocs?.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {builder.kycDocs.map((doc) => (
                          <li key={doc.type}>
                            <Badge variant="neutral" className="capitalize">
                              {doc.type.replace(/_/g, ' ')}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <Field label="Rejection reason (only if rejecting)" htmlFor={`kyc-reason-${builder.id}`}>
                      <Input
                        id={`kyc-reason-${builder.id}`}
                        value={reasons[builder.id] ?? ''}
                        onChange={(event) => setReasons((current) => ({ ...current, [builder.id]: event.target.value }))}
                        placeholder="Blurred PAN upload"
                      />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={pending === builder.id}
                        onClick={() => void act(builder.id, () => verifyKyc.mutateAsync({ builderId: builder.id, approved: true }))}
                      >
                        {pending === builder.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Approve KYC
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending === builder.id}
                        onClick={() =>
                          void act(builder.id, () =>
                            verifyKyc.mutateAsync({
                              builderId: builder.id,
                              approved: false,
                              reason: reasons[builder.id] || undefined,
                            }),
                          )
                        }
                      >
                        <XCircle />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      {/* ------------------------------ RERA ------------------------------ */}
      <TabsContent value="rera">
        {reraQueue.length === 0 ? (
          <EmptyState preset="none" title="No RERA reviews pending" body="Every submitted registration has been decided." />
        ) : (
          <ul className="space-y-3">
            {reraQueue.map((builder) => (
              <li key={builder.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-900">
                          {builder.companyName ?? builder.name}
                        </h3>
                        <p className="truncate text-xs text-slate-500">
                          {builder.name} · {builder.email}
                        </p>
                      </div>
                      <RERABadge verified={builder.isRERAVerified} reraNumber={builder.reraNumber} />
                    </div>

                    <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">RERA number</dt>
                        <dd className="font-mono font-medium text-slate-900">{builder.reraNumber ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">State</dt>
                        <dd className="font-medium text-slate-900">{builder.reraState ?? '—'}</dd>
                      </div>
                    </dl>

                    <Alert tone="info">
                      Verify this number against the state RERA registry before approving. Approval also flips the RERA
                      flag on every project this builder owns, which lifts them above unverified listings in search.
                    </Alert>

                    <Field label="Rejection reason (only if rejecting)" htmlFor={`rera-reason-${builder.id}`}>
                      <Input
                        id={`rera-reason-${builder.id}`}
                        value={reasons[builder.id] ?? ''}
                        onChange={(event) => setReasons((current) => ({ ...current, [builder.id]: event.target.value }))}
                        placeholder="Registration not found in the state registry"
                      />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={pending === builder.id}
                        onClick={() =>
                          void act(builder.id, () => verifyRera.mutateAsync({ builderId: builder.id, approved: true }))
                        }
                      >
                        {pending === builder.id ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                        Verify RERA
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending === builder.id}
                        onClick={() =>
                          void act(builder.id, () =>
                            verifyRera.mutateAsync({
                              builderId: builder.id,
                              approved: false,
                              reason: reasons[builder.id] || undefined,
                            }),
                          )
                        }
                      >
                        <XCircle />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      {/* ---------------------------- projects ---------------------------- */}
      <TabsContent value="project">
        {projectQueue.length === 0 ? (
          <EmptyState preset="none" title="No projects pending" body="New builder projects appear here for approval." />
        ) : (
          <ul className="space-y-3">
            {projectQueue.map((project) => (
              <li key={project.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{project.projectName}</h3>
                        <p className="truncate text-xs text-slate-500">
                          {project.builderName} · {project.locality}, {project.city}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant="warning" className="capitalize">
                          {project.status.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-[11px] text-slate-500">Submitted {formatDate(project.submittedAt)}</span>
                      </div>
                    </div>

                    <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">RERA number</dt>
                        <dd className="font-mono font-medium text-slate-900">{project.reraNumber ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">RERA status</dt>
                        <dd>
                          <RERABadge verified={project.isRERAVerified} reraNumber={project.reraNumber} />
                        </dd>
                      </div>
                    </dl>

                    <Field label="Rejection reason (only if rejecting)" htmlFor={`proj-reason-${project.id}`}>
                      <Textarea
                        id={`proj-reason-${project.id}`}
                        rows={2}
                        value={reasons[project.id] ?? ''}
                        onChange={(event) => setReasons((current) => ({ ...current, [project.id]: event.target.value }))}
                        placeholder="RERA number does not match the registry"
                      />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={pending === project.id}
                        onClick={() => void act(project.id, () => approveProject.mutateAsync({ id: project.id, approved: true }))}
                      >
                        {pending === project.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Approve project
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending === project.id}
                        onClick={() =>
                          void act(project.id, () =>
                            approveProject.mutateAsync({
                              id: project.id,
                              approved: false,
                              reason: reasons[project.id] || undefined,
                            }),
                          )
                        }
                      >
                        <XCircle />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
};