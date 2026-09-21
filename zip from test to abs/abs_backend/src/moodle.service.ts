import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';

@Injectable()
export class MoodleService {
  private readonly logger = new Logger(MoodleService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly isMock: boolean;
  private readonly defaultCategory: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MOODLE_URL');
    this.token = this.configService.get<string>('MOODLE_TOKEN');
    this.isMock = this.configService.get<string>('MOODLE_MOCK_MODE') === 'true';
    this.defaultCategory = Number(this.configService.get<string>('MOODLE_DEFAULT_CATEGORY')) || 1;
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
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
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
    const username = (student.indexNumber || '').replace(/\s+/g, '').toLowerCase();

    let emailStr = (student.schoolEmail || '').replace(/\s+/g, '');
    if (!emailStr.includes('@')) {
      emailStr = `${username}@htu.edu.gh`;
    }
    const email = emailStr;

    // Check if user already exists in Moodle
    if (!this.isMock) {
      try {
        const existingUsers = await this.callMoodle('core_user_get_users_by_field', {
          field: 'username',
          'values[0]': username
        });
        if (existingUsers && existingUsers.length > 0) {
          this.logger.log(`User ${username} already exists in Moodle. Linking existing account.`);
          
          const existingUserId = existingUsers[0].id;
          
          // Safety: Since the school Moodle already uses GAuth exclusively, 
          // we do not need to touch or force-update their authentication method. 
          // We simply leave their profile completely alone to prevent any disruption.
          
          return existingUserId;
        }
      } catch (error) {
        this.logger.warn(`Failed to check if user ${username} exists: ${error.message}`);
      }
    }

    const nameParts = (student.fullName || 'Student').trim().split(/\s+/);
    const firstname = nameParts[0] || 'Student';
    const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Student';



    const params = {
      'users[0][username]': username,
      'users[0][password]': 'HtuStudent@2026!',
      'users[0][firstname]': firstname,
      'users[0][lastname]': lastname,
      'users[0][email]': email,
      'users[0][auth]': 'oauth2'
    };
    this.logger.log(`Attempting to create Moodle user with exact params: ${JSON.stringify(params)}`);
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

  async createCourse(courseCode: string, courseName: string, semester?: string): Promise<number | null> {
    if (this.isMock) {
      this.logger.log(`[MOCK] Moodle Course Create: ${courseCode} (${courseName})`);
      return 102;
    }
    const categoryId = await this.resolveCategory(courseCode, semester) || this.defaultCategory;
    const nowUnix = Math.floor(Date.now() / 1000);
    const endUnix = nowUnix + (105 * 24 * 60 * 60); // 15 weeks (105 days)

    const params = {
      'courses[0][fullname]': courseName || courseCode,
      'courses[0][shortname]': courseCode,
      'courses[0][categoryid]': categoryId,
      'courses[0][startdate]': nowUnix,
      'courses[0][enddate]': endUnix,
    };
    try {
      const result = await this.callMoodle('core_course_create_courses', params);
      return result?.[0]?.id || null;
    } catch (error) {
      this.logger.error(`Failed to dynamically create course ${courseCode} in Moodle: ${error.message}`);
      throw error;
    }
  }

  private resolveCategoryParams(courseCode: string, semester?: string): string {
    const yearMatch = courseCode.match(/(\d{2})\/\d{2}/);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (4 = May)
    
    // Academic year starting year:
    // If we are in May (month 4), the academic year started in previous year (e.g. 2025).
    // If we are in October (month 9), the academic year started in current year (e.g. 2026).
    const academicStartYear = (currentMonth >= 0 && currentMonth <= 5) ? currentYear - 1 : currentYear;
    const defaultYearSuffix = String(academicStartYear).slice(-2); // e.g. "25"
    
    const yearSuffix = yearMatch ? yearMatch[1] : defaultYearSuffix;

    let semesterSuffix = 'S1';
    if (semester === '2' || semester === 'S2' || courseCode.includes('_S2') || courseCode.includes(' S2')) {
      semesterSuffix = 'S2';
    } else if (semester === '1' || semester === 'S1' || courseCode.includes('_S1') || courseCode.includes(' S1')) {
      semesterSuffix = 'S1';
    } else {
      if (currentMonth >= 0 && currentMonth <= 5) {
        semesterSuffix = 'S2';
      } else {
        semesterSuffix = 'S1';
      }
    }

    const cleanedCode = courseCode.trim().toUpperCase();
    const prefixMatch = cleanedCode.match(/^([A-Z]+)/);
    const codePrefix = prefixMatch ? prefixMatch[1] : '';

    const coursePrefixToDeptPrefix: Record<string, string> = {
      AED: 'FAST_DOAG',
      CS: 'FAST_DOCS',
      COS: 'FAST_DOCS',
      CSD: 'FAST_DOCS',
      FST: 'FAST_DOFT',
      FDT: 'FAST_DOFT',
      HTM: 'FAST_DOHM',
      BHM: 'FAST_DOHM',
      MTH: 'FAST_DOMS',
      STA: 'FAST_DOMS',
      MATH: 'FAST_DOMS',
      STAT: 'FAST_DOMS',
      CLT: 'FAST_DOCS',
    };

    const deptPrefix = coursePrefixToDeptPrefix[codePrefix] || 'FAST_DOCS';

    return `${deptPrefix}_${yearSuffix}_${semesterSuffix}`;
  }

  async resolveCategory(courseCode: string, semester?: string): Promise<number | null> {
    const idnumber = this.resolveCategoryParams(courseCode, semester);
    this.logger.log(`Resolving category for course ${courseCode} (semester ${semester || 'none'}) -> target idnumber: ${idnumber}`);
    
    if (this.isMock) {
      this.logger.log(`[MOCK] Resolved category idnumber ${idnumber} to mock ID 200`);
      return 200;
    }

    try {
      const categories = await this.callMoodle('core_course_get_categories', {
        'criteria[0][key]': 'idnumber',
        'criteria[0][value]': idnumber
      });
      if (categories && categories.length > 0) {
        const catId = categories[0].id;
        this.logger.log(`Found category matching idnumber ${idnumber}: ID ${catId}`);
        return catId;
      }
      this.logger.warn(`Category with idnumber ${idnumber} not found. Falling back to default category.`);
      return null;
    } catch (error) {
      this.logger.error(`Error resolving category idnumber ${idnumber}: ${error.message}`);
      return null;
    }
  }

  async updateGrade(moodleUserId: string, courseId: string, gradeValue: number) {
    if (this.isMock) {
      this.logger.log(`[MOCK] Moodle Grade Update: User ${moodleUserId}, Course ${courseId}, Grade ${gradeValue}`);
      return true;
    }
    const params = {
      'source': 'abs_integration',
      'courseid': courseId,
      'component': 'moodle',
      'activityid': courseId,
      'itemnumber': 0, // 0 usually refers to the course total
      'grades[0][studentid]': moodleUserId,
      'grades[0][grade]': gradeValue
    };
    try {
      await this.callMoodle('core_grades_update_grades', params);
      this.logger.log(`Updated grade for user ${moodleUserId} in course ${courseId} to ${gradeValue}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update grade in Moodle: ${error.message}`);
      throw error;
    }
  }

  async convertUserToAlumni(moodleUserId: string) {
    this.logger.log(`Converting Moodle user ${moodleUserId} to Alumni status`);
    if (this.isMock) return true;
    
    // Suspend the user to prevent further course access, but preserve their data
    await this.suspendUser(moodleUserId);
    
    // Update their profile to indicate Alumni status
    const params = {
      'users[0][id]': moodleUserId,
      'users[0][department]': 'Alumni'
    };
    return this.callMoodle('core_user_update_users', params);
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
      await axios.get(`${this.baseUrl}/webservice/rest/server.php`, { 
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      return 'connected';
    } catch (error) {
      this.logger.error(`Moodle connection check failed: ${error.message}`);
      return 'failed';
    }
  }
}
