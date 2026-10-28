import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ListRow, Placeholder } from '@project-graphite/ui';
import { useAuth } from '../../auth';
import { ActionsMenu } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { FormDialog } from '../../components/FormDialog';
import { LoadError } from '../../components/LoadError';
import { Page } from '../../components/Page';
import { RowsSkeleton, SpaceMarkSkeleton, useRememberedShape } from '../../components/Skeletons';
import { NameAndColorFields, nameAndColorFrom, SpaceMark, spaceNameChecks, spacesTabs, useAllSpaces, type Space } from '../../spaces';
import { useAction } from '../../useAction';
import { useFormErrors } from '../../validation';
import { spaceDescription, useSpaceActions } from './SpaceLayout';

export function NewSpace() {
  const auth = useAuth();
  const navigate = useNavigate();
  const spaces = useAllSpaces();
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
  const spaces = useAllSpaces();
  const actions = useSpaceActions();
  const [rows] = useRememberedShape('spaces', spaces.data && [spaces.data.length], [2]);

  return (
    <Page actions={<NewSpace />} tabs={spacesTabs('spaces')} title="Spaces">
      {spaces.error ? (
        <LoadError error={spaces.error} onRetry={spaces.reload} />
      ) : !spaces.data ? (
        <Placeholder label="Loading your spaces">
          <RowsSkeleton lead={<SpaceMarkSkeleton />} rows={rows} />
        </Placeholder>
      ) : (
        <ul className="panel-rows">
          {spaces.data.map((space) => (
            <ListRow
              href={`/spaces/${space.id}`}
              key={space.id}
              lead={<SpaceMark space={space} />}
              meta={spaceDescription(space)}
              title={space.name}
              trail={<ActionsMenu items={actions.items(space)} name={space.name} />}
            />
          ))}
        </ul>
      )}
      {actions.dialog}
    </Page>
  );
}
