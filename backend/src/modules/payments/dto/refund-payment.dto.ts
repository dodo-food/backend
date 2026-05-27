import { IsString, IsNumber, IsOptional, IsIn, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RefundPaymentDto {
  @ApiProperty({ example: "order-firestore-id" })
  @IsString()
  orderId: string;

  @ApiPropertyOptional({
    example: 6500,
    description: "Montant à rembourser en FCFA — si absent, remboursement total",
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({
    example: "requested_by_customer",
    enum: ["duplicate", "fraudulent", "requested_by_customer", "order_cancelled", "other"],
  })
  @IsOptional()
  @IsIn(["duplicate", "fraudulent", "requested_by_customer", "order_cancelled", "other"])
  reason?: string;
}
