import { IsString, IsNumber, IsOptional, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AssignDeliveryDto {
  @ApiProperty({ example: "order-firestore-id" })
  @IsString()
  orderId: string;

  @ApiProperty({ example: "driver-uid" })
  @IsString()
  driverUserId: string;

  @ApiPropertyOptional({ example: "3.5" })
  @IsOptional()
  @IsString()
  distanceKm?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedMinutes?: number;
}
