# Organization workspaces

Platform administrators create organizations from Organizations. Owners and
appointed workspace managers maintain the welcome message, HTTPS logo, accent
colour, departments, reporting lines and registered members. Members can belong
to multiple workspaces and switch through the organization list. Branding is
currently applied to the workspace page, while the shared Plusticity shell stays
consistent.

Management authority is separate from profile/job descriptions and platform
administrator roles. A workspace manager can manage their organization without
becoming a platform administrator. An ordinary learner sees the organization's
branding and department structure plus their own directory record; managers see
their own organization's directory, including registered emails. Other tenants
and anonymous callers cannot read it. No invitation email is sent; an account
must already be registered before a manager adds it.

Department parents and reporting managers must belong to the same organization.
Both hierarchies reject cycles and are capped at 32 levels, including when
moving a subtree. Changes use optimistic versions and audit events. The owner
cannot be removed. Managers cannot remove themselves; only the owner can edit
their own owner directory record. Removing a manager clears subordinate
reporting references and ends workspace access without deleting learning or
purchase records.

This milestone isolates organization directory/branding data. Migration 0065
adds opt-in private organization courses, bound cohort/program assignments and
enforcement across database, server, SCORM and export paths. See
docs/ORGANIZATION_LEARNING_BOUNDARIES.md. Author ownership is preserved. Dedicated
tenant-manager cohort controls and tenant-wide learning dashboards, custom
domains and a fully branded shared shell remain to be implemented.

Migration 0064 is applied. Rollback-only role checks passed for tenant reads,
learner self-only directory access, manager scoping, no self-promotion, protected
ownership, hierarchy cycles, cross-tenant departments/managers, removal and
separation from platform privileges. The application suite passes 255 tests with
17 environment-gated skips. TypeScript and production build pass. Browser and
independent concurrency/load checks remain pending.
