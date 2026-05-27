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
 * SubmitDriverKycDto — Soumission du dossier KYC livreur.
 *
 * Remplace le @Body() data: any (non typé) par un DTO strictement validé.
 */
export class SubmitDriverKycDto {
  @ApiProperty({ example: "Traoré Seydou", description: "Nom complet du livreur" })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: "+22676543210", description: "Téléphone (+226XXXXXXXX)" })
  @IsString()
  @Matches(/^\+\d{8,15}$/, { message: "Format téléphone invalide (+XXXXXXXXXXX)" })
  phone: string;

  @ApiProperty({ example: "AB1234567", description: "Numéro de permis de conduire" })
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  licenseNumber: string;

  @ApiProperty({
    enum: ["moto", "velo", "voiture", "tricycle"],
    example: "moto",
    description: "Type de véhicule",
  })
  @IsIn(["moto", "velo", "voiture", "tricycle"])
  vehicleType: string;

  @ApiPropertyOptional({ example: "BFABC1234", description: "Plaque d'immatriculation (si applicable)" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string;

  @ApiPropertyOptional({ description: "URL Cloudinary — CNI recto/verso" })
  @IsOptional()
  @IsUrl({}, { message: "URL du document invalide" })
  @MaxLength(500)
  cniUrl?: string;

  @ApiPropertyOptional({ description: "URL Cloudinary — Permis de conduire" })
  @IsOptional()
  @IsUrl({}, { message: "URL du document invalide" })
  @MaxLength(500)
  licenseUrl?: string;

  @ApiPropertyOptional({ description: "URL Cloudinary — Certificat de visite technique" })
  @IsOptional()
  @IsUrl({}, { message: "URL du document invalide" })
  @MaxLength(500)
  technicalControlUrl?: string;

  @ApiPropertyOptional({ maxLength: 500, description: "Informations complémentaires" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
