import {
  buildLineAmounts,
  createId,
  CURRENCY,
  defineAbilityFor,
  defaultDueDateFromIssued,
  DocumentType,
  ErrorCode,
  formatInvoiceNumber,
  InvoiceStatus,
  VisitStatus,
  firstDayOfMonth,
  monthOf,
  todayInSofia,
  type CreateInvoiceBody,
  type InvoiceItem,
  type InvoiceLineInput,
  type InvoiceListQuery,
  type InvoicePage,
  type UpdateInvoiceDraftBody,
} from "@ddcrm/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthRequestUser } from "../auth/auth.types";
import { dateToIsoDate, isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type {
  DocumentType as PrismaDocumentType,
  InvoiceStatus as PrismaInvoiceStatus,
  Prisma,
  ServiceType as PrismaServiceType,
} from "../generated/prisma/client";
import type { Decimal } from "../generated/prisma/internal/prismaNamespace";
import {
  lockInvoiceCounterForUpdate,
  lockInvoiceForUpdate,
  readInvoiceCounterValue,
} from "../prisma/lock-invoice";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_VAT_RATE = "20.00";

const TREATMENT_LABELS: Record<PrismaServiceType, string> = {
  INSECT_CONTROL: "Дезинсекция",
  RODENT_CONTROL: "Дератизация",
  DISINFECTION: "Дезинфекция",
  OTHER: "Друго",
};

type InvoiceLineRow = {
  id: string;
  lineNo: number;
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  vatRate: Decimal;
  lineTotal: Decimal;
  vatAmount: Decimal;
};

type InvoiceVisitRow = {
  visit: {
    id: string;
    visitDate: Date;
    treatmentType: PrismaServiceType;
    chargedAmount: Decimal;
    site: { name: string };
  };
};

type InvoiceRow = {
  id: string;
  number: string | null;
  status: PrismaInvoiceStatus;
  documentType: PrismaDocumentType;
  clientId: string;
  issuedAt: Date | null;
  issuedById: string | null;
  clientLegalName: string | null;
  clientEik: string | null;
  clientVatNumber: string | null;
  clientRegisteredAddress: string | null;
  clientLegalRepresentative: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  currency: string;
  netAmount: Decimal;
  vatAmount: Decimal;
  grossAmount: Decimal;
  notes: string | null;
  referencesInvoiceId: string | null;
  creditNoteReason: string | null;
  billingMonth: Date | null;
  siteId: string | null;
  emailSentAt: Date | null;
  emailLastError: string | null;
  dueDate: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  client: {
    id: string;
    name: string;
    eik: string | null;
    vatNumber: string | null;
    registeredAddress: string | null;
    legalRepresentative: string | null;
    email: string | null;
    phone: string | null;
  };
  issuedBy: { id: string; name: string } | null;
  lines: InvoiceLineRow[];
  visits: InvoiceVisitRow[];
  referencedBy?: Array<{
    id: string;
    number: string | null;
    issuedAt: Date | null;
    documentType: PrismaDocumentType;
  }>;
};

type VisitForLine = {
  id: string;
  treatmentType: PrismaServiceType;
  chargedAmount: Decimal;
  site: { name: string };
};

function moneyString(value: Decimal | number | string, scale: 2 | 3 = 2): string {
  return Number(value).toFixed(scale);
}

function endExclusiveUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1));
}

@Injectable()
export class InvoicesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertCan(user: AuthRequestUser, action: "read" | "create" | "update") {
    const ability = this.abilityFor(user);
    if (!ability.can(action, "Invoice")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private include: Prisma.InvoiceInclude = {
    client: {
      select: {
        id: true,
        name: true,
        eik: true,
        vatNumber: true,
        registeredAddress: true,
        legalRepresentative: true,
        email: true,
        phone: true,
      },
    },
    issuedBy: { select: { id: true, name: true } },
    lines: { orderBy: { lineNo: "asc" } },
    visits: {
      include: {
        visit: {
          select: {
            id: true,
            visitDate: true,
            treatmentType: true,
            chargedAmount: true,
            site: { select: { name: true } },
          },
        },
      },
    },
    referencedBy: {
      where: { documentType: DocumentType.CREDIT_NOTE },
      select: {
        id: true,
        number: true,
        issuedAt: true,
        documentType: true,
      },
      take: 1,
    },
  };

  private toItem(row: InvoiceRow): InvoiceItem {
    const hasSnapshot =
      row.status === InvoiceStatus.ISSUED ||
      row.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE;
    const creditNote = row.referencedBy?.find(
      (r) => r.documentType === DocumentType.CREDIT_NOTE,
    );
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      documentType: row.documentType,
      clientId: row.clientId,
      client: hasSnapshot
        ? null
        : {
            id: row.client.id,
            name: row.client.name,
            eik: row.client.eik,
            vatNumber: row.client.vatNumber,
            registeredAddress: row.client.registeredAddress,
            legalRepresentative: row.client.legalRepresentative,
            email: row.client.email,
            phone: row.client.phone,
          },
      snapshot: hasSnapshot
        ? {
            legalName: row.clientLegalName ?? "",
            eik: row.clientEik ?? "",
            vatNumber: row.clientVatNumber ?? "",
            registeredAddress: row.clientRegisteredAddress ?? "",
            legalRepresentative: row.clientLegalRepresentative ?? "",
            email: row.clientEmail,
            phone: row.clientPhone,
          }
        : null,
      currency: row.currency,
      netAmount: moneyString(row.netAmount),
      vatAmount: moneyString(row.vatAmount),
      grossAmount: moneyString(row.grossAmount),
      notes: row.notes,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      issuedBy: row.issuedById,
      issuedByName: row.issuedBy?.name ?? null,
      createdBy: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lines: row.lines.map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        description: line.description,
        quantity: moneyString(line.quantity, 3),
        unitPrice: moneyString(line.unitPrice),
        vatRate: moneyString(line.vatRate),
        lineTotal: moneyString(line.lineTotal),
        vatAmount: moneyString(line.vatAmount),
      })),
      visits: row.visits.map((link) => ({
        id: link.visit.id,
        visitDate: dateToIsoDate(link.visit.visitDate),
        siteName: link.visit.site.name,
        treatmentType: link.visit.treatmentType,
        chargedAmount: moneyString(link.visit.chargedAmount),
      })),
      referencesInvoiceId: row.referencesInvoiceId,
      creditNoteReason: row.creditNoteReason,
      billingMonth: row.billingMonth ? dateToIsoDate(row.billingMonth) : null,
      siteId: row.siteId,
      emailSentAt: row.emailSentAt?.toISOString() ?? null,
      emailLastError: row.emailLastError,
      dueDate: row.dueDate ? dateToIsoDate(row.dueDate) : null,
      creditNote:
        creditNote && creditNote.number && creditNote.issuedAt
          ? {
              id: creditNote.id,
              number: creditNote.number,
              issuedAt: creditNote.issuedAt.toISOString(),
            }
          : null,
    };
  }

  private isSqlState(error: unknown, code: string): boolean {
    const walk = (value: unknown, depth = 0): boolean => {
      if (depth > 6 || value == null || typeof value !== "object") return false;
      const obj = value as Record<string, unknown>;
      if (obj.code === code) return true;
      if (typeof obj.message === "string" && obj.message.includes(code)) return true;
      for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
        if (key in obj && walk(obj[key], depth + 1)) return true;
      }
      return false;
    };
    return walk(error);
  }

  private isUniqueVisitViolation(error: unknown): boolean {
    const walk = (value: unknown, depth = 0): boolean => {
      if (depth > 6 || value == null || typeof value !== "object") return false;
      const obj = value as Record<string, unknown>;
      if (obj.code === "P2002") {
        const target = obj.meta && typeof obj.meta === "object"
          ? (obj.meta as { target?: string[] | string }).target
          : undefined;
        const targets = Array.isArray(target) ? target : target ? [target] : [];
        if (targets.some((t) => String(t).includes("visit"))) return true;
      }
      if (obj.code === "23505") {
        const msg = typeof obj.message === "string" ? obj.message : "";
        if (/invoice_visit_visit_id|visit_id/i.test(msg)) return true;
      }
      if (typeof obj.message === "string" && /invoice_visit_visit_id/i.test(obj.message)) {
        return true;
      }
      for (const key of ["cause", "meta", "original", "driverAdapterError", "error"]) {
        if (key in obj && walk(obj[key], depth + 1)) return true;
      }
      return false;
    };
    return walk(error);
  }

  private async throwVisitAlreadyInvoiced(visitId: string): Promise<never> {
    const link = await this.prisma.invoiceVisit.findFirst({
      where: { visitId },
      select: { invoiceId: true },
    });
    throw new AppException(
      ErrorCode.VISIT_ALREADY_INVOICED,
      "Visit is already linked to an invoice",
      { visitId, conflictingInvoiceId: link?.invoiceId ?? null },
    );
  }

  private mapWriteError(error: unknown): never {
    if (this.isSqlState(error, "23P02")) {
      throw new AppException(ErrorCode.INVOICE_IMMUTABLE, "Issued invoice is immutable");
    }
    if (error instanceof AppException) throw error;
    throw error;
  }

  private autoLineFromVisit(visit: VisitForLine): InvoiceLineInput {
    return {
      description: `${visit.site.name} — ${TREATMENT_LABELS[visit.treatmentType] ?? visit.treatmentType}`,
      quantity: "1.000",
      unitPrice: moneyString(visit.chargedAmount),
      vatRate: DEFAULT_VAT_RATE,
    };
  }

  private lineCreateData(invoiceId: string, lines: InvoiceLineInput[]) {
    return lines.map((line, index) => {
      const amounts = buildLineAmounts(line);
      return {
        id: createId(),
        invoiceId,
        lineNo: index + 1,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        lineTotal: amounts.lineTotal,
        vatAmount: amounts.vatAmount,
      };
    });
  }

  /**
   * Validate visits are ACTIVE, belong to client (via site), and not already invoiced.
   */
  private async loadInvoiceableVisits(
    clientId: string,
    visitIds: string[],
    excludeInvoiceId?: string,
  ): Promise<VisitForLine[]> {
    if (visitIds.length === 0) return [];

    const uniqueIds = [...new Set(visitIds)];
    const visits = await this.prisma.visit.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        status: true,
        treatmentType: true,
        chargedAmount: true,
        site: { select: { name: true, clientId: true } },
        invoiceLinks: {
          where: excludeInvoiceId ? { invoiceId: { not: excludeInvoiceId } } : undefined,
          select: { invoiceId: true },
          take: 1,
        },
      },
    });

    const byId = new Map(visits.map((v) => [v.id, v]));
    for (const visitId of uniqueIds) {
      const visit = byId.get(visitId);
      if (!visit || visit.status !== VisitStatus.ACTIVE || visit.site.clientId !== clientId) {
        throw new AppException(
          ErrorCode.VISIT_NOT_INVOICEABLE,
          "Visit cannot be invoiced",
          { visitId },
        );
      }
      if (visit.invoiceLinks.length > 0) {
        throw new AppException(
          ErrorCode.VISIT_ALREADY_INVOICED,
          "Visit is already linked to an invoice",
          {
            visitId,
            conflictingInvoiceId: visit.invoiceLinks[0]!.invoiceId,
          },
        );
      }
    }

    return uniqueIds.map((id) => {
      const v = byId.get(id)!;
      return {
        id: v.id,
        treatmentType: v.treatmentType,
        chargedAmount: v.chargedAmount,
        site: { name: v.site.name },
      };
    });
  }

  private resolveLines(
    lines: InvoiceLineInput[] | undefined,
    visits: VisitForLine[],
  ): InvoiceLineInput[] {
    if (lines && lines.length > 0) return lines;
    if (visits.length > 0 && (!lines || lines.length === 0)) {
      return visits.map((v) => this.autoLineFromVisit(v));
    }
    return lines ?? [];
  }

  async findPage(user: AuthRequestUser, query: InvoiceListQuery): Promise<InvoicePage> {
    this.assertCan(user, "read");

    const dateFilter =
      query.from || query.to
        ? {
            ...(query.from ? { gte: isoDateToDate(query.from) } : {}),
            ...(query.to ? { lt: endExclusiveUtc(query.to) } : {}),
          }
        : undefined;

    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(dateFilter
        ? {
            OR: [
              { status: InvoiceStatus.ISSUED, issuedAt: dateFilter },
              { status: InvoiceStatus.DRAFT, createdAt: dateFilter },
            ],
          }
        : {}),
    };

    const page = query.page;
    const pageSize = query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: {
          client: { select: { name: true } },
        },
        // DRAFT < ISSUED alphabetically; drafts use createdAt via null issuedAt + tertiary key.
        orderBy: [{ status: "asc" }, { issuedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        documentType: row.documentType,
        clientId: row.clientId,
        clientName:
          row.status === InvoiceStatus.ISSUED ||
          row.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
            ? (row.clientLegalName ?? row.client.name)
            : row.client.name,
        currency: row.currency,
        grossAmount: moneyString(row.grossAmount),
        issuedAt: row.issuedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(user: AuthRequestUser, id: string): Promise<InvoiceItem> {
    this.assertCan(user, "read");
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      include: this.include,
    });
    if (!row) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    return this.toItem(row as unknown as InvoiceRow);
  }

  async create(user: AuthRequestUser, body: CreateInvoiceBody): Promise<InvoiceItem> {
    this.assertCan(user, "create");

    const client = await this.prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) {
      throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
    }

    const visitIds = body.visitIds ?? [];
    const visits = await this.loadInvoiceableVisits(body.clientId, visitIds);
    const lines = this.resolveLines(body.lines, visits);

    const invoiceId = createId();
    const billingMonth = isoDateToDate(
      firstDayOfMonth(monthOf(todayInSofia(new Date()))),
    );
    try {
      const row = await this.prisma.transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            id: invoiceId,
            status: InvoiceStatus.DRAFT,
            documentType: DocumentType.INVOICE,
            clientId: body.clientId,
            currency: CURRENCY,
            netAmount: "0.00",
            vatAmount: "0.00",
            grossAmount: "0.00",
            notes: body.notes ?? null,
            billingMonth,
            createdById: user.id,
          },
        });

        if (lines.length > 0) {
          await tx.invoiceLine.createMany({
            data: this.lineCreateData(invoiceId, lines),
          });
        }

        if (visits.length > 0) {
          await tx.invoiceVisit.createMany({
            data: visits.map((v) => ({
              id: createId(),
              invoiceId,
              visitId: v.id,
            })),
          });
        }

        return tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          include: this.include,
        });
      });
      return this.toItem(row as unknown as InvoiceRow);
    } catch (error) {
      if (this.isUniqueVisitViolation(error)) {
        const first = visitIds[0];
        if (first) await this.throwVisitAlreadyInvoiced(first);
      }
      this.mapWriteError(error);
    }
  }

  async update(
    user: AuthRequestUser,
    id: string,
    body: UpdateInvoiceDraftBody,
  ): Promise<InvoiceItem> {
    this.assertCan(user, "update");

    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      include: { visits: true },
    });
    if (!existing) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new AppException(ErrorCode.INVOICE_ALREADY_ISSUED, "Invoice is already issued");
    }

    const clientId = body.clientId ?? existing.clientId;
    if (body.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: body.clientId } });
      if (!client) {
        throw new AppException(ErrorCode.NOT_FOUND, "Client not found");
      }
    }

    const replaceVisits = body.visitIds !== undefined;
    const replaceLines = body.lines !== undefined;
    const nextVisitIds = replaceVisits
      ? body.visitIds!
      : existing.visits.map((v) => v.visitId);

    // Re-validate visits when client changes or visit set is replaced.
    const visitsForWrite =
      replaceVisits || body.clientId
        ? await this.loadInvoiceableVisits(clientId, nextVisitIds, id)
        : null;

    let linesToWrite: InvoiceLineInput[] | null = null;
    if (replaceLines && body.lines && body.lines.length > 0) {
      linesToWrite = body.lines;
    } else if (replaceVisits && (!body.lines || body.lines.length === 0)) {
      const visitRows =
        visitsForWrite ??
        (await this.loadInvoiceableVisits(clientId, nextVisitIds, id));
      linesToWrite = this.resolveLines(body.lines, visitRows);
    } else if (replaceLines) {
      // Explicit empty lines array clears lines without auto-generation.
      linesToWrite = body.lines ?? [];
    }

    try {
      const row = await this.prisma.transaction(async (tx) => {
        await tx.invoice.update({
          where: { id },
          data: {
            ...(body.clientId ? { clientId: body.clientId } : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
          },
        });

        if (replaceVisits) {
          await tx.invoiceVisit.deleteMany({ where: { invoiceId: id } });
          const visits = visitsForWrite ?? [];
          if (visits.length > 0) {
            await tx.invoiceVisit.createMany({
              data: visits.map((v) => ({
                id: createId(),
                invoiceId: id,
                visitId: v.id,
              })),
            });
          }
        }

        if (linesToWrite !== null) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
          if (linesToWrite.length > 0) {
            await tx.invoiceLine.createMany({
              data: this.lineCreateData(id, linesToWrite),
            });
          } else {
            await tx.invoice.update({
              where: { id },
              data: {
                netAmount: "0.00",
                vatAmount: "0.00",
                grossAmount: "0.00",
              },
            });
          }
        }

        return tx.invoice.findUniqueOrThrow({
          where: { id },
          include: this.include,
        });
      });
      return this.toItem(row as unknown as InvoiceRow);
    } catch (error) {
      if (this.isUniqueVisitViolation(error)) {
        const first = (body.visitIds ?? [])[0];
        if (first) await this.throwVisitAlreadyInvoiced(first);
        throw new AppException(
          ErrorCode.VISIT_ALREADY_INVOICED,
          "Visit is already linked to an invoice",
        );
      }
      this.mapWriteError(error);
    }
  }

  async issue(user: AuthRequestUser, id: string): Promise<InvoiceItem> {
    this.assertCan(user, "update");

    try {
      const row = await this.prisma.transaction(
        async (tx) => {
          const locked = await lockInvoiceForUpdate(tx, id);
          if (!locked) {
            throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
          }
          if (locked.status !== InvoiceStatus.DRAFT) {
            throw new AppException(
              ErrorCode.INVOICE_ALREADY_ISSUED,
              "Invoice is already issued",
            );
          }

          const lineCount = await tx.invoiceLine.count({ where: { invoiceId: id } });
          if (lineCount === 0) {
            throw new AppException(ErrorCode.EMPTY_INVOICE, "Invoice has no lines");
          }

          const counter = await lockInvoiceCounterForUpdate(tx);
          const used = Number(counter.next_value);
          const number = formatInvoiceNumber(used);

          await tx.invoiceCounter.update({
            where: { id: "default" },
            data: { nextValue: used + 1 },
          });

          const nextValue = Number(await readInvoiceCounterValue(tx));
          if (nextValue !== used + 1) {
            throw new AppException(
              ErrorCode.INVOICE_NUMBER_COUNTER_CORRUPTED,
              "Invoice number counter corrupted",
            );
          }

          const invoice = await tx.invoice.findUniqueOrThrow({
            where: { id },
            include: {
              client: {
                select: {
                  name: true,
                  eik: true,
                  vatNumber: true,
                  registeredAddress: true,
                  legalRepresentative: true,
                  email: true,
                  phone: true,
                },
              },
            },
          });

          const client = invoice.client;
          const issuedAt = new Date();
          const dueDate = isoDateToDate(
            defaultDueDateFromIssued(todayInSofia(issuedAt)),
          );
          await tx.invoice.update({
            where: { id },
            data: {
              status: InvoiceStatus.ISSUED,
              number,
              issuedAt,
              issuedById: user.id,
              dueDate,
              clientLegalName: client.name,
              clientEik: client.eik ?? "",
              clientVatNumber: client.vatNumber ?? "",
              clientRegisteredAddress: client.registeredAddress ?? "",
              clientLegalRepresentative: client.legalRepresentative ?? "",
              clientEmail: client.email,
              clientPhone: client.phone,
            },
          });

          return tx.invoice.findUniqueOrThrow({
            where: { id },
            include: this.include,
          });
        },
        // 50 parallel issuers serialize on the counter row; need a long maxWait
        // so pool acquisition does not time out while earlier txs hold the lock.
        { timeout: 120_000, maxWait: 120_000 },
      );
      return this.toItem(row as unknown as InvoiceRow);
    } catch (error) {
      this.mapWriteError(error);
    }
  }
}
