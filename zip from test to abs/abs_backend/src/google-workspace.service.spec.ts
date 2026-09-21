import { Test, TestingModule } from '@nestjs/testing';
import { GoogleWorkspaceService } from './google-workspace.service';
import { ConfigService } from '@nestjs/config';

describe('GoogleWorkspaceService', () => {
  let service: GoogleWorkspaceService;
  let configServiceMock: any;

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'GOOGLE_WORKSPACE_MOCK_MODE') return 'true';
        if (key === 'GOOGLE_WORKSPACE_DOMAIN') return 'htu.edu.gh';
        if (key === 'GOOGLE_WORKSPACE_ADMIN_EMAIL') return 'barbara@htu.edu.gh';
        return defaultValue || null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleWorkspaceService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<GoogleWorkspaceService>(GoogleWorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('provisionEmail (Mock Mode)', () => {
    it('should generate email correctly in mock mode', async () => {
      const email = await service.provisionEmail('26025228', 'Adzo Amenuku');
      expect(email).toBe('26025228@htu.edu.gh');
    });

    it('should split name correctly and provision', async () => {
      const email = await service.provisionEmail('ABS-INDEX-999', 'John Doe');
      expect(email).toBe('abs-index-999@htu.edu.gh');
    });
  });
});
