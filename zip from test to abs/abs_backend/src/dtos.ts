import { IsString, IsNotEmpty, IsEmail, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdmissionDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsString() @IsNotEmpty() indexNumber: string;
  @IsString() @IsNotEmpty() fullName: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() programme?: string;
  @IsString() @IsOptional() level?: string;
}

export class CreatePaymentDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsString() @IsNotEmpty() reference: string;
  @IsNumber() @IsNotEmpty() amount: number; // in minor units
  @IsNumber() @IsOptional() paidPercentage?: number; // Total percentage paid (0-100)
  @IsString() @IsOptional() channel?: string;
}

export class CourseItemDto {
  @IsString() @IsNotEmpty() courseCode: string;
  @IsString() @IsNotEmpty() courseName: string;
}

export class BulkRegistrationDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CourseItemDto) courses: CourseItemDto[];
}

export class ResultItemDto {
  @IsString() @IsNotEmpty() courseCode: string;
  @IsString() @IsNotEmpty() grade: string;
  @IsNumber() @IsNotEmpty() score: number;
}

export class ResultPublicationDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ResultItemDto) results: ResultItemDto[];
}

export class SemesterEnrolmentDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsString() @IsNotEmpty() semester: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CourseItemDto) courses: CourseItemDto[];
}

export class SemesterDropDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsString() @IsNotEmpty() semester: string;
}

export class GraduationDto {
  @IsString() @IsNotEmpty() admissionId: string;
  @IsString() @IsNotEmpty() degreeClass: string;
  @IsString() @IsNotEmpty() graduationDate: string;
}
