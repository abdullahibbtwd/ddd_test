import { createId, defineAbilityFor, Role } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import {
  accessibleAreaWhere,
  accessibleClientWhere,
  accessibleSiteWhere,
  accessibleSubscriptionWhere,
  accessibleVisitWhere,
} from "./accessible-where";

describe("accessible*Where agreement with CASL", () => {
  const userId = createId();
  const areaA = createId();
  const areaB = createId();
  const areaC = createId();

  it("ADMIN: unrestricted for Area, Site, Client, Subscription, Visit", () => {
    const ability = defineAbilityFor({ id: userId, role: Role.ADMIN });
    expect(accessibleAreaWhere(ability)).toEqual({});
    expect(accessibleSiteWhere(ability)).toEqual({});
    expect(accessibleClientWhere(ability)).toEqual({});
    expect(accessibleSubscriptionWhere(ability)).toEqual({});
    expect(accessibleVisitWhere(ability)).toEqual({});
  });

  it("OFFICE: unrestricted Site/Client/Subscription/Visit; Area read-all", () => {
    const ability = defineAbilityFor({ id: userId, role: Role.OFFICE });
    expect(accessibleAreaWhere(ability)).toEqual({});
    expect(accessibleSiteWhere(ability)).toEqual({});
    expect(accessibleClientWhere(ability)).toEqual({});
    expect(accessibleSubscriptionWhere(ability)).toEqual({});
    expect(accessibleVisitWhere(ability)).toEqual({});
  });

  it("FIELD: Site and Client scopes use the same area ids as CASL $in conditions", () => {
    const areaIds = [areaA, areaB];
    const ability = defineAbilityFor({ id: userId, role: Role.FIELD, areaIds });

    expect(accessibleAreaWhere(ability)).toEqual({ id: { in: areaIds } });
    expect(accessibleSiteWhere(ability)).toEqual({ areaId: { in: areaIds } });
    expect(accessibleClientWhere(ability)).toEqual({
      sites: { some: { areaId: { in: areaIds } } },
    });
    expect(accessibleSubscriptionWhere(ability)).toEqual({
      site: { areaId: { in: areaIds } },
    });
    expect(accessibleVisitWhere(ability)).toEqual({
      site: { areaId: { in: areaIds } },
    });

    // Extract $in lists from ability rules and compare to Prisma helpers.
    const siteRule = ability
      .rulesFor("read", "Site")
      .find((r: { inverted?: boolean }) => !r.inverted);
    const clientRule = ability
      .rulesFor("read", "Client")
      .find((r: { inverted?: boolean }) => !r.inverted);
    const subRule = ability
      .rulesFor("read", "Subscription")
      .find((r: { inverted?: boolean }) => !r.inverted);
    const siteIn = (siteRule?.conditions as { areaId?: { $in?: string[] } } | undefined)?.areaId
      ?.$in;
    const clientIn = (
      clientRule?.conditions as { siteAreaId?: { $in?: string[] } } | undefined
    )?.siteAreaId?.$in;
    const subIn = (
      subRule?.conditions as { siteAreaId?: { $in?: string[] } } | undefined
    )?.siteAreaId?.$in;
    expect(siteIn).toEqual(areaIds);
    expect(clientIn).toEqual(areaIds);
    expect(subIn).toEqual(areaIds);

    const sampleSites = [
      { areaId: areaA },
      { areaId: areaB },
      { areaId: areaC },
    ];
    for (const site of sampleSites) {
      const inScope = areaIds.includes(site.areaId);
      const where = accessibleSiteWhere(ability) as { areaId?: { in?: string[] } };
      expect(where.areaId?.in?.includes(site.areaId) ?? false).toBe(inScope);
    }

    const sampleClients = [
      { siteAreaIds: [areaA] },
      { siteAreaIds: [areaC] },
      { siteAreaIds: [areaB, areaC] },
      { siteAreaIds: [] as string[] },
    ];
    for (const client of sampleClients) {
      const prismaWouldMatch = client.siteAreaIds.some((id) => areaIds.includes(id));
      const where = accessibleClientWhere(ability) as {
        sites?: { some?: { areaId?: { in?: string[] } } };
      };
      const scoped = where.sites?.some?.areaId?.in ?? [];
      expect(client.siteAreaIds.some((id) => scoped.includes(id))).toBe(prismaWouldMatch);
    }
  });

  it("FIELD with no areas: fail-closed empty sets", () => {
    const ability = defineAbilityFor({ id: userId, role: Role.FIELD, areaIds: [] });
    expect(accessibleAreaWhere(ability)).toEqual({ id: { in: [] } });
    expect(accessibleSiteWhere(ability)).toEqual({ areaId: { in: [] } });
    expect(accessibleClientWhere(ability)).toEqual({
      sites: { some: { areaId: { in: [] } } },
    });
    expect(accessibleSubscriptionWhere(ability)).toEqual({
      site: { areaId: { in: [] } },
    });
    expect(accessibleVisitWhere(ability)).toEqual({
      site: { areaId: { in: [] } },
    });
  });
});
