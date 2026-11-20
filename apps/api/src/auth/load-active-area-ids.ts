import type { PrismaService } from "../prisma/prisma.service";

/** Active area ids assigned to the user (inactive areas are ignored). */
export async function loadActiveAreaIds(
  prisma: Pick<PrismaService, "userArea">,
  userId: string,
): Promise<string[]> {
  const rows = await prisma.userArea.findMany({
    where: {
      userId,
      area: { isActive: true },
    },
    select: { areaId: true },
  });
  return rows.map((row) => row.areaId);
}

export async function loadActiveAreas(
  prisma: Pick<PrismaService, "userArea">,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.userArea.findMany({
    where: {
      userId,
      area: { isActive: true },
    },
    select: {
      area: { select: { id: true, name: true } },
    },
    orderBy: { area: { name: "asc" } },
  });
  return rows.map((row) => row.area);
}
