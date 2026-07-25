import { Test, TestingModule } from '@nestjs/testing';
import { RawmaterialsController } from './rawmaterials.controller';

describe('RawmaterialsController', () => {
  let controller: RawmaterialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RawmaterialsController],
    }).compile();

    controller = module.get<RawmaterialsController>(RawmaterialsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
