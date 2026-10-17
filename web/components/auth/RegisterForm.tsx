'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, ShoppingBag, Store, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Logo } from '@/components/layout/SiteHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authApi } from '@/lib/api';
import { errorMessage, fieldErrors } from '@/lib/utils';
import { homeRouteFor, useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';

/**
 * Registration schema.
 *
 * NOTE: `role` can only ever be buyer / builder / agent — the API refuses
 * `admin` (RULE 5) and the UI does not offer it.
 */
const schema = z.object({
  role: z.enum(['buyer', 'builder', 'agent']),
  name: z.string().trim().min(2, 'Please enter your full name').max(80),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
  confirmPassword: z.string(),
  companyName: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(500).optional(),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
  .refine((values) => values.role !== 'builder' || (values.companyName && values.companyName.length >= 2), {
    message: 'Company name is required for builder accounts',
    path: ['companyName'],
  });

type FormValues = z.infer<typeof schema>;

const ROLE_OPTIONS = [
  { value: 'buyer', label: 'Buyer', icon: ShoppingBag, blurb: 'Browse, visit and book new flats' },
  { value: 'builder', label: 'Builder', icon: Building2, blurb: 'List projects and flats for sale' },
  { value: 'agent', label: 'Agent', icon: Store, blurb: 'List on behalf of builders, earn 30%' },
] as const;

export const RegisterForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      role: 'buyer',
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      companyName: '',
      bio: '',
    },
  });

  const role = watch('role');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await authApi.register({
        role: values.role,
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
        companyName: values.role === 'builder' ? values.companyName : undefined,
      });
      setSession(response.data);
      const next = searchParams.get('next');
      router.push(next ?? homeRouteFor(response.data.user.role));
    } catch (error) {
      const fields = fieldErrors(error);
      Object.entries(fields).forEach(([field, message]) => {
        setError(field as keyof FormValues, { message });
      });
      setServerError(errorMessage(error, 'Could not create your account.'));
    }
  });

  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <Logo />
          <h1 className="mt-4 text-xl font-black text-slate-900">Create your Flat Town account</h1>
          <p className="mt-1 text-sm text-slate-600">
            One account for buyers, builders and agents. Admin accounts are provisioned by the platform and cannot be
            self-registered.
          </p>
        </div>

        {serverError ? (
          <Alert tone="error" title="Registration failed">
            {serverError}
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">I am signing up as</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLE_OPTIONS.map((option) => {
                const active = role === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setValue('role', option.value, { shouldValidate: true })}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      active
                        ? 'border-emerald-700 bg-emerald-50'
                        : 'border-slate-300 bg-white hover:bg-slate-50',
                    )}
                  >
                    <Icon className={cn('size-4', active ? 'text-emerald-700' : 'text-slate-500')} aria-hidden="true" />
                    <span className="mt-1.5 block text-sm font-semibold text-slate-900">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{option.blurb}</span>
                  </button>
                );
              })}
            </div>
            {errors.role ? (
              <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
                {errors.role.message}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="ft-reg-name" error={errors.name?.message} required>
              <Input
                id="ft-reg-name"
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
              />
            </Field>

            <Field label="Mobile number" htmlFor="ft-reg-phone" error={errors.phone?.message} required hint="10 digits, no country code">
              <Input
                id="ft-reg-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                aria-invalid={Boolean(errors.phone)}
                {...register('phone')}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Email" htmlFor="ft-reg-email" error={errors.email?.message} required>
                <Input
                  id="ft-reg-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email')}
                />
              </Field>
            </div>

            <Field
              label={role === 'builder' ? 'Company name' : 'Company (optional)'}
              htmlFor="ft-reg-company"
              error={errors.companyName?.message}
              required={role === 'builder'}
            >
              <Input id="ft-reg-company" aria-invalid={Boolean(errors.companyName)} {...register('companyName')} />
            </Field>

            {role === 'agent' ? (
              <div className="sm:col-span-2">
                <Field
                  label="About you (optional)"
                  htmlFor="ft-reg-bio"
                  hint="Shown to builders when you list on their behalf."
                >
                  <Textarea id="ft-reg-bio" rows={3} {...register('bio')} />
                </Field>
              </div>
            ) : null}

            <Field
              label="Password"
              htmlFor="ft-reg-password"
              error={errors.password?.message}
              required
              hint="At least 8 characters with an uppercase letter and a number"
            >
              <Input
                id="ft-reg-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </Field>

            <Field label="Confirm password" htmlFor="ft-reg-confirm" error={errors.confirmPassword?.message} required>
              <Input
                id="ft-reg-confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
            </Field>
          </div>

          <Alert tone="info">
            Builder accounts start at a 3.5 rating and must submit KYC and RERA documents. An admin verifies them before
            projects can be published — builders can never self-verify.
          </Alert>

          <Button type="submit" block size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {isSubmitting ? 'Creating your account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-emerald-700 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};

/** Role-based tabs wrapper kept for future multi-step signup. */
export const RegisterTabs = () => (
  <Tabs defaultValue="account">
    <TabsList className="w-full">
      <TabsTrigger value="account">Account</TabsTrigger>
      <TabsTrigger value="verification">Verification (later)</TabsTrigger>
    </TabsList>
    <TabsContent value="account">
      <RegisterForm />
    </TabsContent>
    <TabsContent value="verification">
      <p className="text-sm text-slate-600">
        Builders upload KYC and RERA documents from their dashboard after signing up; an admin reviews them from the
        verification queue.
      </p>
    </TabsContent>
  </Tabs>
);