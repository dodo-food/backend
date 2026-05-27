import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * PaginationDto — paramètres de pagination standardisés.
 *
 * Limite les résultats pour prévenir les attaques DoS par requêtes massives.
 * Valeurs par défaut : page=1, limit=20. Maximum autorisé : 100.
 *
 * Utilisation :
 *   @Get()
 *   findAll(@Query() pagination: PaginationDto) { ... }
 */
export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: "Numéro de page (commence à 1)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: "Nombre d'éléments par page (max 100)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }
}
