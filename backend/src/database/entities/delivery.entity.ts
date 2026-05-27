import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from "typeorm";

export type DeliveryStatus =
  | "assigned" | "accepted" | "heading_to_vendor"
  | "at_vendor" | "heading_to_client" | "delivered" | "refused";

@Entity("deliveries")
export class Delivery {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  orderId: string;

  @Column()
  driverUserId: string;

  @Column({ type: "varchar", default: "assigned" })
  status: DeliveryStatus;

  @Column({ nullable: true })
  orderRef: string;

  @Column({ type: "int", default: 1000 })
  deliveryFee: number;

  @Column({ type: "varchar", default: "cash" })
  paymentMethod: string;

  @Column({ type: "float", nullable: true })
  distanceKm: number;

  @Column({ type: "int", default: 30 })
  estimatedMinutes: number;

  @Column({ nullable: true })
  note: string;

  @Column({ nullable: true })
  acceptedAt: Date;

  @Column({ nullable: true })
  pickedUpAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @CreateDateColumn()
  assignedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
