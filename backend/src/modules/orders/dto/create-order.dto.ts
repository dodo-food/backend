import { IsString, IsNumber, IsArray, IsOptional, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  restaurantId: string;

  @ApiProperty()
  @IsString()
  restaurantName: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 5500 })
  @IsNumber()
  @Min(0)
  total: number;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  deliveryFee: number;

  @ApiProperty({ example: 6500 })
  @IsNumber()
  @Min(0)
  grandTotal: number;

  @ApiProperty({ example: "orange_money" })
  @IsString()
  paymentMethod: string;

  @ApiProperty({ example: "Secteur 15, Ouagadougou" })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: "livraison" })
  @IsOptional()
  @IsString()
  deliveryMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  promoDiscount?: number;
}
