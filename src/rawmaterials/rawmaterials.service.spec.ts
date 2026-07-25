import { Test, TestingModule } from '@nestjs/testing';
import { RawmaterialsService } from './rawmaterials.service';

describe('RawmaterialsService', () => {
  let service: RawmaterialsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RawmaterialsService],
    }).compile();

    service = module.get<RawmaterialsService>(RawmaterialsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
