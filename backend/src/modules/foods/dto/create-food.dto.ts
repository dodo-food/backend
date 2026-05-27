import { IsString, IsNumber, IsBoolean, IsOptional, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateFoodDto {
  @ApiProperty({ example: "Riz sauce arachide" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: "Riz basmati avec sauce arachide maison" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 2500 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: "Plats principaux" })
  @IsString()
  category: string;

  @ApiProperty({ example: "firestore-restaurant-id" })
  @IsString()
  restaurantId: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
