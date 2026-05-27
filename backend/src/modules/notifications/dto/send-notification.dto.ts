import { IsString, IsIn, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotifType } from "../../../common/domain/entities";

export class SendNotificationDto {
  @ApiProperty({ example: "user-firebase-uid" })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: ["order_placed", "order_accepted", "preparing", "delivering", "delivered", "cancelled", "promo", "system"],
  })
  @IsString()
  @IsIn(["order_placed", "order_accepted", "preparing", "delivering", "delivered", "cancelled", "promo", "system"])
  type: NotifType;

  @ApiProperty({ example: "Votre commande est en route !" })
  @IsString()
  message: string;

  @ApiPropertyOptional({ example: "order-id" })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ example: "FBF1234S" })
  @IsOptional()
  @IsString()
  orderRef?: string;
}
