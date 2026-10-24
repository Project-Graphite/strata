import { PageRole, SpaceRole } from '@prisma/client';

export function pagePermissions(spaceRole: SpaceRole | null, pageRole: PageRole | null) {
  const edit = spaceRole === SpaceRole.OWNER || spaceRole === SpaceRole.EDITOR || pageRole === PageRole.EDIT || pageRole === PageRole.MANAGE;
  return {
    comment: Boolean(spaceRole || (pageRole && pageRole !== PageRole.VIEW)),
    edit,
    share: spaceRole === SpaceRole.OWNER || spaceRole === SpaceRole.EDITOR || pageRole === PageRole.MANAGE,
    organize: spaceRole === SpaceRole.OWNER || spaceRole === SpaceRole.EDITOR,
    history: Boolean(spaceRole) || edit,
    spaceRole: spaceRole?.toLowerCase() ?? null,
    pageRole: pageRole?.toLowerCase() ?? null,
  };
}
