import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/**
 * Décorateur @Roles — restreint un endpoint à certains rôles.
 *
 * Rôles disponibles : 'admin' | 'vendor' | 'driver' | 'client'
 *
 * Exemples :
 *   @Roles('admin')               → admin uniquement
 *   @Roles('admin', 'vendor')     → admin OU vendeur
 *   @Roles('driver')              → livreur uniquement
 *
 * Doit être combiné avec @UseGuards(FirebaseAuthGuard, RolesGuard)
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
