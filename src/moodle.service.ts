import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MoodleService {
  private readonly logger = new Logger(MoodleService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly isMock: boolean;
  private readonly defaultCategory: number;

  private reportSnapshotCache = new Map<string, any>();
  private reportProgress = {
    isGenerating: false,
    progress: 0,
    total: 0,
    currentStep: 'Idle',
    startedAt: null as string | null,
    updatedAt: null as string | null,
    error: null as string | null,
  };

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MOODLE_URL');
    this.token = this.configService.get<string>('MOODLE_TOKEN');
    this.isMock = this.configService.get<string>('MOODLE_MOCK_MODE') === 'true';
    this.defaultCategory = Number(this.configService.get<string>('MOODLE_DEFAULT_CATEGORY')) || 1;
  }

  private async callMoodle(wsFunction: string, params: any) {
    if (this.isMock || !this.baseUrl || !this.token) {
      this.logger.log(`[MOCK/OFFLINE] Moodle Call: ${wsFunction} (Moodle URL or Token unconfigured or mock mode)`);
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
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 10000,
      });
      if (response.data && response.data.exception) {
        const errMsg = response.data.debuginfo
          ? `${response.data.message} (${response.data.debuginfo})`
          : response.data.message;
        throw new Error(errMsg);
      }
      return response.data;
    } catch (error: any) {
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
        let existingUsers = await this.callMoodle('core_user_get_users_by_field', {
          field: 'username',
          'values[0]': username
        });
        
        // If not found by username, fallback to checking by email
        if (!existingUsers || existingUsers.length === 0) {
           existingUsers = await this.callMoodle('core_user_get_users_by_field', {
             field: 'email',
             'values[0]': email
           });
        }

        if (existingUsers && existingUsers.length > 0) {
          const user = existingUsers[0];
          this.logger.log(`User ${username}/${email} already exists in Moodle (ID ${user.id}).`);
          // If the existing user had a numeric or placeholder name in Moodle, update it to their real name
          if (student.fullName && !/^\d+$/.test(student.fullName) && (/^\d+$/.test(user.firstname) || user.firstname === 'Student' || user.lastname === 'Student')) {
            try {
              const nameParts = student.fullName.trim().split(/\s+/);
              const firstname = nameParts[0] || 'Student';
              const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Student';
              await this.callMoodle('core_user_update_users', {
                'users[0][id]': user.id,
                'users[0][firstname]': firstname,
                'users[0][lastname]': lastname,
                'users[0][email]': email,
              });
              this.logger.log(`Updated Moodle user ${user.id} profile from '${user.firstname}' to '${firstname} ${lastname}' (${email})`);
            } catch (upErr: any) {
              this.logger.warn(`Could not update user profile in Moodle: ${upErr.message}`);
            }
          }
          return user.id;
        }
      } catch (error) {
        this.logger.warn(`Failed to check if user ${username}/${email} exists: ${error.message}`);
      }
    }

    if (student.fullName && /^\d+$/.test(student.fullName.trim())) {
      this.logger.warn(`Skipping Moodle user creation for purely numeric name: ${student.fullName}`);
      return null;
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
    return result?.[0]?.id || (result?.mock ? 99999 : null);
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

  async enrollTeacher(moodleUserId: string | number, courseId: string | number) {
    const params: any = {
      'enrolments[0][roleid]': 3, // 3 = Editing Teacher
      'enrolments[0][userid]': moodleUserId,
      'enrolments[0][courseid]': courseId,
    };
    try {
      return await this.callMoodle('enrol_manual_enrol_users', params);
    } catch (err: any) {
      this.logger.warn(`Could not enroll teacher ${moodleUserId} in course ${courseId}: ${err.message}`);
    }
  }

  async unenrollTeacher(moodleUserId: string | number, courseId: string | number) {
    const params = {
      'enrolments[0][userid]': moodleUserId,
      'enrolments[0][courseid]': courseId,
      'enrolments[0][roleid]': 3,
    };
    try {
      return await this.callMoodle('enrol_manual_unenrol_users', params);
    } catch (err: any) {
      this.logger.warn(`Could not unenroll teacher ${moodleUserId} from course ${courseId}: ${err.message}`);
    }
  }

  async removeDummyTeachersFromCourse(moodleCourseId: string | number): Promise<number> {
    if (this.isMock || !moodleCourseId) return 0;
    let count = 0;
    try {
      const enrolledUsers = await this.callMoodle('core_enrol_get_enrolled_users', { courseid: moodleCourseId });
      if (Array.isArray(enrolledUsers)) {
        for (const u of enrolledUsers) {
          const isNumericOrDummy = /^\d+$/.test(u.username) || /^\d+(\s+Student)?$/i.test(u.fullname) || u.firstname === 'Student' || u.lastname === 'Student';
          const hasTeacherRole = u.roles && u.roles.some((r: any) => r.roleid === 3 || r.roleid === 4 || r.shortname?.includes('teacher'));
          if (isNumericOrDummy && hasTeacherRole) {
            this.logger.log(`Removing dummy teacher ${u.username} (${u.fullname}, ID ${u.id}) from course ${moodleCourseId}`);
            await this.unenrollTeacher(u.id, moodleCourseId);
            count++;
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`Could not clean dummy teachers from course ${moodleCourseId}: ${e.message}`);
    }
    return count;
  }

  async syncCourseTeacher(
    moodleCourseId: string | number,
    teacher: { name?: string | null; email?: string | null; originalId?: string }
  ): Promise<number | null> {
    if (this.isMock || !moodleCourseId) {
      return null;
    }

    // If teacher is missing, empty, or purely numeric, ensure this course is completely FREE from dummy teachers!
    if (!teacher || !teacher.name || /^\d+$/.test(teacher.name.trim())) {
      this.logger.log(`Course ${moodleCourseId} has no assigned lecturer. Removing any placeholder/numeric teachers...`);
      await this.removeDummyTeachersFromCourse(moodleCourseId);
      return null;
    }

    try {
      let targetEmail = (teacher.email || '').trim().toLowerCase();
      const nameParts = teacher.name.trim().split(/\s+/);
      const firstname = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0];
      const lastname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Lecturer';

      let teacherUserId: number | null = null;

      // 1. Search if the teacher already exists in Moodle by official HTU email
      if (targetEmail && targetEmail.includes('@')) {
        try {
          const byEmail = await this.callMoodle('core_user_get_users_by_field', {
            field: 'email',
            'values[0]': targetEmail
          });
          if (Array.isArray(byEmail) && byEmail.length > 0) {
            teacherUserId = byEmail[0].id;
            this.logger.log(`Found existing Moodle teacher by email ${targetEmail} (ID ${teacherUserId})`);
            if (/^\d+$/.test(byEmail[0].firstname) || byEmail[0].lastname === 'Student') {
              try {
                await this.callMoodle('core_user_update_users', {
                  'users[0][id]': teacherUserId,
                  'users[0][firstname]': firstname,
                  'users[0][lastname]': lastname,
                });
              } catch (e: any) {}
            }
          }
        } catch (e: any) {
          this.logger.warn(`Could not lookup teacher by email ${targetEmail}: ${e.message}`);
        }
      }

      // 2. If not found by email, search by username candidate (email prefix e.g. pmodey)
      if (!teacherUserId && targetEmail) {
        const usernameCandidate = targetEmail.split('@')[0].toLowerCase();
        try {
          const byUsername = await this.callMoodle('core_user_get_users_by_field', {
            field: 'username',
            'values[0]': usernameCandidate
          });
          if (Array.isArray(byUsername) && byUsername.length > 0) {
            teacherUserId = byUsername[0].id;
            this.logger.log(`Found existing Moodle teacher by username ${usernameCandidate} (ID ${teacherUserId})`);
          }
        } catch (e: any) {}
      }

      // 3. If still not found, check if a dummy account was created with originalId (e.g. 1500026)
      if (!teacherUserId && teacher.originalId && /^\d+$/.test(teacher.originalId)) {
        try {
          const byId = await this.callMoodle('core_user_get_users_by_field', {
            field: 'username',
            'values[0]': teacher.originalId.toLowerCase()
          });
          if (Array.isArray(byId) && byId.length > 0) {
            teacherUserId = byId[0].id;
            const updateParams: any = {
              'users[0][id]': teacherUserId,
              'users[0][firstname]': firstname,
              'users[0][lastname]': lastname,
            };
            if (targetEmail) {
              updateParams['users[0][email]'] = targetEmail;
            }
            try {
              await this.callMoodle('core_user_update_users', updateParams);
              this.logger.log(`Updated dummy user ${teacher.originalId} (ID ${teacherUserId}) to '${firstname} ${lastname}'`);
            } catch (err: any) {
              delete updateParams['users[0][email]'];
              await this.callMoodle('core_user_update_users', updateParams);
            }
          }
        } catch (e: any) {}
      }

      // 4. If teacher still does not exist, create them properly with oauth2
      if (!teacherUserId) {
        const newUsername = targetEmail ? targetEmail.split('@')[0].toLowerCase() : (teacher.originalId || 'teacher').toLowerCase();
        const newEmail = targetEmail || `${newUsername}@htu.edu.gh`;
        const createResult = await this.callMoodle('core_user_create_users', {
          'users[0][username]': newUsername,
          'users[0][password]': 'HtuTeacher@2026!',
          'users[0][firstname]': firstname,
          'users[0][lastname]': lastname,
          'users[0][email]': newEmail,
          'users[0][auth]': 'oauth2'
        });
        teacherUserId = createResult?.[0]?.id || null;
      }

      if (!teacherUserId) {
        this.logger.warn(`Could not resolve or create teacher ${teacher.name} for course ${moodleCourseId}`);
        return null;
      }

      // 5. Enroll the real teacher in the course
      await this.enrollTeacher(String(teacherUserId), moodleCourseId);
      this.logger.log(`Enrolled real teacher ${teacher.name} (ID ${teacherUserId}) in course ${moodleCourseId}`);

      // 6. Scan enrolled users in this course and UNENROL any numeric dummy teachers!
      try {
        const enrolledUsers = await this.callMoodle('core_enrol_get_enrolled_users', { courseid: moodleCourseId });
        if (Array.isArray(enrolledUsers)) {
          for (const u of enrolledUsers) {
            if (Number(u.id) !== Number(teacherUserId)) {
              const isNumericOrDummy = /^\d+$/.test(u.username) || /^\d+(\s+Student)?$/i.test(u.fullname) || (teacher.originalId && u.username === teacher.originalId);
              const hasTeacherRole = u.roles && u.roles.some((r: any) => r.roleid === 3 || r.roleid === 4 || r.shortname?.includes('teacher'));
              if (isNumericOrDummy && hasTeacherRole) {
                this.logger.log(`Unenrolling numeric dummy teacher ${u.username} (${u.fullname}, ID ${u.id}) from course ${moodleCourseId}`);
                await this.unenrollTeacher(u.id, moodleCourseId);
              }
            }
          }
        }
      } catch (cleanErr: any) {
        this.logger.warn(`Could not clean up dummy teachers in course ${moodleCourseId}: ${cleanErr.message}`);
      }

      return teacherUserId;
    } catch (error: any) {
      this.logger.error(`Error syncing course teacher for course ${moodleCourseId}: ${error.message}`);
      return null;
    }
  }

  async unenrollStudent(moodleUserId: string, courseIds: (string | number)[]) {
    const params: any = {};
    courseIds.forEach((id, index) => {
      params[`enrolments[${index}][userid]`] = moodleUserId;
      params[`enrolments[${index}][courseid]`] = id;
    });
    return this.callMoodle('enrol_manual_unenrol_users', params);
  }

  private courseIdCache = new Map<string, number>();

  cacheCourseId(shortname: string, id: number) {
    if (!shortname || !id) return;
    this.courseIdCache.set(shortname.trim().toLowerCase(), id);
  }

  async getCourseIdByShortname(shortname: string): Promise<number | null> {
    const key = (shortname || '').trim().toLowerCase();
    if (!key) return null;
    if (this.courseIdCache.has(key)) {
      return this.courseIdCache.get(key)!;
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
      const id = result?.courses?.[0]?.id || null;
      if (id) {
        this.courseIdCache.set(key, id);
      }
      return id;
    } catch (error: any) {
      this.logger.warn(`Could not resolve course ID for shortname ${shortname}: ${error.message}`);
      return null;
    }
  }

  async getUserIdByUsername(username: string): Promise<number | null> {
    if (this.isMock) return null;
    const clean = (username || '').replace(/\s+/g, '').toLowerCase();
    if (!clean) return null;
    try {
      const res = await this.callMoodle('core_user_get_users_by_field', {
        field: 'username',
        'values[0]': clean,
      });
      return res?.[0]?.id || null;
    } catch (err: any) {
      this.logger.warn(`Could not lookup user by username ${clean}: ${err.message}`);
      return null;
    }
  }

  async getUserIdByEmail(email: string): Promise<number | null> {
    if (this.isMock) return null;
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return null;
    try {
      const res = await this.callMoodle('core_user_get_users_by_field', {
        field: 'email',
        'values[0]': clean,
      });
      return res?.[0]?.id || null;
    } catch (err: any) {
      this.logger.warn(`Could not lookup user by email ${clean}: ${err.message}`);
      return null;
    }
  }

  private categoryCache = new Map<string, number>();
  private historicalBlueprintCache = new Map<string, { deptName: string; deptIdNumber: string; facultyName: string; facultyIdNumber: string }>();

  extractBaseCourseSignature(courseCode: string, courseName?: string): { baseCode: string; baseName: string } {
    let baseCode = (courseCode || '').trim();
    // Strip trailing year/semester suffixes like _25/26, _26/27, _2025/2026, _S1, etc.
    baseCode = baseCode.replace(/[_ ]*(?:\d{2}\/\d{2}|\d{4}\/\d{4}|S\d|SEM\s*\d|\(\d{2}\/\d{2}\))$/i, '').trim();

    let baseName = (courseName || '').trim();
    // Strip trailing parenthetical codes like - (DAC211_25/26) or (DAC 211)
    baseName = baseName.replace(/\s*[-–—]?\s*\([A-Za-z0-9_ /–—-]+\)$/i, '').trim();

    return { baseCode, baseName };
  }

  async lookupHistoricalDepartmentBlueprint(baseCode: string, baseName?: string): Promise<{ deptName: string; deptIdNumber: string; facultyName: string; facultyIdNumber: string } | null> {
    if (!baseCode && !baseName) return null;
    const cacheKey = (baseCode || baseName).toUpperCase();
    if (this.historicalBlueprintCache.has(cacheKey)) {
      return this.historicalBlueprintCache.get(cacheKey)!;
    }

    if (this.isMock || !this.baseUrl || !this.token) {
      return null;
    }

    try {
      const candidates: any[] = [];
      if (baseCode) {
        const byCode = await this.callMoodle('core_course_get_courses_by_field', {
          field: 'shortname',
          value: baseCode,
        });
        if (byCode?.courses?.length) candidates.push(...byCode.courses);
      }

      if (!candidates.length && baseCode) {
        const searchRes = await this.callMoodle('core_course_search_courses', {
          criterianame: 'search',
          criteriavalue: baseCode,
          page: 0,
          perpage: 5,
        });
        if (searchRes?.courses?.length) candidates.push(...searchRes.courses);
      }

      for (const course of candidates) {
        if (!course.categoryid) continue;
        const catRes = await this.callMoodle('core_course_get_categories', {
          'criteria[0][key]': 'id',
          'criteria[0][value]': course.categoryid,
        });
        if (Array.isArray(catRes) && catRes.length > 0) {
          const deptCat = catRes[0];
          let facultyCat: any = null;
          if (deptCat.parent > 0) {
            const facRes = await this.callMoodle('core_course_get_categories', {
              'criteria[0][key]': 'id',
              'criteria[0][value]': deptCat.parent,
            });
            if (Array.isArray(facRes) && facRes.length > 0) {
              facultyCat = facRes[0];
            }
          }

          if (deptCat.name && !deptCat.name.toUpperCase().includes('ACADEMIC YEAR')) {
            const blueprint = {
              deptName: deptCat.name.toUpperCase(),
              deptIdNumber: deptCat.idnumber || 'DEPT',
              facultyName: facultyCat ? facultyCat.name.toUpperCase() : 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY',
              facultyIdNumber: facultyCat?.idnumber || 'FAST',
            };
            this.historicalBlueprintCache.set(cacheKey, blueprint);
            this.logger.log(`[BLUEPRINT MATCH] Prior-year placement for "${baseCode}": ${blueprint.deptName} under ${blueprint.facultyName}`);
            return blueprint;
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error during historical blueprint lookup for ${baseCode}: ${err.message}`);
    }

    return null;
  }

  lookupDeptByCourseName(courseName: string): { deptName: string; deptIdNumber: string; facultyName: string; facultyIdNumber: string } | null {
    if (!courseName) return null;
    const upper = courseName.toUpperCase();

    // 1. HTU Business School (HBS)
    if (/BANKING|ACCOUNTING|AUDIT|TAXATION|TAX\b|FINANCIAL|FINANCE\b|TREASURY|PORTFOLIO & INVESTMENT|PORTFOLIO MANAGEMENT|INSURANCE|CREDIT MANAGEMENT/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE',
        deptIdNumber: 'DOAC',
        facultyName: 'HTU BUSINES SCHOOL',
        facultyIdNumber: 'HBS',
      };
    }
    if (/LOGISTICS|SUPPLY CHAIN|PROCUREMENT|WAREHOUSE|SOURCING|PURCHASING|INVENTORY|STORES MANAGEMENT/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF LOGISTICS AND SUPPLY CHAIN MANAGEMENT',
        deptIdNumber: 'DPSC',
        facultyName: 'HTU BUSINES SCHOOL',
        facultyIdNumber: 'HBS',
      };
    }
    if (/MARKETING|BRAND|RETAIL|CONSUMER BEHAVIOUR|SALES MANAGEMENT|SELLING|E-TAILING|ADVERTISING/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF MARKETING',
        deptIdNumber: 'DOMK',
        facultyName: 'HTU BUSINES SCHOOL',
        facultyIdNumber: 'HBS',
      };
    }
    if (/SECRETARIAL|OFFICE TRAINING|TYPEWRITING|DOCUMENT PROCESSING|OFFICE PRACTICE|EXECUTIVE SECRETARIAL/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF MANAGEMENT SCIENCES',
        deptIdNumber: 'DSMS',
        facultyName: 'HTU BUSINES SCHOOL',
        facultyIdNumber: 'HBS',
      };
    }

    // 2. Faculty of Applied Sciences and Technology (FAST)
    if (/PROGRAMMING|SOFTWARE|DATABASE|COMPUTER|DATA SCIENCE|ARTIFICIAL INTELLIGENCE|ALGORITHM|OPERATING SYSTEM|INFORMATION SECURITY|NETWORKING|CYBER|WEB APPLICATION|PYTHON|JAVA|\bC\+\+|COMPUTING|LITERACY|AUTOCAD|CAD CAM|MULTIMEDIA/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF COMPUTER SCIENCE',
        deptIdNumber: 'DOCS',
        facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY',
        facultyIdNumber: 'FAST',
      };
    }
    if (/HOTEL|HOSPITALITY|TOURISM|ACCOMMODATION|COOKERY|FOOD AND BEVERAGE|FRONT OFFICE|CULINARY|RESTAURANT|BAR OPERATION|HOUSEKEEPING|MIXOLOGY|LEISURE|EVENT MANAGEMENT/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF HOSPITALITY AND TOURISM MANAGEMENT',
        deptIdNumber: 'DOHM',
        facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY',
        facultyIdNumber: 'FAST',
      };
    }
    if (/FOOD|BEVERAGE PROCESSING|DAIRY|CEREAL|SENSORY EVALUATION|MEAT SCIENCE|FERMENTATION|FOOD CHEMISTRY|FOOD SAFETY|NUTRITION/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF FOOD SCIENCE AND TECHNOLOGY',
        deptIdNumber: 'DOFT',
        facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY',
        facultyIdNumber: 'FAST',
      };
    }
    if (/STATISTICS|CALCULUS|PROBABILITY|MATHEMATICS|STOCHASTIC|LINEAR ALGEBRA|DIFFERENTIAL EQUATION|QUANTITATIVE|OPERATIONS RESEARCH|DEMOGRAPHY|ENGINEERING MATHEMATICS/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS',
        deptIdNumber: 'DOMS',
        facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY',
        facultyIdNumber: 'FAST',
      };
    }
    if (/AGRO|AGRICULTURAL POTENTIAL|CROPS|SOIL SCIENCE|VEGETABLE|ANIMAL HEALTH|FARM ACCOUNTING|PLANT PHYSIOLOGY|AGRIBUSINESS|AGRONOMY|HORTICULTURE|AQUACULTURE|POSTHARVEST/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF AGRO ENTERPRISE DEVELOPMENT',
        deptIdNumber: 'DOAG',
        facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY',
        facultyIdNumber: 'FAST',
      };
    }

    // 3. Faculty of Engineering (FOE)
    if (/AGRICULTURAL ENGINEERING|FARM POWER|IRRIGATION|SOIL AND WATER CONSERVATION|TRACTOR|AGRICULTURAL MACHINERY/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF AGRICULTURAL ENGINEERING',
        deptIdNumber: 'DOAE',
        facultyName: 'FACULTY OF ENGINEERING',
        facultyIdNumber: 'FOE',
      };
    }
    if (/ELECTRICAL|ELECTRONIC|CIRCUIT|POWER SYSTEM|TELECOMMUNICATION|HIGH VOLTAGE|ROBOTICS|MECHATRONIC|SIGNALS AND SYSTEMS|APPLIED ELECTRICITY/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF ELECTRICAL/ELECTRONIC ENGINEERING',
        deptIdNumber: 'DEEE',
        facultyName: 'FACULTY OF ENGINEERING',
        facultyIdNumber: 'FOE',
      };
    }
    if (/MECHANICAL|INTERNAL COMBUSTION|AUTOMOTIVE|VEHICLE|CHASSIS|THERMODYNAMICS|FLUID MECHANICS|MACHINE DESIGN|METROLOGY|MANUFACTURING TECHNOLOGY|STRENGTH OF MATERIALS|BASIC MECHANICS|ENGINEERING DRAWING|WORKSHOP PRACTICE|PNEUMATICS/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF MECHANICAL ENGINEERING',
        deptIdNumber: 'DOME',
        facultyName: 'FACULTY OF ENGINEERING',
        facultyIdNumber: 'FOE',
      };
    }

    // 4. Faculty of Built & Natural Environment (FBNE)
    if (/CIVIL ENGINEERING|STRUCTURAL|HIGHWAY ENGINEERING|GEOTECHNICAL|WATER SUPPLY|DRAINAGE|HYDRAULICS|CONSTRUCTION TECHNOLOGY/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF CIVIL ENGINEERING',
        deptIdNumber: 'DOCE',
        facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT',
        facultyIdNumber: 'FBNE',
      };
    }
    if (/BUILDING TECHNOLOGY|BUILDING DRAWING|BUILDING MATERIALS|MEASUREMENT OF CONSTRUCTION|ESTIMATING|BUILDING LAW/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF BUILDING TECHNOLOGY',
        deptIdNumber: 'DOBT',
        facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT',
        facultyIdNumber: 'FBNE',
      };
    }
    if (/ARCHITECTURAL|GEO DESIGN|BIM|SPACE PLANNING|FACILITIES MANAGEMENT/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF ARCHITECTURAL TECHNOLOGY',
        deptIdNumber: 'DOAT',
        facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT',
        facultyIdNumber: 'FBNE',
      };
    }
    if (/ENVIRONMENTAL SCIENCE|WASTE MANAGEMENT|ATMOSPHERIC|ENVIRONMENTAL MODELLING|REMEDIATION|POLLUTION/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF ENVIRONMENTAL SCIENCE',
        deptIdNumber: 'DOES',
        facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT',
        facultyIdNumber: 'FBNE',
      };
    }

    // 5. Faculty of Art and Design (FAD)
    if (/FASHION|GARMENT|TEXTILE|PATTERN MAKING|DRAPING|WEAVING|DYEING|MILLINERY|TAILORED|CLOTHING/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF FASHION DESIGN AND TEXTILES',
        deptIdNumber: 'DFDT',
        facultyName: 'FACULTY OF ART AND DESIGN',
        facultyIdNumber: 'FAD',
      };
    }
    if (/CERAMIC|POTTERY|GRAPHIC DESIGN|SCULPTURE|PAINTING|PRINTMAKING|INDUSTRIAL ART|CARVING/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF INDUSTRIAL ART',
        deptIdNumber: 'DIAR',
        facultyName: 'FACULTY OF ART AND DESIGN',
        facultyIdNumber: 'FAD',
      };
    }

    // 6. Faculty of Applied Social Sciences (FASS)
    if (/ECONOMICS|MICROECONOMICS|MACROECONOMICS|ECONOMETRICS|INNOVATION INDICATORS/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF ECONOMICS AND INNOVATION',
        deptIdNumber: 'DEI',
        facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES',
        facultyIdNumber: 'FASS',
      };
    }
    if (/COMMUNICATION SKILLS|MEDIA|JOURNALISM|FRENCH|CHINESE|PUBLIC RELATIONS|COMMUNICATION/i.test(upper)) {
      return {
        deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION',
        deptIdNumber: 'DAML',
        facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES',
        facultyIdNumber: 'FASS',
      };
    }
    if (/AFRICAN STUDIES|CHIEFTAINCY|CULTURE AND DEVELOPMENT|AFRICA IN THE MODERN WORLD/i.test(upper)) {
      return {
        deptName: 'GENERAL COURSES',
        deptIdNumber: 'FASS',
        facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES',
        facultyIdNumber: 'FASS',
      };
    }

    return null;
  }

  async createCourse(courseCode: string, courseName: string, semester?: string, academicYear?: string, programme?: string): Promise<number | null> {
    if (this.isMock) {
      this.logger.log(`[MOCK] Moodle Course Create: ${courseCode} (${courseName})`);
      return 102;
    }
    const categoryId = await this.resolveCategory(courseCode, semester, academicYear, programme, courseName) || this.defaultCategory;
    const nowUnix = Math.floor(Date.now() / 1000);
    const endUnix = nowUnix + (105 * 24 * 60 * 60); // 15 weeks (105 days)

    // Format academic year suffix (e.g., '2025/2026' -> '25/26')
    const yearParts = (academicYear || '2025/2026').split('/');
    const suffix = yearParts.length === 2 
      ? `${yearParts[0].slice(-2)}/${yearParts[1].slice(-2)}` 
      : '25/26';
    
    const formattedShortname = `${courseCode}_${suffix}`;
    const formattedFullname = courseName 
      ? `${courseName} - (${formattedShortname})`
      : formattedShortname;

    const params = {
      'courses[0][fullname]': formattedFullname,
      'courses[0][shortname]': formattedShortname,
      'courses[0][categoryid]': categoryId,
      'courses[0][startdate]': nowUnix,
      'courses[0][enddate]': endUnix,
    };
    try {
      const result = await this.callMoodle('core_course_create_courses', params);
      const newId = result?.[0]?.id || null;
      if (newId) {
        this.cacheCourseId(formattedShortname, newId);
        this.cacheCourseId(courseCode, newId);
      }
      return newId;
    } catch (error) {
      this.logger.error(`Failed to dynamically create course ${courseCode} in Moodle: ${error.message}`);
      throw error;
    }
  }

  async updateCourseCategory(moodleCourseId: number, categoryId: number): Promise<void> {
    try {
      await this.callMoodle('core_course_update_courses', {
        'courses[0][id]': moodleCourseId,
        'courses[0][categoryid]': categoryId,
      });
    } catch (error: any) {
      this.logger.warn(`Failed to update course category for course ID ${moodleCourseId}: ${error.message}`);
    }
  }

  async lookupDeptInfo(courseCode: string, courseName?: string, programme?: string): Promise<{ deptName: string; deptIdNumber: string; facultyName: string; facultyIdNumber: string }> {
    const { baseCode, baseName } = this.extractBaseCourseSignature(courseCode, courseName);

    // Layer 1: Prior-Year Blueprint Mirror (Checks previous course placement on Moodle/cache)
    const blueprint = await this.lookupHistoricalDepartmentBlueprint(baseCode, baseName);
    if (blueprint) return blueprint;

    // Layer 2: Course Name Semantic Matching (Official HTU Catalog)
    const byName = this.lookupDeptByCourseName(baseName || courseName || '');
    if (byName) return byName;

    // Layer 3: Course Code Prefix Matching
    const HTU_DEPARTMENT_MAP: Record<string, { deptName: string; deptIdNumber: string; facultyName: string; facultyIdNumber: string }> = {
      // FAST
      DOAG: { deptName: 'DEPARTMENT OF AGRO ENTERPRISE DEVELOPMENT', deptIdNumber: 'DOAG', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      AED: { deptName: 'DEPARTMENT OF AGRO ENTERPRISE DEVELOPMENT', deptIdNumber: 'DOAG', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      AGR: { deptName: 'DEPARTMENT OF AGRO ENTERPRISE DEVELOPMENT', deptIdNumber: 'DOAG', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      DOCS: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      CS: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      ICT: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      CSD: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      CLT: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      DOFT: { deptName: 'DEPARTMENT OF FOOD SCIENCE AND TECHNOLOGY', deptIdNumber: 'DOFT', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      FST: { deptName: 'DEPARTMENT OF FOOD SCIENCE AND TECHNOLOGY', deptIdNumber: 'DOFT', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      FTCH: { deptName: 'DEPARTMENT OF FOOD SCIENCE AND TECHNOLOGY', deptIdNumber: 'DOFT', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      DOHM: { deptName: 'DEPARTMENT OF HOSPITALITY AND TOURISM MANAGEMENT', deptIdNumber: 'DOHM', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      HTM: { deptName: 'DEPARTMENT OF HOSPITALITY AND TOURISM MANAGEMENT', deptIdNumber: 'DOHM', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      HCIM: { deptName: 'DEPARTMENT OF HOSPITALITY AND TOURISM MANAGEMENT', deptIdNumber: 'DOHM', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      DOMS: { deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS', deptIdNumber: 'DOMS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      MATH: { deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS', deptIdNumber: 'DOMS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      MTH: { deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS', deptIdNumber: 'DOMS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      MAT: { deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS', deptIdNumber: 'DOMS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      STA: { deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS', deptIdNumber: 'DOMS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      STAT: { deptName: 'DEPARTMENT OF MATHEMATICS AND STATISTICS', deptIdNumber: 'DOMS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },

      // FAD
      DFDT: { deptName: 'DEPARTMENT OF FASHION DESIGN AND TEXTILES', deptIdNumber: 'DFDT', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      FDT: { deptName: 'DEPARTMENT OF FASHION DESIGN AND TEXTILES', deptIdNumber: 'DFDT', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      FAS: { deptName: 'DEPARTMENT OF FASHION DESIGN AND TEXTILES', deptIdNumber: 'DFDT', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      TEX: { deptName: 'DEPARTMENT OF FASHION DESIGN AND TEXTILES', deptIdNumber: 'DFDT', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      DIAR: { deptName: 'DEPARTMENT OF INDUSTRIAL ART', deptIdNumber: 'DIAR', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      IART: { deptName: 'DEPARTMENT OF INDUSTRIAL ART', deptIdNumber: 'DIAR', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      CER: { deptName: 'DEPARTMENT OF INDUSTRIAL ART', deptIdNumber: 'DIAR', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },
      GRA: { deptName: 'DEPARTMENT OF INDUSTRIAL ART', deptIdNumber: 'DIAR', facultyName: 'FACULTY OF ART AND DESIGN', facultyIdNumber: 'FAD' },

      // FBNE
      DOBT: { deptName: 'DEPARTMENT OF BUILDING TECHNOLOGY', deptIdNumber: 'DOBT', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      BLD: { deptName: 'DEPARTMENT OF BUILDING TECHNOLOGY', deptIdNumber: 'DOBT', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      CBT: { deptName: 'DEPARTMENT OF BUILDING TECHNOLOGY', deptIdNumber: 'DOBT', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      DOCE: { deptName: 'DEPARTMENT OF CIVIL ENGINEERING', deptIdNumber: 'DOCE', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      CIV: { deptName: 'DEPARTMENT OF CIVIL ENGINEERING', deptIdNumber: 'DOCE', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      CVE: { deptName: 'DEPARTMENT OF CIVIL ENGINEERING', deptIdNumber: 'DOCE', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      DOAT: { deptName: 'DEPARTMENT OF ARCHITECTURAL TECHNOLOGY', deptIdNumber: 'DOAT', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      ARC: { deptName: 'DEPARTMENT OF ARCHITECTURAL TECHNOLOGY', deptIdNumber: 'DOAT', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      DOES: { deptName: 'DEPARTMENT OF ENVIRONMENTAL SCIENCE', deptIdNumber: 'DOES', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },
      ENV: { deptName: 'DEPARTMENT OF ENVIRONMENTAL SCIENCE', deptIdNumber: 'DOES', facultyName: 'FACULTY OF BUILT & NATURAL ENVIRONMENT', facultyIdNumber: 'FBNE' },

      // FOE
      DEEE: { deptName: 'DEPARTMENT OF ELECTRICAL/ELECTRONIC ENGINEERING', deptIdNumber: 'DEEE', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      EEE: { deptName: 'DEPARTMENT OF ELECTRICAL/ELECTRONIC ENGINEERING', deptIdNumber: 'DEEE', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      ELEC: { deptName: 'DEPARTMENT OF ELECTRICAL/ELECTRONIC ENGINEERING', deptIdNumber: 'DEEE', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      DOME: { deptName: 'DEPARTMENT OF MECHANICAL ENGINEERING', deptIdNumber: 'DOME', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      MECH: { deptName: 'DEPARTMENT OF MECHANICAL ENGINEERING', deptIdNumber: 'DOME', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      MEC: { deptName: 'DEPARTMENT OF MECHANICAL ENGINEERING', deptIdNumber: 'DOME', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      AUTO: { deptName: 'DEPARTMENT OF MECHANICAL ENGINEERING', deptIdNumber: 'DOME', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      DOAE: { deptName: 'DEPARTMENT OF AGRICULTURAL ENGINEERING', deptIdNumber: 'DOAE', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      AGE: { deptName: 'DEPARTMENT OF AGRICULTURAL ENGINEERING', deptIdNumber: 'DOAE', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },

      // HBS
      DOAC: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      DAC: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      ACC: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      BACF: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      BNK: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      BANK: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      FIN: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      DOMK: { deptName: 'DEPARTMENT OF MARKETING', deptIdNumber: 'DOMK', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      MKT: { deptName: 'DEPARTMENT OF MARKETING', deptIdNumber: 'DOMK', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      DPSC: { deptName: 'DEPARTMENT OF LOGISTICS AND SUPPLY CHAIN MANAGEMENT', deptIdNumber: 'DPSC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      PROC: { deptName: 'DEPARTMENT OF LOGISTICS AND SUPPLY CHAIN MANAGEMENT', deptIdNumber: 'DPSC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      SCM: { deptName: 'DEPARTMENT OF LOGISTICS AND SUPPLY CHAIN MANAGEMENT', deptIdNumber: 'DPSC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      LOG: { deptName: 'DEPARTMENT OF LOGISTICS AND SUPPLY CHAIN MANAGEMENT', deptIdNumber: 'DPSC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      DSMS: { deptName: 'DEPARTMENT OF MANAGEMENT SCIENCES', deptIdNumber: 'DSMS', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      SMS: { deptName: 'DEPARTMENT OF MANAGEMENT SCIENCES', deptIdNumber: 'DSMS', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      SEC: { deptName: 'DEPARTMENT OF MANAGEMENT SCIENCES', deptIdNumber: 'DSMS', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },

      // FASS
      DEI: { deptName: 'DEPARTMENT OF ECONOMICS AND INNOVATION', deptIdNumber: 'DEI', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      ECO: { deptName: 'DEPARTMENT OF ECONOMICS AND INNOVATION', deptIdNumber: 'DEI', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      ECON: { deptName: 'DEPARTMENT OF ECONOMICS AND INNOVATION', deptIdNumber: 'DEI', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      DAML: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      AML: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      COMM: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      COM: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      COS: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      FRENCH: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      FRN: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      FRE: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      AFRICAN: { deptName: 'GENERAL COURSES', deptIdNumber: 'FASS', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      AFS: { deptName: 'GENERAL COURSES', deptIdNumber: 'FASS', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },

      // SGS
      SGS: { deptName: 'SCHOOL OF GRADUATE STUDIES', deptIdNumber: 'SGS', facultyName: 'SCHOOL OF GRADUATE STUDIES', facultyIdNumber: 'SGS' },
    };

    const cleaned = (baseCode || courseCode).trim().toUpperCase();
    const parts = cleaned.split(/[_ ]+/);
    for (const part of parts) {
      if (HTU_DEPARTMENT_MAP[part]) return HTU_DEPARTMENT_MAP[part];
      const match = part.match(/^([A-Z]+)/);
      if (match && HTU_DEPARTMENT_MAP[match[1]]) return HTU_DEPARTMENT_MAP[match[1]];
    }

    // Layer 4: Programme-level fallback map
    const HTU_PROGRAMME_MAP: Record<string, { deptName: string; deptIdNumber: string; facultyName: string; facultyIdNumber: string }> = {
      BCS: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      BCOMM: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      COMM: { deptName: 'DEPARTMENT OF APPLIED MODERN LANGUAGES & COMMUNICATION', deptIdNumber: 'DAML', facultyName: 'FACULTY OF APPLIED SOCIAL SCIENCES', facultyIdNumber: 'FASS' },
      BFT: { deptName: 'DEPARTMENT OF FOOD SCIENCE AND TECHNOLOGY', deptIdNumber: 'DOFT', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      FTCH: { deptName: 'DEPARTMENT OF FOOD SCIENCE AND TECHNOLOGY', deptIdNumber: 'DOFT', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      BSCS: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      BICT: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      HND: { deptName: 'DEPARTMENT OF COMPUTER SCIENCE', deptIdNumber: 'DOCS', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      BBA: { deptName: 'DEPARTMENT OF MARKETING', deptIdNumber: 'DOMK', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      BACC: { deptName: 'DEPARTMENT OF ACCOUNTING AND FINANCE', deptIdNumber: 'DOAC', facultyName: 'HTU BUSINES SCHOOL', facultyIdNumber: 'HBS' },
      BAGR: { deptName: 'DEPARTMENT OF AGRO ENTERPRISE DEVELOPMENT', deptIdNumber: 'DOAG', facultyName: 'FACULTY OF APPLIED SCIENCES AND TECHNOLOGY', facultyIdNumber: 'FAST' },
      BEE: { deptName: 'DEPARTMENT OF ELECTRICAL/ELECTRONIC ENGINEERING', deptIdNumber: 'DEEE', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
      BME: { deptName: 'DEPARTMENT OF MECHANICAL ENGINEERING', deptIdNumber: 'DOME', facultyName: 'FACULTY OF ENGINEERING', facultyIdNumber: 'FOE' },
    };

    if (programme) {
      const progCleaned = programme.trim().toUpperCase();
      if (HTU_PROGRAMME_MAP[progCleaned]) return HTU_PROGRAMME_MAP[progCleaned];
      const progParts = progCleaned.split(/[\s_]+/);
      for (const p of progParts) {
        if (HTU_PROGRAMME_MAP[p]) return HTU_PROGRAMME_MAP[p];
        const m = p.match(/^([A-Z]+)/);
        if (m && HTU_PROGRAMME_MAP[m[1]]) return HTU_PROGRAMME_MAP[m[1]];
      }
    }

    // Layer 5: Universal Fallback
    return {
      deptName: 'UNIVERSITY WIDE COURSES',
      deptIdNumber: 'UWC',
      facultyName: 'UNIVERSITY WIDE COURSES',
      facultyIdNumber: 'UWC',
    };
  }

  async getOrCreateCategory(idnumber: string, name: string, parentId: number = 0): Promise<number | null> {
    const cacheKey = `${idnumber}_${parentId}`;
    if (this.categoryCache.has(cacheKey)) {
      return this.categoryCache.get(cacheKey)!;
    }

    if (this.isMock) {
      this.logger.log(`[MOCK] Category: "${name}" (${idnumber}) under parent ${parentId}`);
      return 300;
    }

    try {
      // 1. Search by exact idnumber first
      const byIdnumber = await this.callMoodle('core_course_get_categories', {
        'criteria[0][key]': 'idnumber',
        'criteria[0][value]': idnumber,
      });
      if (byIdnumber && Array.isArray(byIdnumber) && byIdnumber.length > 0) {
        const foundId = byIdnumber[0].id;
        this.categoryCache.set(cacheKey, foundId);
        return foundId;
      }

      // 2. Search by name with resilient case & synonym matching
      const byName = await this.callMoodle('core_course_get_categories', {
        'criteria[0][key]': 'name',
        'criteria[0][value]': name,
      });
      if (byName && Array.isArray(byName) && byName.length > 0) {
        const normalizedTarget = name.trim().toUpperCase();
        const match = byName.find((c: any) => 
          c.parent === parentId && c.name && c.name.trim().toUpperCase() === normalizedTarget
        ) || byName.find((c: any) => c.parent === parentId) || byName[0];

        if (match) {
          this.categoryCache.set(cacheKey, match.id);
          return match.id;
        }
      }

      // 2b. Fuzzy synonym check for semesters under this parent
      const upperName = name.trim().toUpperCase();
      if (upperName.includes('SEMESTER ONE') || upperName.includes('SEMESTER 1')) {
        const parentChildren = await this.callMoodle('core_course_get_categories', {
          'criteria[0][key]': 'parent',
          'criteria[0][value]': parentId,
        });
        if (Array.isArray(parentChildren)) {
          const sem1Match = parentChildren.find((c: any) => 
            c.name && (c.name.toUpperCase().includes('SEMESTER ONE') || c.name.toUpperCase().includes('SEMESTER 1') || c.name.toUpperCase().includes('SEM 1'))
          );
          if (sem1Match) {
            this.categoryCache.set(cacheKey, sem1Match.id);
            return sem1Match.id;
          }
        }
      } else if (upperName.includes('SEMESTER TWO') || upperName.includes('SEMESTER 2')) {
        const parentChildren = await this.callMoodle('core_course_get_categories', {
          'criteria[0][key]': 'parent',
          'criteria[0][value]': parentId,
        });
        if (Array.isArray(parentChildren)) {
          const sem2Match = parentChildren.find((c: any) => 
            c.name && (c.name.toUpperCase().includes('SEMESTER TWO') || c.name.toUpperCase().includes('SEMESTER 2') || c.name.toUpperCase().includes('SEM 2'))
          );
          if (sem2Match) {
            this.categoryCache.set(cacheKey, sem2Match.id);
            return sem2Match.id;
          }
        }
      }

      // 3. Create category under parentId if missing
      this.logger.log(`Creating Moodle category: "${name}" (idnumber: ${idnumber}, parent: ${parentId})`);
      const result = await this.callMoodle('core_course_create_categories', {
        'categories[0][name]': name,
        'categories[0][idnumber]': idnumber,
        'categories[0][parent]': parentId,
      });
      const newCatId = result?.[0]?.id || null;
      if (newCatId) {
        this.categoryCache.set(cacheKey, newCatId);
      }
      return newCatId;
    } catch (err: any) {
      this.logger.error(`Error resolving/creating category "${name}": ${err.message}`);
      return null;
    }
  }

  async resolveCategory(courseCode: string, semester?: string, academicYear?: string, programme?: string, courseName?: string): Promise<number | null> {
    const yearStr = academicYear || '2026/2027';
    const semNum = (semester === '2' || semester === 'S2') ? '2' : '1';
    const semName = semNum === '2' ? 'SEMESTER TWO' : 'SEMESTER ONE';
    const semSuffix = semNum === '2' ? 'S2' : 'S1';
    const yearClean = yearStr.replace(/[^0-9]/g, '_');

    // Level 1: Year Category ("2026/2027 ACADEMIC YEAR")
    const l1Idnumber = `AY_${yearClean}`;
    const l1Name = `${yearStr} ACADEMIC YEAR`;
    const l1Id = await this.getOrCreateCategory(l1Idnumber, l1Name, 0);
    if (!l1Id) return this.defaultCategory;

    // Level 2: Semester Category ("SEMESTER ONE" or "SEMESTER TWO")
    const l2Idnumber = `${l1Idnumber}_${semSuffix}`;
    const l2Name = semName;
    const l2Id = await this.getOrCreateCategory(l2Idnumber, l2Name, l1Id);
    if (!l2Id) return l1Id;

    // Level 3: Faculty Category
    const deptInfo = await this.lookupDeptInfo(courseCode, courseName, programme);
    const l3Idnumber = `${l2Idnumber}_${deptInfo.facultyIdNumber}`;
    const l3Name = deptInfo.facultyName;
    const l3Id = await this.getOrCreateCategory(l3Idnumber, l3Name, l2Id);
    if (!l3Id) return l2Id;

    // Level 4: Department Category
    const l4Idnumber = `${l3Idnumber}_${deptInfo.deptIdNumber}`;
    const l4Name = deptInfo.deptName;
    const l4Id = await this.getOrCreateCategory(l4Idnumber, l4Name, l3Id);

    return l4Id || l3Id || l2Id || l1Id;
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

  async realignMoodleCategoriesAndCourses(year?: string, term?: string, specificCatId?: number) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';
    this.logger.log(`Starting Moodle Category Realignment for ${targetYear} Semester ${targetTerm}...`);

    if (this.isMock) {
      return { success: true, movedCourses: 0, cleanedCategories: 0, isMock: true };
    }

    let movedCount = 0;
    let cleanedCatCount = 0;
    const movedDetails: Array<{ id: number; name: string; fromCat: number; toCat: number }> = [];

    try {
      // 1. Fetch all categories from Moodle
      const allCategories = await this.callMoodle('core_course_get_categories', {});
      if (!Array.isArray(allCategories)) {
        return { success: false, error: 'Could not fetch categories from Moodle' };
      }

      // Categories to inspect:
      // A) If specificCatId provided, inspect that category
      // B) Old flat root categories (parent === 0, not ACADEMIC YEAR)
      // C) Any category whose name is "DEPARTMENT OF COMPUTER SCIENCE" (like ID 888) or where courses were dumped
      // D) Any category under the target Academic Year tree that has courses
      const categoriesToInspect: any[] = [];

      if (specificCatId) {
        const cat = allCategories.find((c: any) => c.id === Number(specificCatId));
        if (cat) categoriesToInspect.push(cat);
        else categoriesToInspect.push({ id: Number(specificCatId), name: `Category ${specificCatId}`, parent: 0 });
      } else {
        // Find academic year category (e.g., "2026/2027 ACADEMIC YEAR")
        const ayCat = allCategories.find((c: any) => 
          c.name && c.name.toUpperCase().includes(targetYear) && c.name.toUpperCase().includes('ACADEMIC YEAR')
        );

        // Helper to find all descendant category IDs
        const descendantIds = new Set<number>();
        if (ayCat) {
          descendantIds.add(ayCat.id);
          let added = true;
          while (added) {
            added = false;
            for (const c of allCategories) {
              if (descendantIds.has(c.parent) && !descendantIds.has(c.id)) {
                descendantIds.add(c.id);
                added = true;
              }
            }
          }
        }

        for (const cat of allCategories) {
          const isOldRoot = cat.parent === 0 && 
            !cat.name.toUpperCase().includes('ACADEMIC YEAR') &&
            (cat.name.toUpperCase().startsWith('FAST') || (cat.idnumber && (cat.idnumber.startsWith('FAST_') || cat.idnumber.includes('_S1') || cat.idnumber.includes('_S2'))));
          
          const isDescendant = descendantIds.has(cat.id);
          const isComputerScience = cat.name && cat.name.toUpperCase().includes('COMPUTER SCIENCE');

          if (isOldRoot || isDescendant || isComputerScience) {
            categoriesToInspect.push(cat);
          }
        }
      }

      this.logger.log(`Found ${categoriesToInspect.length} categories on Moodle to inspect for realignment.`);

      // 2. Inspect courses in each candidate category and move misplaced ones
      for (const cat of categoriesToInspect) {
        try {
          const coursesInCat = await this.callMoodle('core_course_get_courses_by_field', {
            field: 'category',
            value: cat.id
          });

          const coursesList = coursesInCat?.courses || [];
          for (const course of coursesList) {
            const courseCode = course.shortname;
            const courseName = course.fullname;
            const targetCatId = await this.resolveCategory(courseCode, targetTerm, targetYear, undefined, courseName);
            if (targetCatId && targetCatId !== cat.id) {
              this.logger.log(`Moving Moodle course "${courseName}" (${courseCode}, ID ${course.id}) from Category ${cat.id} (${cat.name}) to 4-tier Category ${targetCatId}`);
              await this.callMoodle('core_course_update_courses', {
                'courses[0][id]': course.id,
                'courses[0][categoryid]': targetCatId
              });
              movedCount++;
              movedDetails.push({ id: course.id, name: courseName, fromCat: cat.id, toCat: targetCatId });
            }
          }

          // If it was an old root category (parent === 0), try deleting it if now empty
          if (cat.parent === 0 && !cat.name.toUpperCase().includes('ACADEMIC YEAR')) {
            this.logger.log(`Deleting old root category from Moodle: "${cat.name}" (ID ${cat.id})`);
            await this.callMoodle('core_course_delete_categories', {
              'categories[0][id]': cat.id,
              'categories[0][newparent]': 0
            });
            cleanedCatCount++;
          }
        } catch (err: any) {
          this.logger.warn(`Could not realign courses in category "${cat.name}": ${err.message}`);
        }
      }

      return {
        success: true,
        movedCourses: movedCount,
        cleanedCategories: cleanedCatCount,
        movedDetails: movedDetails.slice(0, 50),
        message: `Successfully realigned ${movedCount} courses into their proper 4-tier departments and cleaned ${cleanedCatCount} old root categories on Moodle.`
      };
    } catch (err: any) {
      this.logger.error(`Error during category realignment: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async purgeMoodleLmsCoursesAndCategories() {
    this.logger.log(`Starting full purge of old flat test courses and categories on Moodle LMS...`);
    if (this.isMock) {
      return { success: true, deletedCourses: 0, deletedCategories: 0, isMock: true };
    }

    let deletedCoursesCount = 0;
    let deletedCategoriesCount = 0;

    try {
      const allCategories = await this.callMoodle('core_course_get_categories', {});
      if (!Array.isArray(allCategories)) {
        return { success: false, error: 'Could not fetch categories from Moodle' };
      }

      // Target old flat categories at root level (parent === 0, not ACADEMIC YEAR)
      const targetCategories = allCategories.filter((c: any) => 
        c.parent === 0 &&
        !c.name.toUpperCase().includes('ACADEMIC YEAR') &&
        (c.name.toUpperCase().startsWith('FAST') || (c.idnumber && (c.idnumber.startsWith('FAST_') || c.idnumber.includes('_S1') || c.idnumber.includes('_S2'))))
      );

      this.logger.log(`Found ${targetCategories.length} old flat categories on Moodle to purge.`);

      for (const cat of targetCategories) {
        try {
          const coursesInCat = await this.callMoodle('core_course_get_courses_by_field', {
            field: 'category',
            value: cat.id
          });

          const coursesList = coursesInCat?.courses || [];
          for (const course of coursesList) {
            try {
              this.logger.log(`Deleting Moodle course: "${course.fullname}" (${course.shortname}, ID ${course.id})`);
              await this.callMoodle('core_course_delete_courses', {
                'courseids[0]': course.id
              });
              deletedCoursesCount++;
            } catch (err: any) {
              this.logger.warn(`Could not delete course ID ${course.id}: ${err.message}`);
            }
          }

          // Delete category recursively
          this.logger.log(`Deleting Moodle category: "${cat.name}" (ID ${cat.id})`);
          await this.callMoodle('core_course_delete_categories', {
            'categories[0][id]': cat.id,
            'categories[0][recursive]': 1
          });
          deletedCategoriesCount++;
        } catch (err: any) {
          this.logger.warn(`Could not purge category "${cat.name}": ${err.message}`);
        }
      }

      return {
        success: true,
        deletedCourses: deletedCoursesCount,
        deletedCategories: deletedCategoriesCount,
        message: `Successfully purged ${deletedCoursesCount} test courses and ${deletedCategoriesCount} flat categories from Moodle LMS.`
      };
    } catch (err: any) {
      this.logger.error(`Error during Moodle LMS purge: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  getReportGenerationProgress() {
    return { ...this.reportProgress };
  }

  async triggerBackgroundReportGeneration(year?: string, term?: string) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';

    if (this.reportProgress.isGenerating) {
      return {
        success: true,
        alreadyRunning: true,
        message: 'A report generation task is already in progress.',
        progress: this.reportProgress
      };
    }

    // Trigger asynchronously in background
    setTimeout(() => {
      this.generateAndSaveLmsUsageReport(targetYear, targetTerm).catch(err => {
        this.logger.error(`Background report generation error: ${err.message}`);
        this.reportProgress.isGenerating = false;
        this.reportProgress.error = err.message;
      });
    }, 50);

    return {
      success: true,
      alreadyRunning: false,
      message: 'Background LMS audit initiated.',
      year: targetYear,
      term: targetTerm
    };
  }

  private getSnapshotFilePath(year: string, term: string): string {
    const dir = path.join(process.cwd(), 'report-snapshots');
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    }
    const safeYear = year.replace(/[\/\\:]/g, '-');
    return path.join(dir, `lms_report_${safeYear}_sem${term}.json`);
  }

  async getOrGenerateLmsUsageReport(year?: string, term?: string) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';
    const cacheKey = `${targetYear}_${targetTerm}`;

    // 1. Check in-memory cache
    if (this.reportSnapshotCache.has(cacheKey)) {
      return this.reportSnapshotCache.get(cacheKey);
    }

    // 2. Check disk cache
    const filePath = this.getSnapshotFilePath(targetYear, targetTerm);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.reportSnapshotCache.set(cacheKey, parsed);
        return parsed;
      } catch (err: any) {
        this.logger.warn(`Failed reading snapshot file ${filePath}: ${err.message}`);
      }
    }

    // 3. If currently generating, return progress placeholder
    if (this.reportProgress.isGenerating) {
      return {
        success: true,
        isGenerating: true,
        progress: this.reportProgress,
        data: [],
        summary: null
      };
    }

    // 4. If not found and not generating, generate synchronously or return structured baseline
    return await this.generateAndSaveLmsUsageReport(targetYear, targetTerm);
  }

  async generateAndSaveLmsUsageReport(year?: string, term?: string) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';
    const cacheKey = `${targetYear}_${targetTerm}`;

    this.logger.log(`[ReportEngine] Starting comprehensive LMS report generation for ${targetYear} Semester ${targetTerm}...`);
    this.reportProgress = {
      isGenerating: true,
      progress: 0,
      total: 0,
      currentStep: 'Fetching Moodle course hierarchy and catalog...',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null
    };

    try {
      if (this.isMock) {
        const mockSnapshot = {
          success: true,
          academicYear: targetYear,
          semester: targetTerm,
          generatedAt: new Date().toISOString(),
          isMock: true,
          summary: {
            totalCourses: 787,
            assignedCount: 718,
            unassignedCount: 69,
            complianceRate: 91.2,
            withMaterialsCount: 580,
            materialsAdoptionRate: 73.7,
            withAssessmentsCount: 340,
            assessmentsAdoptionRate: 43.2,
            dormantCount: 145,
            dormantRate: 18.4,
            totalEnrolledUsers: 2573,
            maturity: { gold: 310, silver: 270, bronze: 30, dormant: 147 }
          },
          faculties: [
            { name: 'FACULTY OF APPLIED SCIENCES & TECHNOLOGY', code: 'FAST', totalCourses: 215, assignedCount: 202, complianceRate: 94.0, materialsCount: 680, assessmentsCount: 420, dormantCount: 22, enrolledCount: 920 },
            { name: 'FACULTY OF ENGINEERING', code: 'FOE', totalCourses: 198, assignedCount: 180, complianceRate: 90.9, materialsCount: 540, assessmentsCount: 310, dormantCount: 35, enrolledCount: 840 },
            { name: 'HTU BUSINESS SCHOOL', code: 'BS', totalCourses: 172, assignedCount: 158, complianceRate: 91.9, materialsCount: 490, assessmentsCount: 280, dormantCount: 28, enrolledCount: 710 },
            { name: 'FACULTY OF ART & DESIGN', code: 'FOAD', totalCourses: 120, assignedCount: 105, complianceRate: 87.5, materialsCount: 310, assessmentsCount: 140, dormantCount: 32, enrolledCount: 450 },
            { name: 'FACULTY OF APPLIED SOCIAL SCIENCES', code: 'FASS', totalCourses: 82, assignedCount: 73, complianceRate: 89.0, materialsCount: 210, assessmentsCount: 95, dormantCount: 30, enrolledCount: 320 }
          ],
          departments: [],
          courses: []
        };
        this.reportSnapshotCache.set(cacheKey, mockSnapshot);
        this.reportProgress.isGenerating = false;
        this.reportProgress.progress = 100;
        return mockSnapshot;
      }

      const allCategories = await this.callMoodle('core_course_get_categories', {});
      const allCourses = await this.callMoodle('core_course_get_courses', {});

      if (!Array.isArray(allCategories) || !Array.isArray(allCourses)) {
        throw new Error('Could not fetch Moodle categories or course structure from API');
      }

      // Build Category lookup Map
      const catMap = new Map<number, any>();
      allCategories.forEach(c => catMap.set(c.id, c));

      // Filter target academic year courses (excluding site home course 1)
      const targetCourses: any[] = [];
      for (const course of allCourses) {
        if (course.id === 1) continue;

        let cat = catMap.get(course.categoryid);
        let deptName = 'Uncategorized';
        let facName = 'General Academic';
        let ayName = '';

        while (cat) {
          const upName = cat.name.toUpperCase();
          if (upName.includes('DEPARTMENT') || upName.includes('SCHOOL')) deptName = cat.name;
          if (upName.includes('FACULTY') || upName.includes('BUSINESS SCHOOL')) facName = cat.name;
          if (upName.includes('ACADEMIC YEAR')) ayName = cat.name;
          cat = cat.parent ? catMap.get(cat.parent) : null;
        }

        if (ayName && !ayName.includes(targetYear)) continue;

        targetCourses.push({
          ...course,
          deptName,
          facName,
          ayName,
        });
      }

      const totalTarget = targetCourses.length;
      this.reportProgress.total = totalTarget;
      this.reportProgress.currentStep = `Auditing ${totalTarget} courses with 10-worker concurrent pool...`;
      this.logger.log(`[ReportEngine] Filtered ${totalTarget} courses for ${targetYear}. Starting parallel audit pool...`);

      const reportData: any[] = new Array(totalTarget);
      let completedCount = 0;
      const concurrency = 10;
      let currentIndex = 0;

      const workers = Array.from({ length: Math.min(concurrency, totalTarget) }, async () => {
        while (currentIndex < totalTarget) {
          const idx = currentIndex++;
          const course = targetCourses[idx];

          let materialsCount = 0;
          let assessmentsCount = 0;
          let enrolledCount = 0;
          let teacherName = 'Unassigned';

          // 1. Get Course Contents
          try {
            const contents = await this.callMoodle('core_course_get_contents', { courseid: course.id });
            if (Array.isArray(contents)) {
              for (const section of contents) {
                if (Array.isArray(section.modules)) {
                  for (const mod of section.modules) {
                    const m = (mod.modname || '').toLowerCase();
                    if (['resource', 'folder', 'url', 'page', 'book', 'label', 'file'].includes(m)) materialsCount++;
                    if (['assign', 'quiz', 'forum', 'workshop', 'feedback', 'choice'].includes(m)) assessmentsCount++;
                  }
                }
              }
            }
          } catch (e) {}

          // 2. Get Enrolled Users and Teacher
          try {
            const users = await this.callMoodle('core_enrol_get_enrolled_users', { courseid: course.id });
            if (Array.isArray(users)) {
              enrolledCount = users.length;
              const teacher = users.find((u: any) =>
                u.roles && u.roles.some((r: any) =>
                  r.roleid === 3 || r.roleid === 4 ||
                  (r.shortname && (r.shortname.includes('teacher') || r.shortname.includes('editingteacher')))
                )
              );
              if (teacher) {
                const cleanName = (teacher.fullname || '').trim();
                // Flag numeric placeholders as unassigned
                if (/^\d+(\s+Student)?$/i.test(cleanName)) {
                  teacherName = 'Unassigned';
                } else {
                  teacherName = cleanName;
                }
              }
            }
          } catch (e) {}

          let maturityTier = 'DORMANT';
          if (materialsCount > 0 && assessmentsCount > 0) {
            maturityTier = 'GOLD';
          } else if (materialsCount > 0 && assessmentsCount === 0) {
            maturityTier = 'SILVER';
          } else if (materialsCount === 0 && assessmentsCount > 0) {
            maturityTier = 'BRONZE';
          }

          reportData[idx] = {
            id: course.id,
            faculty: course.facName,
            department: course.deptName,
            courseName: course.fullname,
            courseCode: course.shortname,
            lecturer: teacherName,
            isAssigned: teacherName !== 'Unassigned' && teacherName !== 'N/A' && !/^\d+$/.test(teacherName),
            studentsEnrolled: enrolledCount,
            materialsCount,
            assessmentsCount,
            hasMaterials: materialsCount > 0 ? 'YES' : 'NO',
            hasAssessments: assessmentsCount > 0 ? 'YES' : 'NO',
            maturityTier, // GOLD, SILVER, BRONZE, DORMANT
          };

          completedCount++;
          if (completedCount % 25 === 0 || completedCount === totalTarget) {
            this.reportProgress.progress = completedCount;
            this.reportProgress.updatedAt = new Date().toISOString();
          }
        }
      });

      await Promise.all(workers);

      // Compute Aggregations
      const totalCourses = reportData.length;
      let assignedCount = 0;
      let withMaterialsCount = 0;
      let withAssessmentsCount = 0;
      let dormantCount = 0;
      let totalEnrolledUsers = 0;
      const maturity = { gold: 0, silver: 0, bronze: 0, dormant: 0 };

      const facultyMap = new Map<string, any>();
      const deptMap = new Map<string, any>();

      for (const row of reportData) {
        if (row.isAssigned) assignedCount++;
        if (row.materialsCount > 0) withMaterialsCount++;
        if (row.assessmentsCount > 0) withAssessmentsCount++;
        if (row.maturityTier === 'DORMANT') dormantCount++;
        totalEnrolledUsers += row.studentsEnrolled || 0;

        if (row.maturityTier === 'GOLD') maturity.gold++;
        else if (row.maturityTier === 'SILVER') maturity.silver++;
        else if (row.maturityTier === 'BRONZE') maturity.bronze++;
        else maturity.dormant++;

        // Faculty Aggregation
        const facKey = row.faculty || 'Unknown Faculty';
        if (!facultyMap.has(facKey)) {
          facultyMap.set(facKey, {
            name: facKey,
            totalCourses: 0,
            assignedCount: 0,
            materialsCount: 0,
            assessmentsCount: 0,
            dormantCount: 0,
            enrolledCount: 0,
          });
        }
        const facObj = facultyMap.get(facKey);
        facObj.totalCourses++;
        if (row.isAssigned) facObj.assignedCount++;
        facObj.materialsCount += row.materialsCount;
        facObj.assessmentsCount += row.assessmentsCount;
        if (row.maturityTier === 'DORMANT') facObj.dormantCount++;
        facObj.enrolledCount += row.studentsEnrolled;

        // Department Aggregation
        const deptKey = row.department || 'Uncategorized';
        if (!deptMap.has(deptKey)) {
          deptMap.set(deptKey, {
            name: deptKey,
            faculty: facKey,
            totalCourses: 0,
            assignedCount: 0,
            materialsCount: 0,
            assessmentsCount: 0,
            dormantCount: 0,
            enrolledCount: 0,
          });
        }
        const deptObj = deptMap.get(deptKey);
        deptObj.totalCourses++;
        if (row.isAssigned) deptObj.assignedCount++;
        deptObj.materialsCount += row.materialsCount;
        deptObj.assessmentsCount += row.assessmentsCount;
        if (row.maturityTier === 'DORMANT') deptObj.dormantCount++;
        deptObj.enrolledCount += row.studentsEnrolled;
      }

      const faculties = Array.from(facultyMap.values()).map(f => ({
        ...f,
        complianceRate: f.totalCourses > 0 ? Number(((f.assignedCount / f.totalCourses) * 100).toFixed(1)) : 0,
        avgMaterials: f.totalCourses > 0 ? Number((f.materialsCount / f.totalCourses).toFixed(1)) : 0,
        avgAssessments: f.totalCourses > 0 ? Number((f.assessmentsCount / f.totalCourses).toFixed(1)) : 0,
      })).sort((a, b) => b.totalCourses - a.totalCourses);

      const departments = Array.from(deptMap.values()).map(d => ({
        ...d,
        complianceRate: d.totalCourses > 0 ? Number(((d.assignedCount / d.totalCourses) * 100).toFixed(1)) : 0,
      })).sort((a, b) => b.totalCourses - a.totalCourses);

      const summary = {
        totalCourses,
        assignedCount,
        unassignedCount: totalCourses - assignedCount,
        complianceRate: totalCourses > 0 ? Number(((assignedCount / totalCourses) * 100).toFixed(1)) : 0,
        withMaterialsCount,
        materialsAdoptionRate: totalCourses > 0 ? Number(((withMaterialsCount / totalCourses) * 100).toFixed(1)) : 0,
        withAssessmentsCount,
        assessmentsAdoptionRate: totalCourses > 0 ? Number(((withAssessmentsCount / totalCourses) * 100).toFixed(1)) : 0,
        dormantCount,
        dormantRate: totalCourses > 0 ? Number(((dormantCount / totalCourses) * 100).toFixed(1)) : 0,
        totalEnrolledUsers,
        maturity
      };

      const finalSnapshot = {
        success: true,
        academicYear: targetYear,
        semester: targetTerm,
        generatedAt: new Date().toISOString(),
        summary,
        faculties,
        departments,
        courses: reportData,
      };

      // Save to memory cache
      this.reportSnapshotCache.set(cacheKey, finalSnapshot);

      // Persist to disk
      try {
        const filePath = this.getSnapshotFilePath(targetYear, targetTerm);
        fs.writeFileSync(filePath, JSON.stringify(finalSnapshot), 'utf-8');
        this.logger.log(`[ReportEngine] Report snapshot written to ${filePath}`);
      } catch (err: any) {
        this.logger.error(`[ReportEngine] Failed saving snapshot to disk: ${err.message}`);
      }

      this.reportProgress.isGenerating = false;
      this.reportProgress.currentStep = 'Completed';
      this.reportProgress.updatedAt = new Date().toISOString();
      this.logger.log(`[ReportEngine] LMS Usage Report generated successfully for ${totalCourses} courses!`);

      return finalSnapshot;
    } catch (err: any) {
      this.reportProgress.isGenerating = false;
      this.reportProgress.error = err.message;
      this.reportProgress.currentStep = 'Failed';
      this.logger.error(`Error generating report: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async getComprehensiveUsageReport(year?: string, term?: string) {
    const report = await this.getOrGenerateLmsUsageReport(year, term);
    if (!report.success) return report;
    return {
      success: true,
      data: report.courses || report.data || [],
      summary: report.summary,
      faculties: report.faculties,
      departments: report.departments,
      generatedAt: report.generatedAt,
      isGenerating: report.isGenerating || false
    };
  }

  async getUserCourses(userid: string | number) {
    if (!userid) return [];
    if (this.isMock) {
      return [{ id: 101, shortname: 'MOCK101', fullname: 'Mock Course 101' }];
    }
    try {
      const courses = await this.callMoodle('core_enrol_get_users_courses', { userid });
      if (Array.isArray(courses)) {
        return courses.map((c: any) => ({
          id: c.id,
          shortname: c.shortname,
          fullname: c.fullname,
          enrolledusercount: c.enrolledusercount
        }));
      }
      return [];
    } catch (err: any) {
      this.logger.warn(`Failed to fetch courses for Moodle User ${userid}: ${err.message}`);
      return [];
    }
  }
}

