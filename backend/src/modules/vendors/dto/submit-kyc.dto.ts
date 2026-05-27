import {
  IsString,
  IsOptional,
  IsUrl,
  IsIn,
  MaxLength,
  MinLength,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * SubmitVendorKycDto — Soumission du dossier KYC vendeur.
 *
 * Remplace le @Body() data: any (non typé) par un DTO strictement validé.
 * class-validator rejette toute propriété non déclarée (whitelist: true).
 */
export class SubmitVendorKycDto {
  @ApiProperty({ example: "Koné Moussa", description: "Nom complet du représentant légal" })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: "+22670123456", description: "Téléphone professionnel (+226XXXXXXXX)" })
  @IsString()
  @Matches(/^\+\d{8,15}$/, { message: "Format téléphone invalide (+XXXXXXXXXXX)" })
  phone: string;

  @ApiProperty({ example: "Secteur 15, Ouagadougou", description: "Adresse du restaurant" })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address: string;

  @ApiProperty({ example: "IFU12345678", description: "Numéro IFU / RCCM du commerce" })
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  businessId: string;

  @ApiProperty({
    enum: ["restaurant", "fast_food", "traiteur", "boulangerie", "autre"],
    example: "restaurant",
    description: "Type d'établissement",
  })
  @IsIn(["restaurant", "fast_food", "traiteur", "boulangerie", "autre"])
  businessType: string;

  @ApiPropertyOptional({ example: "https://res.cloudinary.com/foodbf/raw/upload/kyc_vendors/cni.pdf" })
  @IsOptional()
  @IsUrl({}, { message: "URL du document invalide" })
  @MaxLength(500)
  documentUrl?: string;

  @ApiPropertyOptional({ example: "https://res.cloudinary.com/foodbf/raw/upload/kyc_vendors/rccm.pdf" })
  @IsOptional()
  @IsUrl({}, { message: "URL du document invalide" })
  @MaxLength(500)
  rccmUrl?: string;

  @ApiPropertyOptional({ maxLength: 500, description: "Informations complémentaires" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
