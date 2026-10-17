'use client';

import { CheckCircle2, FileText, Loader2, Send, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { toastSuccess } from '@/components/ui/toast';
import { useCreateInquiry } from '@/hooks/useFlats';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

/** "I'm interested" form — step one of the funnel. */
export const InquiryForm = ({
  flatId,
  onSubmitted,
  className,
}: {
  flatId: string;
  onSubmitted?: (inquiryId?: string) => void;
  className?: string;
}) => {
  const user = useAuthStore((s) => s.user);
  const createInquiry = useCreateInquiry(flatId);
  const [message, setMessage] = useState('');
  const [loanNeeded, setLoanNeeded] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [done, setDone] = useState(false);

  if (!user) {
    return (
      <Card className={className}>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-bold text-slate-900">Interested in this flat?</h2>
          <p className="text-[13px] leading-relaxed text-slate-600">
            Sign in to send an inquiry to the builder and book a site visit.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <a href={`/auth/login?next=/flat/${flatId}`}>Sign in</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="/auth/register">Create account</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className={className}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            <h2 className="text-sm font-bold">Inquiry sent</h2>
          </div>
          <p className="text-[13px] leading-relaxed text-slate-600">
            The builder has been notified. You can now book a site visit to see the flat in person.
          </p>
          <Button size="sm" variant="outline" onClick={() => setDone(false)}>
            Send another message
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-slate-900">Interested in this flat?</h2>
        <p className="text-[13px] leading-relaxed text-slate-600">
          Send an inquiry to the builder. It costs nothing and does not commit you to anything.
        </p>

        <Field label="Message (optional)" htmlFor="ft-inquiry-message">
          <Textarea
            id="ft-inquiry-message"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Please call me after 6pm"
          />
        </Field>

        <label className="flex items-start gap-2.5 text-[13px] text-slate-700">
          <input
            type="checkbox"
            checked={loanNeeded}
            onChange={(event) => setLoanNeeded(event.target.checked)}
            className="mt-0.5 size-4 rounded border-slate-400 text-emerald-700 focus:ring-emerald-600"
          />
          <span>
            I need loan assistance
            <span className="block text-[11px] text-slate-500">A Flat Town partner will contact you.</span>
          </span>
        </label>

        <Field label="Preferred visit date (optional)" htmlFor="ft-visit-date">
          <Input
            id="ft-visit-date"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={visitDate}
            onChange={(event) => setVisitDate(event.target.value)}
            className="w-full sm:w-48"
          />
        </Field>

        {createInquiry.isError ? (
          <Alert tone="error">{createInquiry.error?.message}</Alert>
        ) : null}

        <Button
          block
          onClick={async () => {
            try {
              const response = await createInquiry.mutateAsync({
                message: message || undefined,
                visitDate: visitDate ? new Date(visitDate).toISOString() : undefined,
                loanAssistanceRequired: loanNeeded,
              });
              setDone(true);
              onSubmitted?.(response.data.inquiry._id ?? response.data.inquiry.id);
            } catch {
              // The mutation surfaces the message through `isError`.
            }
          }}
          disabled={createInquiry.isPending}
        >
          {createInquiry.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          {createInquiry.isPending ? 'Sending…' : 'Send inquiry'}
        </Button>
      </CardContent>
    </Card>
  );
};

/**
 * Booking document uploader (Aadhaar / PAN / loan approval).
 *
 * Files are validated client-side for type and size, but the server
 * re-validates and stores them in Cloudinary — the client check is only to
 * avoid a wasted upload.
 */
export const DocumentUpload = ({
  onUpload,
  disabled,
  types = [
    { type: 'aadhaar', label: 'Aadhaar card' },
    { type: 'pan', label: 'PAN card' },
  ],
  className,
}: {
  onUpload: (files: File[], types: string[]) => Promise<void>;
  disabled?: boolean;
  types?: Array<{ type: string; label: string; hint?: string }>;
  className?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Array<{ type: string; file: File }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 5 * 1024 * 1024;

  const onPick = (type: string, file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Only PDF, JPG, PNG or WEBP files are accepted.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Each document must be 5 MB or smaller.');
      return;
    }
    setSelected((current) => [...current.filter((d) => d.type !== type), { type, file }]);
  };

  const submit = async () => {
    if (selected.length === 0) {
      setError('Choose at least one document.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUpload(
        selected.map((d) => d.file),
        selected.map((d) => d.type),
      );
      setSelected([]);
      toastSuccess('Documents uploaded', 'The builder will verify them next.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {types.map((option) => {
        const chosen = selected.find((d) => d.type === option.type);
        const id = `ft-doc-${option.type}`;
        return (
          <div
            key={option.type}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center',
              chosen ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-300 bg-white',
            )}
          >
            <FileText className="hidden size-4 shrink-0 text-slate-500 sm:block" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
                {option.label}
              </label>
              <p className="truncate text-[11px] text-slate-500">
                {chosen ? chosen.file.name : (option.hint ?? 'PDF or image, up to 5 MB')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {chosen ? (
                <Badge variant="success" size="sm">
                  Ready
                </Badge>
              ) : null}
              <input
                id={id}
                ref={inputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={disabled || busy}
                onChange={(event) => onPick(option.type, event.target.files?.[0])}
              />
              <Button
                size="sm"
                variant={chosen ? 'ghost' : 'outline'}
                disabled={disabled || busy}
                onClick={() => document.getElementById(id)?.click()}
              >
                {chosen ? <X /> : <Upload />}
                {chosen ? 'Change' : 'Choose file'}
              </Button>
            </div>
          </div>
        );
      })}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button block onClick={submit} disabled={disabled || busy || selected.length === 0}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {busy ? 'Uploading…' : `Upload ${selected.length || ''} document${selected.length === 1 ? '' : 's'}`}
      </Button>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Documents are private. They are stored in Cloudinary and are never returned by the API — only their type and
        verification status are visible to you, the builder and the admin reviewing your escrow release.
      </p>
    </div>
  );
};