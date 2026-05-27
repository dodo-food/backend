import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateRestaurantDto {
  @ApiProperty({ example: "Chez Mama Kadi" })
  @IsString()
  name: string;

  @ApiProperty({ example: "Cuisine africaine traditionnelle" })
  @IsString()
  description: string;

  @ApiProperty({ example: "Secteur 15, Ouagadougou" })
  @IsString()
  address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ example: "25-35 min" })
  @IsOptional()
  @IsString()
  deliveryTime?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @ApiProperty({ example: "Africaine" })
  @IsString()
  category: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
