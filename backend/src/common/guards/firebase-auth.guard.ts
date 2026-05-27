import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FirebaseService } from "../../firebase/firebase.service";

export const IS_PUBLIC_KEY = "isPublic";

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token Firebase manquant ou invalide.");
    }

    const token = authHeader.slice(7);
    try {
      const decoded = await this.firebase.verifyIdToken(token);
      request.user = decoded;
      return true;
    } catch {
      throw new UnauthorizedException("Token Firebase expiré ou invalide.");
    }
  }
}
