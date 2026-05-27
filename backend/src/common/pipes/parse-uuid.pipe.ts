import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIRESTORE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * ParseUuidPipe — valide qu'un paramètre de route est un UUID v4 valide.
 *
 * Empêche les injections arbitraires de chaînes dans les identifiants.
 *
 * Exemple :
 *   @Get(':id')
 *   findOne(@Param('id', ParseUuidPipe) id: string) { ... }
 */
@Injectable()
export class ParseUuidPipe implements PipeTransform {
  transform(value: string): string {
    if (!UUID_REGEX.test(value)) {
      throw new BadRequestException(`Identifiant invalide : format UUID attendu.`);
    }
    return value;
  }
}

/**
 * ParseFirestoreIdPipe — valide qu'un paramètre de route est un ID Firestore valide.
 * (alphanumérique + tirets/underscores, 1-128 caractères)
 *
 * Utilisé pour les routes qui référencent des documents Firestore.
 */
@Injectable()
export class ParseFirestoreIdPipe implements PipeTransform {
  transform(value: string): string {
    if (!value || !FIRESTORE_ID_REGEX.test(value)) {
      throw new BadRequestException(`Identifiant invalide : format Firestore attendu.`);
    }
    return value;
  }
}
