import { IsString, IsNumber, IsIn, Min, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Opérateurs réellement supportés par l'app Dodo — source : services/yengaPayService.ts
export const YENGAPAY_OPERATORS = [
  "orange_money",
  "moov_money",
  "sank_money",
  "telecel_money",
  "coris_money",
  "paypal",
] as const;

export type YengaOperator = (typeof YENGAPAY_OPERATORS)[number];

// Opérateurs Mobile Money Burkina (numéro de téléphone requis)
export const MOBILE_MONEY_OPERATORS: readonly YengaOperator[] = [
  "orange_money",
  "moov_money",
  "sank_money",
  "telecel_money",
  "coris_money",
];

export class InitiatePaymentDto {
  @ApiProperty({ example: "order-firestore-id" })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 6500 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    enum: YENGAPAY_OPERATORS,
    description:
      "Méthodes disponibles : orange_money (one-step), moov_money (OTP), " +
      "sank_money (OTP), telecel_money (one-step), coris_money (OTP), paypal (redirect WebBrowser).",
  })
  @IsString()
  @IsIn(YENGAPAY_OPERATORS)
  method: YengaOperator;

  @ApiPropertyOptional({
    example: "+22670000000",
    description: "Obligatoire pour orange_money, moov_money, sank_money, telecel_money, coris_money (format +226XXXXXXXX).",
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
