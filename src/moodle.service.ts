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

  async unenrollStudent(moodleUserId: string, courseIds: (string | number)[]) {
    const params: any = {};
    courseIds.forEach((id, index) => {
      params[`enrolments[${index}][userid]`] = moodleUserId;
      params[`enrolments[${index}][courseid]`] = id;
    });
    return this.callMoodle('enrol_manual_unenrol_users', params);
  }

  async getCourseIdByShortname(shortname: string): Promise<number | null> {
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
    if (/PROGRAMMING|SOFTWARE|DATABASE|COMPUTER|DATA SCIENCE|ARTIFICIAL INTELLIGENCE|ALGORITHM|OPERATING SYSTEM|INFORMATION SECURITY|NETWORKING|CYBER|WEB APPLICATION|PYTHON|JAVA|\bC\+\+|COMPUTING|LITERACY/i.test(upper)) {
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
    if (/STATISTICS|CALCULUS|PROBABILITY|MATHEMATICS|STOCHASTIC|LINEAR ALGEBRA|DIFFERENTIAL EQUATION|QUANTITATIVE|OPERATIONS RESEARCH|DEMOGRAPHY/i.test(upper)) {
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
    if (/MECHANICAL|INTERNAL COMBUSTION|AUTOMOTIVE|VEHICLE|CHASSIS|THERMODYNAMICS|FLUID MECHANICS|MACHINE DESIGN|METROLOGY|MANUFACTURING TECHNOLOGY/i.test(upper)) {
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
      return result?.[0]?.id || null;
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
}
