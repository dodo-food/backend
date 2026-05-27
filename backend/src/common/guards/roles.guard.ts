import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * RolesGuard — RBAC par custom claims Firebase.
 *
 * Le champ `role` est stocké dans les custom claims du token Firebase
 * (via FirebaseService.setUserRole) et décodé automatiquement par FirebaseAuthGuard.
 *
 * Utilisation :
 *   @UseGuards(FirebaseAuthGuard, RolesGuard)
 *   @Roles('admin')
 *   @Patch('kyc/:uid/review')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Accès refusé : authentification requise.");
    }

    // `user.role` vient des Firebase custom claims (set via Admin SDK)
    const userRole: string | undefined = user["role"];

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Accès refusé : rôle requis — ${requiredRoles.join(" ou ")}. Rôle actuel : ${userRole ?? "inconnu"}.`,
      );
    }

    return true;
  }
}
