import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../guards/firebase-auth.guard";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
