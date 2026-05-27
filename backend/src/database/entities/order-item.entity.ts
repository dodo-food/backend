import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from "typeorm";
import { Order } from "./order.entity";

@Entity("order_items")
export class OrderItem {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  @Column()
  orderId: string;

  @Column()
  foodId: string;

  @Column()
  name: string;

  @Column({ type: "int" })
  quantity: number;

  @Column({ type: "int" })
  unitPrice: number;

  @Column({ type: "int" })
  totalPrice: number;

  @Column({ nullable: true })
  imageUrl: string;
}
