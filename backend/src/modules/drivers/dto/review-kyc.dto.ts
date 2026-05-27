import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * ReviewDriverKycDto — Validation ou refus d'un dossier KYC livreur (admin uniquement).
 */
export class ReviewDriverKycDto {
  @ApiProperty({
    enum: ["approved", "rejected"],
    example: "approved",
    description: "Décision sur le dossier KYC livreur",
  })
  @IsIn(["approved", "rejected"])
  status: "approved" | "rejected";

  @ApiPropertyOptional({
    example: "Permis de conduire expiré. Veuillez soumettre un permis valide.",
    description: "Raison du refus",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
