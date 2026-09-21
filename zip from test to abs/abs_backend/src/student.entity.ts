import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum StudentState {
  ADMITTED = 'ADMITTED',
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  GRADUATED = 'GRADUATED',
}

@Entity()
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  indexNumber: string;

  @Column({ unique: true })
  admissionId: string;

  @Column()
  fullName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  programme: string;

  @Column({ nullable: true })
  level: string;

  @Column({ nullable: true })
  schoolEmail: string;

  @Column({ nullable: true })
  moodleUserId: string;

  @Column({ default: false })
  moodleAccountCreated: boolean;

  @Column({ type: 'float', default: 0 })
  paymentPercentage: number;

  @Column({
    type: 'enum',
    enum: StudentState,
    default: StudentState.ADMITTED,
  })
  state: StudentState;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
