'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Logo } from '@/components/layout/SiteHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { authApi } from '@/lib/api';
import { getRefreshToken } from '@/lib/auth';
import { errorMessage, fieldErrors } from '@/lib/utils';
import { homeRouteFor, useAuthStore } from '@/store/useAuthStore';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  // Honour `?next=` so a protected page returns the user where they were.
  useEffect(() => {
    const refresh = getRefreshToken();
    if (refresh && !searchParams.get('next')) {
      // A session already exists — nothing to do, the header will reflect it.
    }
  }, [searchParams]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const response = await authApi.login(values);
      setSession(response.data);
      const next = searchParams.get('next');
      router.push(next ?? homeRouteFor(response.data.user.role));
    } catch (error) {
      const fields = fieldErrors(error);
      Object.entries(fields).forEach(([field, message]) => {
        if (field === 'email' || field === 'password') {
          setError(field, { message });
        }
      });
      setServerError(errorMessage(error, 'Could not sign you in.'));
    }
  });

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <Logo />
          <h1 className="mt-4 text-xl font-black text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sign in to book visits, reserve flats and track your escrow.
          </p>
        </div>

        {serverError ? (
          <Alert tone="error" title="Sign in failed">
            {serverError}
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="ft-login-email" error={errors.email?.message} required>
            <Input
              id="ft-login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </Field>

          <Field label="Password" htmlFor="ft-login-password" error={errors.password?.message} required>
            <Input
              id="ft-login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </Field>

          <Button type="submit" block size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <p className="text-center text-sm text-slate-600">
          New to Flat Town?{' '}
          <Link href="/auth/register" className="font-semibold text-emerald-700 hover:underline">
            Create an account
          </Link>
        </p>

        <Alert tone="info">
          <p className="flex items-start gap-1.5">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Demo accounts (development only): <code>buyer@flattown.dev</code>,{' '}
              <code>builder@flattown.dev</code>, <code>agent@flattown.dev</code>, <code>admin@flattown.dev</code> — password{' '}
              <code>FlatTown@123</code>. See the README.
            </span>
          </p>
        </Alert>
      </CardContent>
    </Card>
  );
};