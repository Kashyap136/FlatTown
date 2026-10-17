'use client';

import { KeyRound, Loader2, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';

import { RatingStars, VerificationBadge } from '@/components/common/Badges';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { toastSuccess } from '@/components/ui/toast';
import { authApi } from '@/lib/api';
import { formatDate } from '@/lib/price';
import { errorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

export const ProfilePanel = () => {
  const { user, setUser, refreshProfile } = useAuthStore();
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) return null;

  const saveProfile = async (form: FormData) => {
    setSavingProfile(true);
    setProfileError(null);
    try {
      const response = await authApi.updateProfile({
        name: String(form.get('name') ?? user.name),
        phone: String(form.get('phone') ?? user.phone),
        companyName: String(form.get('companyName') ?? '') || undefined,
        bio: String(form.get('bio') ?? '') || undefined,
        location: {
          city: String(form.get('city') ?? '') || undefined,
          locality: String(form.get('locality') ?? '') || undefined,
        },
      });
      setUser(response.data.user);
      toastSuccess('Profile updated');
    } catch (error) {
      setProfileError(errorMessage(error, 'Could not save your profile.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (form: FormData) => {
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    if (newPassword.length < 8) {
      setPasswordError('Your new password must be at least 8 characters.');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setDone(true);
      toastSuccess('Password changed', 'All other sessions have been signed out.');
      await refreshProfile();
    } catch (error) {
      setPasswordError(errorMessage(error, 'Could not change your password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-4 text-emerald-700" aria-hidden="true" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt>
              <dd className="font-medium capitalize text-slate-900">{user.role}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Member since</dt>
              <dd className="font-medium text-slate-900">{formatDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="truncate font-medium text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Verification</dt>
              <dd className="flex items-center gap-2">
                <VerificationBadge status={user.kycStatus} />
                {user.role === 'builder' ? <RatingStars value={user.rating.avg} count={user.rating.count} size="sm" /> : null}
              </dd>
            </div>
          </dl>

          <form action={saveProfile} className="space-y-3 border-t border-slate-100 pt-4">
            {profileError ? <Alert tone="error">{profileError}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="pf-name" required>
                <Input id="pf-name" name="name" defaultValue={user.name} required />
              </Field>
              <Field label="Phone" htmlFor="pf-phone" required>
                <Input id="pf-phone" name="phone" type="tel" inputMode="numeric" maxLength={10} defaultValue={user.phone} required />
              </Field>
              <Field label="Company (optional)" htmlFor="pf-company">
                <Input id="pf-company" name="companyName" defaultValue={user.companyName ?? ''} />
              </Field>
              <Field label="City" htmlFor="pf-city">
                <Input id="pf-city" name="city" defaultValue={user.location.city ?? ''} />
              </Field>
              <Field label="Locality" htmlFor="pf-locality">
                <Input id="pf-locality" name="locality" defaultValue={user.location.locality ?? ''} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="About you" htmlFor="pf-bio">
                  <Input id="pf-bio" name="bio" defaultValue={user.bio ?? ''} />
                </Field>
              </div>
            </div>
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? <Loader2 className="animate-spin" /> : null}
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-emerald-700" aria-hidden="true" />
            Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="space-y-3">
            {passwordError ? <Alert tone="error">{passwordError}</Alert> : null}
            {done ? <Alert tone="success">Password updated. Other sessions have been signed out.</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current password" htmlFor="pf-current" required>
                <Input id="pf-current" name="currentPassword" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="New password" htmlFor="pf-new" required hint="At least 8 characters">
                <Input id="pf-new" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
              </Field>
            </div>
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document status</CardTitle>
        </CardHeader>
        <CardContent>
          {user.kycDocs.length === 0 ? (
            <p className="text-[13px] text-slate-600">
              No documents on file. Buyers upload Aadhaar and PAN against a specific booking; builders upload KYC and
              RERA documents from their dashboard.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {user.kycDocs.map((doc) => (
                <li key={doc.type} className="flex items-center justify-between gap-2 text-sm">
                  <span className="capitalize text-slate-700">{doc.type.replace(/_/g, ' ')}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {formatDate(doc.uploadedAt)}
                    <VerificationBadge status={doc.verified ? 'approved' : 'pending'} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            Document URLs are never returned by the API — only the type and verification status are visible, so a
            leaked token cannot expose your KYC papers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};