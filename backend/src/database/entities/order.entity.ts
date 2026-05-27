import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from "typeorm";
import { OrderItem } from "./order-item.entity";

export type OrderStatus = "En attente" | "En préparation" | "En livraison" | "Livré" | "Annulé";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PaymentMethod = "cash" | "orange_money" | "moov_money" | "card";

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  ref: string;

  @Column()
  userId: string;

  @Column()
  restaurantId: string;

  @Column({ nullable: true })
  restaurantName: string;

  @Column({ type: "varchar", default: "En attente" })
  status: OrderStatus;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  @Column({ type: "int" })
  subtotal: number;

  @Column({ type: "int", default: 1000 })
  deliveryFee: number;

  @Column({ type: "int" })
  total: number;

  @Column({ type: "varchar", default: "pending" })
  paymentStatus: PaymentStatus;

  @Column({ type: "varchar", nullable: true })
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  yengaTransactionId: string;

  @Column({ nullable: true })
  deliveryAddress: string;

  @Column({ type: "float", nullable: true })
  deliveryLat: number;

  @Column({ type: "float", nullable: true })
  deliveryLng: number;

  @Column({ nullable: true })
  driverUserId: string;

  @Column({ nullable: true })
  deliveryId: string;

  @Column({ nullable: true })
  estimatedDelivery: string;

  @Column({ nullable: true })
  cancellationReason: string;

  @Column({ nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
