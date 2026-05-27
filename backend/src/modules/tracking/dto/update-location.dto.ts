import { IsNumber, IsString, IsOptional, Min, Max } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateLocationDto {
  @ApiProperty({ example: 12.3647 })
  @IsNumber()
  @Min(-90) @Max(90)
  lat: number;

  @ApiProperty({ example: -1.5333 })
  @IsNumber()
  @Min(-180) @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: "delivery-id" })
  @IsOptional()
  @IsString()
  deliveryId?: string;

  @ApiPropertyOptional({ example: "order-id" })
  @IsOptional()
  @IsString()
  orderId?: string;
}
