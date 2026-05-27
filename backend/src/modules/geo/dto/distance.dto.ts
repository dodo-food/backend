import { IsNumber, Min, Max, ValidateNested, IsOptional, IsArray, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class LatLngDto {
  @ApiProperty({ example: 12.3647 })
  @IsNumber() @Min(-90) @Max(90)
  lat: number;

  @ApiProperty({ example: -1.5333 })
  @IsNumber() @Min(-180) @Max(180)
  lng: number;
}

export class DistanceDto {
  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  origin: LatLngDto;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  destination: LatLngDto;
}

export class RouteDto {
  @ApiProperty({ type: [LatLngDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LatLngDto)
  waypoints: LatLngDto[];
}

export class DeliveryStopDto {
  @ApiProperty({ example: "order-id" })
  @IsString()
  orderId: string;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  location: LatLngDto;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class OptimizeDto {
  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  depot: LatLngDto;

  @ApiProperty({ type: [DeliveryStopDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryStopDto)
  deliveries: DeliveryStopDto[];
}

export class AvailableDriverDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  location: LatLngDto;

  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @IsNumber()
  rating?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  activeDeliveries?: number;

  @ApiPropertyOptional({ example: "moto" })
  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class MatchDto {
  @ApiProperty()
  @ValidateNested() @Type(() => Object)
  order: {
    orderId: string;
    restaurantLocation: LatLngDto;
    clientLocation: LatLngDto;
  };

  @ApiProperty({ type: [AvailableDriverDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailableDriverDto)
  availableDrivers: AvailableDriverDto[];

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  maxDrivers?: number;
}
