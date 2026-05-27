import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * UpdateVendorOrderStatusDto — Changement de statut d'une commande par le vendeur.
 *
 * Le vendeur peut : accepter, mettre en préparation, marquer comme prêt, refuser.
 */
export class UpdateVendorOrderStatusDto {
  @ApiProperty({
    enum: ["accepted", "preparing", "ready", "rejected"],
    example: "preparing",
    description: "Nouveau statut de la commande côté vendeur",
  })
  @IsIn(["accepted", "preparing", "ready", "rejected"])
  status: string;

  @ApiPropertyOptional({
    example: "Produit épuisé",
    description: "Raison du refus (obligatoire si status=rejected)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  refusalReason?: string;
}
