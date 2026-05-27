import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from "typeorm";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  orderId: string;

  @Column()
  userId: string;

  @Column({ type: "int" })
  amount: number;

  @Column({ type: "varchar", default: "cash" })
  method: string;

  @Column({ type: "varchar", default: "pending" })
  status: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ nullable: true })
  phone: string;

  // Répartition financière
  @Column({ type: "int", nullable: true })
  platformShare: number;

  @Column({ type: "int", nullable: true })
  vendorShare: number;

  @Column({ type: "int", nullable: true })
  driverShare: number;

  @Column({ nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
