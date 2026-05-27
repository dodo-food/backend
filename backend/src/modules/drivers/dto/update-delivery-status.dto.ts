import { IsIn, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * UpdateDriverDeliveryStatusDto — Mise à jour du statut d'une livraison.
 *
 * Le livreur peut : accepter, marquer comme collecté (picked_up), livré (delivered).
 */
export class UpdateDriverDeliveryStatusDto {
  @ApiProperty({
    enum: ["accepted", "picked_up", "delivered"],
    example: "picked_up",
    description: "Nouveau statut de la livraison",
  })
  @IsIn(["accepted", "picked_up", "delivered"])
  status: string;

  @ApiPropertyOptional({ example: "2025-01-15T14:30:00.000Z", description: "Horodatage collecte" })
  @IsOptional()
  @IsString()
  pickedUpAt?: string;

  @ApiPropertyOptional({ example: "2025-01-15T15:05:00.000Z", description: "Horodatage livraison" })
  @IsOptional()
  @IsString()
  deliveredAt?: string;
}
