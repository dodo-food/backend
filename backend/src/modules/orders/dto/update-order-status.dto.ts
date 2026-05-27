import { IsString, IsIn, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: ["En attente", "En préparation", "En livraison", "Livré", "Annulé"],
  })
  @IsString()
  @IsIn(["En attente", "En préparation", "En livraison", "Livré", "Annulé"])
  status: string;

  @ApiPropertyOptional({ example: "Rupture de stock" })
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
