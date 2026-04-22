const ownerScopeSelect = {
  companyId: true,
  departmentId: true,
  teamId: true,
  ownerUserId: true,
  team: { select: { departmentId: true } },
} as const;

const contextWithOwnerInclude = {
  process: { include: { owner: { select: ownerScopeSelect } } },
  project: { include: { owner: { select: ownerScopeSelect } } },
  subcontext: {
    include: {
      project: {
        include: {
          owner: { select: ownerScopeSelect },
        },
      },
    },
  },
} as const;

type ContextOwnerRow = {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
  team: { departmentId: string } | null;
};

type ContextWithOwnerRow = {
  process: { owner: ContextOwnerRow } | null;
  project: { owner: ContextOwnerRow } | null;
  subcontext: { project: { owner: ContextOwnerRow } } | null;
};

function ownerFromContextRow(ctx: ContextWithOwnerRow): ContextOwnerRow | null {
  return ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
}

function ownerScopeFromOwnerRow(owner: ContextOwnerRow | null): {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
} {
  if (!owner) {
    return { companyId: null, departmentId: null, teamId: null, ownerUserId: null };
  }
  return {
    companyId: owner.companyId,
    departmentId: owner.departmentId ?? owner.team?.departmentId ?? null,
    teamId: owner.teamId,
    ownerUserId: owner.ownerUserId,
  };
}

export {
  ownerScopeSelect,
  contextWithOwnerInclude,
  ownerFromContextRow,
  ownerScopeFromOwnerRow,
  type ContextOwnerRow,
  type ContextWithOwnerRow,
};
