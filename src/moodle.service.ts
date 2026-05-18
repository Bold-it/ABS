import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MoodleService {
  private readonly logger = new Logger(MoodleService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly isMock: boolean;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MOODLE_URL');
    this.token = this.configService.get<string>('MOODLE_TOKEN');
    this.isMock = this.configService.get<string>('MOODLE_MOCK_MODE') === 'true';
  }

  private async callMoodle(wsFunction: string, params: any) {
    if (this.isMock) {
      this.logger.log(`[MOCK] Moodle Call: ${wsFunction}`);
      return { mock: true };
    }
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    try {
      const response = await axios.get(url, {
        params: {
          wstoken: this.token,
          wsfunction: wsFunction,
          moodlewsrestformat: 'json',
          ...params
        }
      });
      if (response.data && response.data.exception) {
        const errMsg = response.data.debuginfo
          ? `${response.data.message} (${response.data.debuginfo})`
          : response.data.message;
        throw new Error(errMsg);
      }
      return response.data;
    } catch (error) {
      this.logger.error(`Moodle API Error (${wsFunction}): ${error.message}`);
      throw error;
    }
  }

  async createUser(student: any) {
    const username = student.indexNumber.toLowerCase();
    const params = {
      'users[0][username]': username,
      'users[0][password]': 'Student@123',
      'users[0][firstname]': student.fullName.split(' ')[0],
      'users[0][lastname]': student.fullName.split(' ').slice(1).join(' ') || 'Student',
      'users[0][email]': student.email || `${username}@school.edu.gh`,
    };
    const result = await this.callMoodle('core_user_create_users', params);
    return result?.[0]?.id;
  }

  async enrollStudent(moodleUserId: string, courseIds: (string | number)[]) {
    const params: any = {};
    courseIds.forEach((id, index) => {
      params[`enrolments[${index}][roleid]`] = 5;
      params[`enrolments[${index}][userid]`] = moodleUserId;
      params[`enrolments[${index}][courseid]`] = id;
    });
    return this.callMoodle('enrol_manual_enrol_users', params);
  }

  async unenrollStudent(moodleUserId: string, courseIds: (string | number)[]) {
    const params: any = {};
    courseIds.forEach((id, index) => {
      params[`enrolments[${index}][userid]`] = moodleUserId;
      params[`enrolments[${index}][courseid]`] = id;
    });
    return this.callMoodle('enrol_manual_unenrol_users', params);
  }

  async getCourseIdByShortname(shortname: string): Promise<number | null> {
    if (!isNaN(Number(shortname))) {
      return Number(shortname);
    }
    if (this.isMock) {
      this.logger.log(`[MOCK] Moodle Course Lookup: shortname ${shortname} => Mocking Course ID 101`);
      return 101;
    }
    try {
      const result = await this.callMoodle('core_course_get_courses_by_field', {
        field: 'shortname',
        value: shortname
      });
      return result?.courses?.[0]?.id || null;
    } catch (error) {
      this.logger.warn(`Could not resolve course ID for shortname ${shortname}: ${error.message}`);
      return null;
    }
  }

  async createCourse(courseCode: string, courseName: string): Promise<number | null> {
    if (this.isMock) {
      this.logger.log(`[MOCK] Moodle Course Create: ${courseCode} (${courseName})`);
      return 102;
    }
    const params = {
      'courses[0][fullname]': courseName || courseCode,
      'courses[0][shortname]': courseCode,
      'courses[0][categoryid]': 1,
    };
    try {
      const result = await this.callMoodle('core_course_create_courses', params);
      return result?.[0]?.id || null;
    } catch (error) {
      this.logger.error(`Failed to dynamically create course ${courseCode} in Moodle: ${error.message}`);
      throw error;
    }
  }

  async updateGrade(moodleUserId: string, courseId: string, gradeValue: number) {
    this.logger.log(`Updating grade for user ${moodleUserId} in course ${courseId} to ${gradeValue}`);
    // Simplified: in a real system we'd use core_grades_update_grades
    return true;
  }

  async suspendUser(moodleUserId: string) {
    const params = {
      'users[0][id]': moodleUserId,
      'users[0][suspended]': 1
    };
    return this.callMoodle('core_user_update_users', params);
  }

  async unsuspendUser(moodleUserId: string) {
    const params = {
      'users[0][id]': moodleUserId,
      'users[0][suspended]': 0
    };
    return this.callMoodle('core_user_update_users', params);
  }

  async resetUserPassword(moodleUserId: string) {
    const params = {
      'users[0][id]': moodleUserId,
      'users[0][password]': 'Student@123',
    };
    return this.callMoodle('core_user_update_users', params);
  }

  async checkConnection() {
    if (this.isMock) return 'mock_mode';
    try {
      // Just check if we can reach the site
      await axios.get(`${this.baseUrl}/webservice/rest/server.php`, { timeout: 5000 });
      return 'connected';
    } catch (error) {
      this.logger.error(`Moodle connection check failed: ${error.message}`);
      return 'failed';
    }
  }
}
