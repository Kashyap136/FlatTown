'use client';

import { Loader2, Plus, Power, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/States';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useAdminAmenities } from '@/hooks/useFlats';
import { amenitiesApi } from '@/lib/api';
import { toastSuccess } from '@/components/ui/toast';
import { errorMessage } from '@/lib/utils';
import type { Amenity, AmenityCategory } from '@/lib/types';

const CATEGORIES: AmenityCategory[] = ['lifestyle', 'parking', 'security', 'wellness', 'utility'];

/** Amenity master CRUD. */
export const AmenityManager = () => {
  const { data, isLoading } = useAdminAmenities();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Sparkles');
  const [category, setCategory] = useState<AmenityCategory>('lifestyle');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<Record<string, { name: string; icon: string; category: AmenityCategory; description: string }>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = data ?? [];

  const create = async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Give the amenity a name.');
      return;
    }
    setPending('create');
    try {
      await amenitiesApi.create({ name, icon, category, description: description || undefined });
      setName('');
      setDescription('');
      toastSuccess('Amenity added');
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, 'Could not add the amenity.'));
    } finally {
      setPending(null);
    }
  };

  const save = async (amenity: Amenity) => {
    const draft = editing[amenity.id];
    if (!draft) return;
    setPending(amenity.id);
    setError(null);
    try {
      await amenitiesApi.update(amenity.id, draft);
      toastSuccess('Amenity updated');
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, 'Could not update the amenity.'));
    } finally {
      setPending(null);
    }
  };

  const toggle = async (amenity: Amenity) => {
    setPending(amenity.id);
    setError(null);
    try {
      await amenitiesApi.update(amenity.id, { isActive: !amenity.isActive });
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, 'Could not update the amenity.'));
    } finally {
      setPending(null);
    }
  };

  const remove = async (amenity: Amenity) => {
    setPending(amenity.id);
    setError(null);
    try {
      await amenitiesApi.remove(amenity.id);
      toastSuccess('Amenity removed');
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the amenity.'));
    } finally {
      setPending(null);
    }
  };

  const draftFor = (amenity: Amenity) =>
    editing[amenity.id] ?? {
      name: amenity.name,
      icon: amenity.icon ?? 'Sparkles',
      category: (amenity.category ?? 'lifestyle') as AmenityCategory,
      description: amenity.description ?? '',
    };

  if (isLoading) return <ListSkeleton rows={4} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        {list.length === 0 ? (
          <EmptyState preset="none" title="No amenities yet" body="Add the amenity catalogue buyers filter on." />
        ) : (
          <ul className="space-y-2">
            {list.map((amenity) => {
              const draft = draftFor(amenity);
              const dirty = Boolean(editing[amenity.id]);
              return (
                <li key={amenity.id}>
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={amenity.isActive === false ? 'neutral' : 'success'} className="capitalize">
                            {amenity.category}
                          </Badge>
                          {amenity.isActive === false ? <Badge variant="warning">Inactive</Badge> : null}
                        </div>
                        <span className="text-[11px] text-slate-500">used by {amenity.usageCount ?? 0} listings</span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="Name" htmlFor={`am-name-${amenity.id}`}>
                          <Input
                            id={`am-name-${amenity.id}`}
                            value={draft.name}
                            onChange={(event) =>
                              setEditing((current) => ({ ...current, [amenity.id]: { ...draft, name: event.target.value } }))
                            }
                          />
                        </Field>
                        <Field label="Icon" htmlFor={`am-icon-${amenity.id}`}>
                          <Input
                            id={`am-icon-${amenity.id}`}
                            value={draft.icon}
                            onChange={(event) =>
                              setEditing((current) => ({ ...current, [amenity.id]: { ...draft, icon: event.target.value } }))
                            }
                          />
                        </Field>
                        <Field label="Category" htmlFor={`am-cat-${amenity.id}`}>
                          <select
                            id={`am-cat-${amenity.id}`}
                            value={draft.category}
                            onChange={(event) =>
                              setEditing((current) => ({
                                ...current,
                                [amenity.id]: { ...draft, category: event.target.value as AmenityCategory },
                              }))
                            }
                            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                          >
                            {CATEGORIES.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Description" htmlFor={`am-desc-${amenity.id}`}>
                          <Input
                            id={`am-desc-${amenity.id}`}
                            value={draft.description}
                            onChange={(event) =>
                              setEditing((current) => ({
                                ...current,
                                [amenity.id]: { ...draft, description: event.target.value },
                              }))
                            }
                          />
                        </Field>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!dirty || pending === amenity.id} onClick={() => void save(amenity)}>
                          {pending === amenity.id ? <Loader2 className="animate-spin" /> : <Save />}
                          Save
                        </Button>
                        <Button size="sm" variant="outline" disabled={pending === amenity.id} onClick={() => void toggle(amenity)}>
                          <Power />
                          {amenity.isActive === false ? 'Activate' : 'Deactivate'}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending === amenity.id} onClick={() => void remove(amenity)}>
                          <Trash2 />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4 text-emerald-700" aria-hidden="true" />
              Add an amenity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name" htmlFor="new-am-name" required>
              <Input id="new-am-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="EV Charging" />
            </Field>
            <Field label="Icon key" htmlFor="new-am-icon" hint="A lucide-react icon name.">
              <Input id="new-am-icon" value={icon} onChange={(event) => setIcon(event.target.value)} />
            </Field>
            <Field label="Category" htmlFor="new-am-cat">
              <select
                id="new-am-cat"
                value={category}
                onChange={(event) => setCategory(event.target.value as AmenityCategory)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="new-am-desc">
              <Textarea id="new-am-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Button block onClick={create} disabled={pending === 'create'}>
              {pending === 'create' ? <Loader2 className="animate-spin" /> : <Plus />}
              Add amenity
            </Button>
            <p className="text-[11px] text-slate-500">
              Deactivating hides an amenity from new listings without removing it from existing flats.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
};