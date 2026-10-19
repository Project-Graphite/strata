import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ListSkeleton } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Page } from '../../components/Page';
import { RowText } from '../../components/RowText';
import { NameAndColorFields, nameAndColorFrom, SpaceMark, spaceNameChecks, spacesTabs, useSpaces, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useFormErrors } from '../../validation';
import { spaceDescription, useSpaceActions } from './SpaceLayout';

export function NewSpace() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const creating = useAction();
  const form = useFormErrors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button icon="plus" label="New space" large onClick={() => setOpen(true)} primary />
      {open && (
        <FormDialog
          busy={creating.busy}
          busyLabel="Adding…"
          onClose={() => setOpen(false)}
          onSubmit={(target) => {
            if (!form.check(target, { name: spaceNameChecks })) return;
            void creating.run(async () => {
              const created = await auth.request<Space>('/spaces', { method: 'POST', body: JSON.stringify(nameAndColorFrom(target)) });
              spaces.mutate((current) => [...current, created]);
              navigate(`/spaces/${created.id}`);
              return `Added ${created.name}.`;
            }, 'Could not add the space');
          }}
          submitLabel="Add space"
          title="New space"
        >
          <NameAndColorFields field={form.field('name')} maxLength={60} />
        </FormDialog>
      )}
    </>
  );
}

export function SpacesPage() {
  const spaces = useSpaces();
  const actions = useSpaceActions();

  return (
    <Page actions={<NewSpace />} tabs={spacesTabs('spaces')} title="Spaces">
      {spaces.error ? (
        <LoadError error={spaces.error} onRetry={spaces.reload} />
      ) : !spaces.data ? (
        <ListSkeleton label="Loading your spaces" rows={3} />
      ) : (
        <ul className="panel-rows">
          {spaces.data.map((space) => (
            <li className="flex items-center pe-2 hover:bg-line-soft" key={space.id}>
              <Link className="flex min-w-0 flex-1 items-center gap-3 panel-row text-ink no-underline" to={`/spaces/${space.id}`}>
                <SpaceMark space={space} />
                <RowText detail={spaceDescription(space)} title={space.name} />
              </Link>
              <ActionsMenu items={actions.items(space)} name={space.name} />
            </li>
          ))}
        </ul>
      )}
      {actions.dialog}
    </Page>
  );
}
