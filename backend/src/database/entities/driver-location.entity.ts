import {
  Entity, PrimaryColumn, Column, UpdateDateColumn,
} from "typeorm";

@Entity("driver_locations")
export class DriverLocation {
  @PrimaryColumn()
  driverUserId: string;

  @Column({ type: "float" })
  lat: number;

  @Column({ type: "float" })
  lng: number;

  @Column({ nullable: true })
  deliveryId: string;

  @Column({ default: true })
  isOnline: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
