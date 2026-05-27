import { IsString, IsIn, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeliveryStatus } from "../.././../common/domain/entities";

export class UpdateDeliveryStatusDto {
  @ApiProperty({
    enum: [
      "accepted",
      "heading_to_vendor",
      "at_vendor",
      "heading_to_client",
      "delivered",
      "refused",
    ],
  })
  @IsString()
  @IsIn([
    "accepted",
    "heading_to_vendor",
    "at_vendor",
    "heading_to_client",
    "delivered",
    "refused",
  ])
  status: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
