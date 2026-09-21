import { Test, TestingModule } from '@nestjs/testing';
import { MoodleService } from './moodle.service';
import { ConfigService } from '@nestjs/config';

describe('MoodleService - Category Resolution', () => {
  let service: MoodleService;
  let configServiceMock: any;

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'MOODLE_URL') return 'http://lms.test.htu.edu.gh';
        if (key === 'MOODLE_TOKEN') return 'mock-token';
        if (key === 'MOODLE_MOCK_MODE') return 'false';
        if (key === 'MOODLE_DEFAULT_CATEGORY') return '1';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<MoodleService>(MoodleService);
  });

  describe('resolveCategoryParams', () => {
    it('should resolve AED course codes with 25/26 suffix and semester S1', () => {
      const idnumber = (service as any).resolveCategoryParams('AED 103 25/26', '1');
      expect(idnumber).toBe('FAST_DOAG_25_S1');
    });

    it('should resolve CS course codes with 25/26 suffix and semester S2', () => {
      const idnumber = (service as any).resolveCategoryParams('CS101 25/26', '2');
      expect(idnumber).toBe('FAST_DOCS_25_S2');
    });

    it('should fallback to current date year and semester if year not in code', () => {
      const idnumber = (service as any).resolveCategoryParams('AED 103', '1');
      // The current time is May 2026. Month is May, so year suffix defaults to '25'
      expect(idnumber).toBe('FAST_DOAG_25_S1');
    });

    it('should resolve CLT course codes to FAST_DOCS category', () => {
      const idnumber = (service as any).resolveCategoryParams('CLT112 25/26', '1');
      expect(idnumber).toBe('FAST_DOCS_25_S1');
    });

    it('should fallback to FAST_DOCS if course code prefix is unknown', () => {
      const idnumber = (service as any).resolveCategoryParams('XYZ100 25/26', '1');
      expect(idnumber).toBe('FAST_DOCS_25_S1');
    });
  });
});
