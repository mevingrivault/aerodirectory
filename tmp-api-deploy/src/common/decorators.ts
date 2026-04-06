import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";

/** Extract the authenticated user from the request */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

/** Mark a route as public (no auth required) */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to specific roles */
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
