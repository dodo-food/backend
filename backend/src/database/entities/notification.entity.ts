import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from "typeorm";

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: "text" })
  message: string;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  orderRef: string;

  @Column({ nullable: true })
  readAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
