import { Elysia, t } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { getControlDb, eq, and } from '@uaip/shared-services';
import { organizations, orgMembers, users } from '@uaip/shared-services/drizzle/control';
import { withAdminGuard } from '@uaip/middleware';

/**
 * Tenant provisioning API (admin only). Replaces the prod-throwing
 * OrganizationSeed as the way to create organizations and assign users to them.
 *
 * `users.organizationId` is the user's ACTIVE org (what RLS keys off). Adding a
 * member sets it and records the membership in org_members. This is the keystone
 * that makes multi-tenancy operable — RLS is inert without a way to create orgs
 * and assign users.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const createOrgSchema = z.object({
  name: z.string().min(1, 'name is required'),
  slug: z.string().min(1).max(100).optional(),
  plan: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid('userId must be a UUID'),
  role: z.enum(['owner', 'admin', 'member']).optional(),
});

const OrgError = t.Object({ success: t.Literal(false), error: t.String() });

export function registerOrganizationRoutes() {
  return new Elysia().group('/api/v1/organizations', (group) =>
    withAdminGuard(group)
      // Create an organization
      .post(
        '/',
        async ({ body, set }) => {
          const parsed = createOrgSchema.safeParse(body);
          if (!parsed.success) {
            set.status = 400;
            return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' };
          }
          const { name, plan, metadata } = parsed.data;
          const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);
          if (!slug) {
            set.status = 400;
            return { success: false, error: 'Could not derive a slug from name' };
          }
          try {
            const db = getControlDb();
            const existing = await db
              .select({ id: organizations.id })
              .from(organizations)
              .where(eq(organizations.slug, slug))
              .limit(1);
            if (existing.length > 0) {
              set.status = 409;
              return { success: false, error: `Organization slug '${slug}' already exists` };
            }
            const [created] = await db
              .insert(organizations)
              .values({ name, slug, ...(plan ? { plan } : {}), ...(metadata ? { metadata } : {}) })
              .returning();
            logger.info('Organization created', { orgId: created.id, slug });
            set.status = 201;
            return { success: true, data: created };
          } catch (error) {
            logger.error('Failed to create organization', { error: describe(error) });
            set.status = 500;
            return { success: false, error: 'Failed to create organization' };
          }
        },
        {
          body: t.Object({
            name: t.String(),
            slug: t.Optional(t.String()),
            plan: t.Optional(t.String()),
            metadata: t.Optional(t.Record(t.String(), t.Any())),
          }),
          response: { 201: t.Object({ success: t.Literal(true), data: t.Any() }), 400: OrgError, 409: OrgError, 500: OrgError },
        }
      )

      // List organizations
      .get('/', async ({ set }) => {
        try {
          const db = getControlDb();
          const rows = await db.select().from(organizations);
          return { success: true, data: rows };
        } catch (error) {
          logger.error('Failed to list organizations', { error: describe(error) });
          set.status = 500;
          return { success: false, error: 'Failed to list organizations' };
        }
      }, {
        response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }), 500: OrgError },
      })

      // Get one organization
      .get('/:id', async ({ params, set }) => {
        try {
          const db = getControlDb();
          const [org] = await db.select().from(organizations).where(eq(organizations.id, params.id)).limit(1);
          if (!org) {
            set.status = 404;
            return { success: false, error: 'Organization not found' };
          }
          return { success: true, data: org };
        } catch (error) {
          logger.error('Failed to get organization', { error: describe(error) });
          set.status = 500;
          return { success: false, error: 'Failed to get organization' };
        }
      }, {
        response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }), 404: OrgError, 500: OrgError },
      })

      // Update an organization
      .patch('/:id', async ({ params, body, set }) => {
        const parsed = updateOrgSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' };
        }
        try {
          const db = getControlDb();
          const [updated] = await db
            .update(organizations)
            .set({ ...parsed.data, updatedAt: new Date() })
            .where(eq(organizations.id, params.id))
            .returning();
          if (!updated) {
            set.status = 404;
            return { success: false, error: 'Organization not found' };
          }
          return { success: true, data: updated };
        } catch (error) {
          logger.error('Failed to update organization', { error: describe(error) });
          set.status = 500;
          return { success: false, error: 'Failed to update organization' };
        }
      }, {
        body: t.Object({
          name: t.Optional(t.String()),
          plan: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
          metadata: t.Optional(t.Record(t.String(), t.Any())),
        }),
        response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }), 400: OrgError, 404: OrgError, 500: OrgError },
      })

      // Assign a user to an organization (sets active org + records membership)
      .post('/:id/members', async ({ params, body, set }) => {
        const parsed = addMemberSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' };
        }
        const { userId, role } = parsed.data;
        try {
          const db = getControlDb();
          const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, params.id)).limit(1);
          if (!org) {
            set.status = 404;
            return { success: false, error: 'Organization not found' };
          }
          const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
          if (!user) {
            set.status = 404;
            return { success: false, error: 'User not found' };
          }

          await db
            .insert(orgMembers)
            .values({ organizationId: params.id, userId, role: role ?? 'member' })
            .onConflictDoUpdate({
              target: [orgMembers.organizationId, orgMembers.userId],
              set: { role: role ?? 'member', updatedAt: new Date() },
            });
          // The active org RLS keys off.
          await db.update(users).set({ organizationId: params.id }).where(eq(users.id, userId));

          logger.info('User assigned to organization', { orgId: params.id, userId, role: role ?? 'member' });
          set.status = 201;
          return { success: true, data: { organizationId: params.id, userId, role: role ?? 'member' } };
        } catch (error) {
          logger.error('Failed to add organization member', { error: describe(error) });
          set.status = 500;
          return { success: false, error: 'Failed to add organization member' };
        }
      }, {
        body: t.Object({ userId: t.String(), role: t.Optional(t.String()) }),
        response: { 201: t.Object({ success: t.Literal(true), data: t.Any() }), 400: OrgError, 404: OrgError, 500: OrgError },
      })

      // List members of an organization
      .get('/:id/members', async ({ params, set }) => {
        try {
          const db = getControlDb();
          const rows = await db
            .select({
              userId: orgMembers.userId,
              role: orgMembers.role,
              email: users.email,
              createdAt: orgMembers.createdAt,
            })
            .from(orgMembers)
            .leftJoin(users, eq(users.id, orgMembers.userId))
            .where(eq(orgMembers.organizationId, params.id));
          return { success: true, data: rows };
        } catch (error) {
          logger.error('Failed to list organization members', { error: describe(error) });
          set.status = 500;
          return { success: false, error: 'Failed to list organization members' };
        }
      }, {
        response: { 200: t.Object({ success: t.Literal(true), data: t.Any() }), 500: OrgError },
      })

      // Remove a member from an organization
      .delete('/:id/members/:userId', async ({ params, set }) => {
        try {
          const db = getControlDb();
          await db
            .delete(orgMembers)
            .where(and(eq(orgMembers.organizationId, params.id), eq(orgMembers.userId, params.userId)));
          logger.info('Organization member removed', { orgId: params.id, userId: params.userId });
          return { success: true, message: 'Member removed' };
        } catch (error) {
          logger.error('Failed to remove organization member', { error: describe(error) });
          set.status = 500;
          return { success: false, error: 'Failed to remove organization member' };
        }
      }, {
        response: { 200: t.Object({ success: t.Literal(true), message: t.String() }), 500: OrgError },
      })
  );
}

function describe(error: unknown): Record<string, unknown> {
  return error instanceof Error ? { message: error.message, name: error.name } : { value: String(error) };
}
