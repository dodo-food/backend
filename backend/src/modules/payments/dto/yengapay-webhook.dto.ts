import { IsString, IsOptional, IsNumber, IsIn } from "class-validator";
import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";

export class YengaPayWebhookDto {
  @ApiProperty({ example: "FBF1234S" })
  @IsString()
  reference: string;

  @ApiProperty({
    example: "DONE",
    enum: ["DONE", "SUCCESS", "FAILED", "CANCELLED", "PENDING", "REFUNDED"],
  })
  @IsString()
  @IsIn(["DONE", "SUCCESS", "FAILED", "CANCELLED", "PENDING", "REFUNDED"])
  payment_status: string;

  @ApiPropertyOptional({ example: 6500 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: "orange_money" })
  @IsOptional()
  @IsString()
  operator?: string;

  @ApiPropertyOptional({ example: "tx_yp_abc123" })
  @IsOptional()
  @IsString()
  transaction_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signature?: string;
}
