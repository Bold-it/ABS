import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('mounted_courses')
export class MountedCourse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 100 })
  courseCode: string;

  @Column({ length: 500 })
  courseName: string;

  @Column({ nullable: true, length: 255 })
  lecturerName: string | null;

  @Column({ nullable: true, length: 255 })
  lecturerEmail: string | null;

  @Column({ length: 20, default: '2026/2027' })
  academicYear: string;

  @Column({ length: 5, default: '1' })
  semester: string;

  @Column({ length: 10, default: '100' })
  level: string;

  @Column({ nullable: true, length: 255 })
  programme: string | null;

  @Column({ nullable: true, length: 100 })
  targetCategoryIdNumber: string | null;

  @Column({ nullable: true, type: 'int' })
  moodleCourseId: number | null;

  @Column({ default: false })
  isSyncedToMoodle: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
