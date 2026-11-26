import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply } from "fastify";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  BatchCreateBodyDto,
  BatchCreateResultDto,
  BatchIssueBodyDto,
  BatchIssueResultDto,
  CreateInvoiceBodyDto,
  CreditNoteCreateBodyDto,
  DebitNoteCreateBodyDto,
  EmailEnqueueResultDto,
  EmailEventListDto,
  EmailSendBodyDto,
  InvoiceItemDto,
  InvoiceListQueryDto,
  InvoicePageDto,
  UpdateInvoiceDraftBodyDto,
} from "./dto/invoices.dto";
import { InvoicesDocumentsService } from "./invoices-documents.service";
import { InvoicesService } from "./invoices.service";

@ApiTags("invoices")
@Controller("invoices")
export class InvoicesController {
  constructor(
    @Inject(InvoicesService) private readonly invoicesService: InvoicesService,
    @Inject(InvoicesDocumentsService)
    private readonly documentsService: InvoicesDocumentsService,
  ) {}

  @Can("read", "Invoice")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ZodResponse({ type: InvoicePageDto })
  @Get()
  async list(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: InvoiceListQueryDto,
  ): Promise<InvoicePageDto> {
    return this.invoicesService.findPage(user, query);
  }

  @Can("batchCreate", "Invoice")
  @ApiBody({ type: BatchCreateBodyDto })
  @ZodResponse({ type: BatchCreateResultDto })
  @Post("batch")
  async batchCreate(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: BatchCreateBodyDto,
  ): Promise<BatchCreateResultDto> {
    return this.documentsService.batchCreate(user, body);
  }

  @Can("issue", "Invoice")
  @ApiBody({ type: BatchIssueBodyDto })
  @ZodResponse({ type: BatchIssueResultDto })
  @Post("batch/issue")
  async batchIssue(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: BatchIssueBodyDto,
  ): Promise<BatchIssueResultDto> {
    return this.documentsService.batchIssue(user, body);
  }

  @Can("read", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: InvoiceItemDto })
  @Get(":id")
  async getOne(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<InvoiceItemDto> {
    return this.invoicesService.findOne(user, id);
  }

  @Can("read", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiQuery({ name: "copy", required: false, type: String })
  @Get(":id/pdf")
  async pdf(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("copy") copyRaw: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    this.documentsService.assertCanReadPdf(user);
    const copy = copyRaw === "1" || copyRaw === "true";
    const buffer = await this.documentsService.renderPdf(id, copy);
    const filename = copy ? `invoice-${id}-copy.pdf` : `invoice-${id}.pdf`;
    // Set PDF headers only after a successful render so AppException JSON
    // responses are not forced through application/pdf (Fastify 500).
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Can("sendEmail", "Invoice")
  @HttpCode(202)
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: EmailSendBodyDto })
  @ZodResponse({ type: EmailEnqueueResultDto })
  @Post(":id/email")
  async sendEmail(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: EmailSendBodyDto,
  ): Promise<EmailEnqueueResultDto> {
    return this.documentsService.enqueueEmail(user, id, body);
  }

  @Can("read", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: EmailEventListDto })
  @Get(":id/email-events")
  async emailEvents(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<EmailEventListDto> {
    return this.documentsService.listEmailEvents(user, id);
  }

  @Can("cancelViaCreditNote", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: CreditNoteCreateBodyDto })
  @ZodResponse({ type: InvoiceItemDto })
  @Post(":id/credit-note")
  async creditNote(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreditNoteCreateBodyDto,
  ): Promise<InvoiceItemDto> {
    return this.documentsService.createCreditNote(user, id, {
      ...body,
      referencesInvoiceId: id,
    });
  }

  @Can("issue", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: DebitNoteCreateBodyDto })
  @ZodResponse({ type: InvoiceItemDto })
  @Post(":id/debit-note")
  async debitNote(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DebitNoteCreateBodyDto,
  ): Promise<InvoiceItemDto> {
    return this.documentsService.createDebitNote(user, id, {
      ...body,
      referencesInvoiceId: id,
    });
  }

  @Can("create", "Invoice")
  @ApiBody({ type: CreateInvoiceBodyDto })
  @ZodResponse({ type: InvoiceItemDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: CreateInvoiceBodyDto,
  ): Promise<InvoiceItemDto> {
    return this.invoicesService.create(user, body);
  }

  @Can("update", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: UpdateInvoiceDraftBodyDto })
  @ZodResponse({ type: InvoiceItemDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateInvoiceDraftBodyDto,
  ): Promise<InvoiceItemDto> {
    return this.invoicesService.update(user, id, body);
  }

  @Can("issue", "Invoice")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: InvoiceItemDto })
  @Post(":id/issue")
  async issue(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<InvoiceItemDto> {
    return this.invoicesService.issue(user, id);
  }
}
