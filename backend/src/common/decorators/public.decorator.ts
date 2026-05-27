import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../guards/firebase-auth.guard";

/**
 * @Public — marque une route comme accessible sans authentification Firebase.
 * Utilisé par FirebaseAuthGuard pour court-circuiter la vérification du token.
 *
 * Exemple :
 *   @Public()
 *   @Get('health')
 *   health() { return { status: 'ok' }; }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
