import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MoodleService } from './moodle.service';
import axios from 'axios';
import * as https from 'https';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student, StudentState } from './student.entity';
import { OnboardingService } from './onboarding.service';
import { MountedCourse } from './mounted-course.entity';
import { MISSED_STUDENTS } from './missed-admissions.data';

@Injectable()
export class SoisService {
  private readonly logger = new Logger(SoisService.name);
  private readonly soisUrl = 'https://app.htu.edu.gh/sois/ilo_details.php';
  private readonly token: string;

  constructor(
    private configService: ConfigService,
    private moodleService: MoodleService,
    private onboardingService: OnboardingService,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(MountedCourse)
    private mountedCourseRepo: Repository<MountedCourse>,
  ) {
    this.token = this.configService.get<string>('SOIS_API_KEY') || 'Ahfq749djs97ww8hS72ks7w393y8s7Ysvjka';
  }

  async syncMountedCourses(year?: string, term?: string) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';

    this.logger.log(`Syncing mounted courses from SOIS: year=${targetYear}, term=${targetTerm}`);

    const params = new URLSearchParams();
    params.append('token', this.token);
    params.append('year', targetYear);
    params.append('term', targetTerm);
    params.append('action', 'mounted_courses');

    let coursesList: any[] = [];
    let rawSoisSnippet: any = null;

    try {
      const response = await axios.post(this.soisUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 20000,
      });

      let data = response.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }

      rawSoisSnippet = typeof data === 'object'
        ? JSON.stringify(data).slice(0, 400)
        : String(data).slice(0, 400);

      coursesList = Array.isArray(data) ? data : (data?.data || data?.courses || data?.result || []);
      this.logger.log(`SOIS returned ${coursesList.length} mounted courses for ${targetYear} Semester ${targetTerm}`);
    } catch (err: any) {
      this.logger.error(`SOIS request failed: ${err.message}`);
      return {
        success: false,
        totalFetched: 0,
        coursesCreated: 0,
        coursesExisting: 0,
        failed: 0,
        year: targetYear,
        term: targetTerm,
        soisDiag: `SOIS request error: ${err.message}`,
      };
    }


    let createdCount = 0;
    let existingCount = 0;
    let failedCount = 0;
    const validCourseCodes: string[] = [];

    for (const item of coursesList) {
      const courseCode = (item.coursecode || item.course_code || item.code || item.courseCode || item.course_id || '').trim();
      const courseName = (item.course || item.course_name || item.title || item.courseName || courseCode).trim();
      const lecturerName = (item.lecturer || item.lecturer_name || item.teacher || item.instructor || '').trim() || null;
      const lecturerEmail = (item.lecturer_email || item.teacher_email || '').trim() || null;
      const level = String(item.level || item.year_group || '100');
      const programme = (item.programme || item.program || item.department || '').trim() || null;

      if (!courseCode) continue;

      try {
        const targetCategoryIdNumber = `AY_${targetYear.replace(/[^0-9]/g, '_')}_S${targetTerm}`;
        
        // Try the new formatted shortname first (e.g. AED 103_25/26)
        const yearParts = (targetYear || '2025/2026').split('/');
        const suffix = yearParts.length === 2 ? `${yearParts[0].slice(-2)}/${yearParts[1].slice(-2)}` : '25/26';
        const formattedShortname = `${courseCode}_${suffix}`;
        
        let moodleCourseId = await this.moodleService.getCourseIdByShortname(formattedShortname);
        
        // Fallback to legacy shortname (just courseCode)
        if (!moodleCourseId) {
            moodleCourseId = await this.moodleService.getCourseIdByShortname(courseCode);
        }

        if (!moodleCourseId) {
          this.logger.log(`Creating on Moodle: ${courseCode} (${targetYear} Semester ${targetTerm})`);
          moodleCourseId = await this.moodleService.createCourse(courseCode, courseName, targetTerm, targetYear, programme);
          if (moodleCourseId) createdCount++;
          else failedCount++;
        } else {
          existingCount++;
          // Also update the category of existing courses to correct placement
          try {
            const correctCategoryId = await this.moodleService.resolveCategory(courseCode, targetTerm, targetYear, programme, courseName);
            if (correctCategoryId) {
              await this.moodleService.updateCourseCategory(moodleCourseId, correctCategoryId);
              this.logger.log(`Updated category for existing course ${courseCode} (ID ${moodleCourseId}) to category ${correctCategoryId}`);
            }
          } catch (catErr: any) {
            this.logger.warn(`Could not update category for ${courseCode}: ${catErr.message}`);
          }
        }

        let record = await this.mountedCourseRepo.findOne({ where: { courseCode } as any });
        if (!record) {
          record = this.mountedCourseRepo.create({
            courseCode, courseName, lecturerName, lecturerEmail,
            academicYear: targetYear, semester: targetTerm, level, programme,
            targetCategoryIdNumber, moodleCourseId: moodleCourseId || null,
            isSyncedToMoodle: !!moodleCourseId,
          });
        } else {
          record.courseName = courseName;
          record.lecturerName = lecturerName;
          record.lecturerEmail = lecturerEmail;
          record.academicYear = targetYear;
          record.semester = targetTerm;
          record.level = level;
          record.programme = programme;
          record.targetCategoryIdNumber = targetCategoryIdNumber;
          record.moodleCourseId = moodleCourseId || record.moodleCourseId;
          record.isSyncedToMoodle = !!(moodleCourseId || record.moodleCourseId);
        }
        await this.mountedCourseRepo.save(record);
        validCourseCodes.push(courseCode);
      } catch (err) {
        this.logger.error(`Error syncing course ${courseCode}: ${err.message}`);
        failedCount++;
      }
    }

    // Purge stale records for this target semester that were NOT returned by SOIS
    if (validCourseCodes.length > 0) {
      try {
        const allSemesterRecords = await this.mountedCourseRepo.find({
          where: { academicYear: targetYear, semester: targetTerm }
        });
        const staleRecords = allSemesterRecords.filter(r => !validCourseCodes.includes(r.courseCode));
        if (staleRecords.length > 0) {
          this.logger.log(`Cleaning up ${staleRecords.length} stale un-mounted course records for ${targetYear} Semester ${targetTerm}`);
          await this.mountedCourseRepo.remove(staleRecords);
        }
      } catch (e: any) {
        this.logger.warn(`Stale course cleanup warning: ${e.message}`);
      }
    }

    return {
      success: true,
      totalFetched: coursesList.length,
      coursesCreated: createdCount,
      coursesExisting: existingCount,
      failed: failedCount,
      year: targetYear,
      term: targetTerm,
      soisDiag: coursesList.length === 0
        ? `SOIS returned 0 records for ${targetYear} Semester ${targetTerm}. Raw response: ${rawSoisSnippet}`
        : `Fetched ${coursesList.length} mounted courses for ${targetYear} Semester ${targetTerm}`,
    };
  }

  async clearMountedCourses(year?: string, term?: string) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';
    try {
      const records = await this.mountedCourseRepo.find({
        where: { academicYear: targetYear, semester: targetTerm }
      });
      const count = records.length;
      await this.mountedCourseRepo.remove(records);
      return { success: true, clearedCount: count, year: targetYear, term: targetTerm };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }


  async getMountedCourses(year?: string, term?: string) {
    const targetYear = year || '2026/2027';
    const targetTerm = term || '1';

    try {
      const where: any = {};
      if (targetYear) where.academicYear = targetYear;
      if (targetTerm) where.semester = targetTerm;

      const records = await this.mountedCourseRepo.find({
        where,
        order: { courseCode: 'ASC' },
      });

      return {
        success: true,
        year: targetYear,
        term: targetTerm,
        courses: records.map(r => ({
          courseCode: r.courseCode,
          courseName: r.courseName,
          lecturerName: r.lecturerName,
          lecturerEmail: r.lecturerEmail,
          level: r.level,
          programme: r.programme,
          categoryNumber: r.targetCategoryIdNumber,
          moodleCourseId: r.moodleCourseId,
          isSynced: r.isSyncedToMoodle,
          createdAt: r.createdAt,
        })),
      };
    } catch (error) {
      this.logger.error(`Error reading mounted courses from DB: ${error.message}`);
      return { success: false, courses: [], error: error.message };
    }
  }

  /** Calls SOIS with multiple year/term formats and returns all raw responses for diagnosis */
  async debugRawSoisResponse(year?: string, term?: string) {
    const targetTerm = term || '1';

    // Try several year formats SOIS might accept
    const yearVariants = [
      year || '2026/2027',
      '2026/2027',
      '2026-2027',
      '2026',
      '26',
    ];

    const results: any[] = [];

    for (const y of yearVariants) {
      const params = new URLSearchParams();
      params.append('token', this.token);
      params.append('year', y);
      params.append('term', targetTerm);
      params.append('action', 'mounted_courses');

      try {
        const response = await axios.post(this.soisUrl, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 10000,
        });

        const raw = response.data;
        let parsed: any = raw;
        if (typeof raw === 'string') {
          try { parsed = JSON.parse(raw); } catch (e) { parsed = raw.slice(0, 500); }
        }

        const list = Array.isArray(parsed) ? parsed : (parsed?.data || parsed?.courses || []);
        results.push({
          yearSent: y,
          termSent: targetTerm,
          httpStatus: response.status,
          recordsFound: Array.isArray(list) ? list.length : 'N/A',
          firstRecord: Array.isArray(list) && list.length > 0 ? list[0] : null,
          rawType: typeof raw,
          rawSnippet: typeof raw === 'string' ? raw.slice(0, 300) : null,
          parsedKeys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : null,
        });
      } catch (err) {
        results.push({ yearSent: y, termSent: targetTerm, error: err.message });
      }
    }

    return { debug: true, results };
  }

  async syncAdmittedStudents(year?: string, term?: string, actionName?: string) {
    const targetYear = year || '2025/2026';
    const targetTerm = term || '1';
    const action = actionName || 'admitted_students';

    this.logger.log(`Fetching admitted students from SOIS endpoint: action=${action}, year=${targetYear}, term=${targetTerm}`);

    const params = new URLSearchParams();
    params.append('token', this.token);
    params.append('year', targetYear);
    params.append('term', targetTerm);
    params.append('action', action);

    try {
      const response = await axios.post(this.soisUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 25000,
      });

      let responseData = response.data;
      if (typeof responseData === 'string') {
        try { responseData = JSON.parse(responseData); } catch (e) {}
      }

      const studentsList = Array.isArray(responseData) 
        ? responseData 
        : (responseData?.data || responseData?.students || []);

      this.logger.log(`Received ${studentsList.length} student records from SOIS.`);

      let newAdmittedCount = 0;
      let onboardedCount = 0;
      let existingCount = 0;
      let failedCount = 0;

      for (const item of studentsList) {
        const indexNumber = (item.indexNumber || item.index_number || item.indexno || '').replace(/\s+/g, '');
        const admissionId = (item.admissionId || item.admission_id || item.app_no || indexNumber).replace(/\s+/g, '');
        const fullName = (item.fullName || item.full_name || item.name || 'Student').trim();
        const programme = item.programme || item.program || item.course || '';
        const level = String(item.level || item.year || '100');
        const phone = item.phone || item.mobile || item.telephone || '';
        const email = item.email || item.personal_email || '';

        if (!indexNumber && !admissionId) continue;

        try {
          const whereConditions: any[] = [];
          if (indexNumber) whereConditions.push({ indexNumber });
          if (admissionId) whereConditions.push({ admissionId });

          if (whereConditions.length === 0) continue;

          let student = await this.studentRepo.findOne({
            where: whereConditions
          });

          if (!student) {
            student = this.studentRepo.create({
              indexNumber,
              admissionId,
              fullName,
              programme,
              level,
              phone,
              email,
              state: StudentState.ADMITTED,
              paymentPercentage: 0,
            });
            await this.studentRepo.save(student);
            newAdmittedCount++;

            // Trigger immediate automated onboarding for past student!
            this.logger.log(`Onboarding uncaptured past student: ${fullName} (${indexNumber})`);
            await this.onboardingService.onboardStudent(student);
            onboardedCount++;
          } else {
            existingCount++;
            // If student exists but hasn't completed onboarding / Moodle account, finish onboarding!
            if (!student.moodleAccountCreated || student.state !== StudentState.ACTIVE) {
              await this.onboardingService.onboardStudent(student);
              onboardedCount++;
            }
          }
        } catch (err) {
          this.logger.error(`Error processing student ${indexNumber}: ${err.message}`);
          failedCount++;
        }
      }

      return {
        success: true,
        totalFetched: studentsList.length,
        newStudentsAdmitted: newAdmittedCount,
        studentsOnboarded: onboardedCount,
        alreadyExisted: existingCount,
        failed: failedCount,
      };
    } catch (error: any) {
      this.logger.error(`Failed to pull admitted students from SOIS: ${error.message}`);
      return {
        success: false,
        message: `SOIS request failed: ${error.message}`,
        totalFetched: 0,
        newStudentsAdmitted: 0,
        studentsOnboarded: 0,
        alreadyExisted: 0,
        failed: 0,
      };
    }
  }

  async reconcileAdmissions(year?: string, term?: string) {
    const targetYear = year || '2025/2026';
    const targetTerm = term || '1';

    const params = new URLSearchParams();
    params.append('token', this.token);
    params.append('year', targetYear);
    params.append('term', targetTerm);
    params.append('action', 'admitted_students');

    let soisList: any[] = [];
    let errorMsg: string | null = null;

    try {
      const response = await axios.post(this.soisUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 25000,
      });

      let responseData = response.data;
      if (typeof responseData === 'string') {
        try { responseData = JSON.parse(responseData); } catch (e) {}
      }

      soisList = Array.isArray(responseData) 
        ? responseData 
        : (responseData?.data || responseData?.students || []);
    } catch (err: any) {
      errorMsg = err.message;
      this.logger.error(`Failed to pull admitted students for reconciliation: ${err.message}`);
    }

    const dbStudents = await this.studentRepo.find({
      select: ['id', 'indexNumber', 'admissionId', 'fullName', 'state', 'moodleAccountCreated']
    });

    const dbIndexSet = new Set<string>();
    dbStudents.forEach(s => {
      if (s.indexNumber) dbIndexSet.add(s.indexNumber.trim().toLowerCase());
      if (s.admissionId) dbIndexSet.add(s.admissionId.trim().toLowerCase());
    });

    const uncaptured: any[] = [];
    const alreadyCaptured: any[] = [];

    const safeList = Array.isArray(soisList) ? soisList : [];
    for (const item of safeList) {
      const idx = (item.indexNumber || item.index_number || item.indexno || '').replace(/\s+/g, '').toLowerCase();
      const adm = (item.admissionId || item.admission_id || item.app_no || '').replace(/\s+/g, '').toLowerCase();

      if (!idx && !adm) continue;

      if (dbIndexSet.has(idx) || dbIndexSet.has(adm)) {
        alreadyCaptured.push(item);
      } else {
        uncaptured.push({
          indexNumber: item.indexNumber || item.index_number || idx,
          admissionId: item.admissionId || item.admission_id || adm,
          fullName: item.fullName || item.full_name || item.name || 'Unknown',
          programme: item.programme || item.program || '',
          level: String(item.level || '100'),
        });
      }
    }

    return {
      success: !errorMsg,
      soisError: errorMsg,
      query: { year: targetYear, term: targetTerm },
      summary: {
        totalSoisAdmissionsReturned: soisList.length,
        totalAbsDatabaseStudents: dbStudents.length,
        alreadyCapturedCount: alreadyCaptured.length,
        uncapturedAdmissionsCount: uncaptured.length,
      },
      uncapturedAdmissionsList: uncaptured,
    };
  }

  async importMissedAdmissions(customList?: any[]) {
    const listToImport = (customList && customList.length > 0) ? customList : MISSED_STUDENTS;

    if (!listToImport || listToImport.length === 0) {
      return { success: false, message: 'No student records provided for import.' };
    }

    this.logger.log(`Starting bulk import of ${listToImport.length} missed admission students...`);

    let newCount = 0;
    let existingCount = 0;
    let onboardedCount = 0;
    let failedCount = 0;

    for (const item of listToImport) {
      const indexNumber = (item.indexNumber || item.index_number || '').trim();
      const admissionId = (item.admissionId || item.admission_id || indexNumber).trim();
      const fullName = (item.fullName || item.full_name || 'Student').trim();
      const programme = (item.programme || item.program || '').trim();
      const level = String(item.level || '100').trim();

      if (!indexNumber && !admissionId) continue;

      try {
        const whereConditions: any[] = [];
        if (indexNumber) whereConditions.push({ indexNumber });
        if (admissionId) whereConditions.push({ admissionId });

        if (whereConditions.length === 0) continue;

        let student = await this.studentRepo.findOne({
          where: whereConditions
        });

        if (!student) {
          student = this.studentRepo.create({
            indexNumber,
            admissionId,
            fullName,
            programme,
            level,
            state: StudentState.ADMITTED,
            paymentPercentage: 100, // Pre-admitted student
          });
          await this.studentRepo.save(student);
          newCount++;

          // Auto-onboard immediately
          try {
            await this.onboardingService.onboardStudent(student);
            onboardedCount++;
          } catch (e) {
            this.logger.warn(`Onboarding deferred for ${fullName}: ${e.message}`);
          }
        } else {
          existingCount++;
          // If existing student hasn't completed onboarding, finish it
          if (!student.moodleAccountCreated || student.state !== StudentState.ACTIVE) {
            try {
              await this.onboardingService.onboardStudent(student);
              onboardedCount++;
            } catch (e) {}
          }
        }
      } catch (err) {
        this.logger.error(`Failed to import student ${indexNumber}: ${err.message}`);
        failedCount++;
      }
    }

    return {
      success: true,
      totalImported: listToImport.length,
      newStudentsAdded: newCount,
      alreadyExisted: existingCount,
      studentsOnboarded: onboardedCount,
      failed: failedCount,
    };
  }

  async debugSoisConnection(actionParam?: string, yearParam?: string, termParam?: string) {
    const targetYear = yearParam || '2026/2027';
    const targetTerm = termParam || '1';

    if (actionParam) {
      const params = new URLSearchParams();
      params.append('token', this.token);
      params.append('year', targetYear);
      params.append('term', targetTerm);
      params.append('action', actionParam);

      try {
        const response = await axios.post(this.soisUrl, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 15000,
        });
        return {
          testedAction: actionParam,
          testedYear: targetYear,
          status: response.status,
          rawType: typeof response.data,
          data: response.data,
        };
      } catch (err: any) {
        return { testedAction: actionParam, error: err.message };
      }
    }

    const headerVariants = [
      { name: 'POST body token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, params: { token: this.token } },
      { name: 'Header Authorization Bearer', headers: { Authorization: `Bearer ${this.token}` }, params: {} },
      { name: 'Header Authorization Raw', headers: { Authorization: this.token }, params: {} },
      { name: 'Header X-API-Key', headers: { 'X-API-Key': this.token }, params: {} },
      { name: 'Header X-Token', headers: { 'X-Token': this.token }, params: {} },
      { name: 'Header Token', headers: { Token: this.token }, params: {} },
      { name: 'GET query token', isGet: true, headers: {}, params: { token: this.token } },
    ];

    const candidateActions = ['mounted_courses', 'admitted_students', 'courses'];
    const candidateYears = [targetYear, '2025/2026'];

    const summary: any[] = [];

    for (const variant of headerVariants) {
      for (const act of candidateActions) {
        for (const yr of candidateYears) {
          const searchParams = new URLSearchParams();
          searchParams.append('year', yr);
          searchParams.append('term', targetTerm);
          searchParams.append('action', act);
          if (variant.params.token) {
            searchParams.append('token', variant.params.token);
          }

          try {
            let response: any;
            if (variant.isGet) {
              response = await axios.get(`${this.soisUrl}?${searchParams.toString()}`, {
                headers: { ...variant.headers },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                timeout: 8000,
              });
            } else {
              response = await axios.post(this.soisUrl, searchParams, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...variant.headers },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                timeout: 8000,
              });
            }

            let data = response.data;
            if (typeof data === 'string') {
              try { data = JSON.parse(data); } catch (e) {}
            }
            const isArr = Array.isArray(data);
            const count = isArr ? data.length : (data?.data?.length || data?.courses?.length || 0);

            summary.push({
              authStyle: variant.name,
              action: act,
              year: yr,
              httpStatus: response.status,
              recordsFound: count,
              dataType: typeof data,
              sample: isArr && data.length > 0 ? data[0] : (typeof data === 'object' ? Object.keys(data) : String(data).slice(0, 150)),
            });
          } catch (err: any) {
            summary.push({ authStyle: variant.name, action: act, year: yr, error: err.message });
          }
        }
      }
    }

    return {
      endpointUrl: this.soisUrl,
      currentToken: this.token,
      results: summary,
    };
  }
}
