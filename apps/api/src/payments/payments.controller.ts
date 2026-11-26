import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { AuthRequestUser } from "../auth/auth.types";
import { Can } from "../auth/decorators/can.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CashLedgerQueryDto,
  CashLedgerResponseDto,
  HandoverCreateBodyDto,
  HandoverCreateResultDto,
  OutstandingPageDto,
  OutstandingQueryDto,
  PaymentCreateFieldBodyDto,
  PaymentCreateOfficeBodyDto,
  PaymentListDto,
  ReminderEnqueueResultDto,
  ReminderEventListDto,
  ReminderSendBodyDto,
} from "./dto/payments.dto";
import { PaymentsService } from "./payments.service";
import { PaymentItemSchema } from "@ddcrm/shared";
import { createZodDto } from "nestjs-zod";

class PaymentItemDto extends createZodDto(PaymentItemSchema) {}

@ApiTags("payments")
@Controller("invoices")
export class InvoicePaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Can("read", "Outstanding")
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "clientId", required: false, type: String })
  @ApiQuery({ name: "areaId", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "asOf", required: false, type: String })
  @ZodResponse({ type: OutstandingPageDto })
  @Get("outstanding")
  async outstanding(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: OutstandingQueryDto,
  ): Promise<OutstandingPageDto> {
    return this.payments.outstandingReport(user, query);
  }

  @Can("create", "Payment")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: PaymentCreateOfficeBodyDto })
  @ZodResponse({ type: PaymentItemDto })
  @Post(":id/payments")
  async createPayment(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: PaymentCreateOfficeBodyDto,
  ): Promise<PaymentItemDto> {
    return this.payments.createOfficePayment(user, id, body);
  }

  @Can("read", "Payment")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: PaymentListDto })
  @Get(":id/payments")
  async listPayments(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PaymentListDto> {
    return this.payments.listInvoicePayments(user, id);
  }

  @Can("sendReminder", "Invoice")
  @HttpCode(202)
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ApiBody({ type: ReminderSendBodyDto })
  @ZodResponse({ type: ReminderEnqueueResultDto })
  @Post(":id/reminder")
  async sendReminder(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReminderSendBodyDto,
  ): Promise<ReminderEnqueueResultDto> {
    return this.payments.enqueueReminder(user, id, body);
  }

  @Can("read", "Invoice")
  @ApiParam({ name: "id", type: String, format: "uuid" })
  @ZodResponse({ type: ReminderEventListDto })
  @Get(":id/reminder-events")
  async reminderEvents(
    @CurrentUser() user: AuthRequestUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ReminderEventListDto> {
    return this.payments.listReminderEvents(user, id);
  }
}

@ApiTags("payments")
@Controller("visits")
export class VisitPaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Can("create", "Payment")
  @ApiParam({ name: "visitId", type: String, format: "uuid" })
  @ApiBody({ type: PaymentCreateFieldBodyDto })
  @ZodResponse({ type: PaymentItemDto })
  @Post(":visitId/payments")
  async createVisitPayment(
    @CurrentUser() user: AuthRequestUser,
    @Param("visitId", ParseUUIDPipe) visitId: string,
    @Body() body: PaymentCreateFieldBodyDto,
  ): Promise<PaymentItemDto> {
    return this.payments.createFieldPayment(user, visitId, body);
  }
}

@ApiTags("payments")
@Controller("cash-handovers")
export class CashHandoversController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Can("create", "CashHandover")
  @ApiBody({ type: HandoverCreateBodyDto })
  @ZodResponse({ type: HandoverCreateResultDto })
  @Post()
  async create(
    @CurrentUser() user: AuthRequestUser,
    @Body() body: HandoverCreateBodyDto,
  ): Promise<HandoverCreateResultDto> {
    return this.payments.createHandover(user, body);
  }
}

@ApiTags("payments")
@Controller("reports")
export class CashLedgerController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Can("read", "CashLedger")
  @ApiQuery({ name: "employeeId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ZodResponse({ type: CashLedgerResponseDto })
  @Get("cash-ledger")
  async cashLedger(
    @CurrentUser() user: AuthRequestUser,
    @Query() query: CashLedgerQueryDto,
  ): Promise<CashLedgerResponseDto> {
    return this.payments.cashLedger(user, query);
  }
}
