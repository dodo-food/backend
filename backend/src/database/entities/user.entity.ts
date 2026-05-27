import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from "typeorm";

export type UserRole = "client" | "vendor" | "driver" | "admin";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  firebaseUid: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ type: "varchar", default: "client" })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ type: "float", default: 0 })
  loyaltyPoints: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
