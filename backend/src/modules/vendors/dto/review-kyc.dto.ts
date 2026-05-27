import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * ReviewKycDto — Validation ou refus d'un dossier KYC (admin uniquement).
 *
 * Remplace le @Body() body: { status, reason? } non typé.
 */
export class ReviewKycDto {
  @ApiProperty({
    enum: ["approved", "rejected"],
    example: "approved",
    description: "Décision sur le dossier KYC",
  })
  @IsIn(["approved", "rejected"])
  status: "approved" | "rejected";

  @ApiPropertyOptional({
    example: "Document d'identité illisible. Veuillez soumettre une version plus nette.",
    description: "Raison du refus (obligatoire si status=rejected, recommandé sinon)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
