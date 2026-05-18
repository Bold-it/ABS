import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  studentId: string;

  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  details: string;

  @CreateDateColumn()
  timestamp: Date;
}
