import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthRequestUser } from "../auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthRequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthRequestUser }>();
    return request.user;
  },
);
