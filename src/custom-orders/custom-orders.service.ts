import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanvasType, CustomOrder, CustomOrderStatus } from './custom-order.entity';
import { round } from '../common/round';
import { isUniqueViolation } from '../common/is-unique-violation';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';
import { PayoutsService } from '../payouts/payouts.service';

export interface CreateCustomOrderInput {
  clientOrderNum: string;
  width: number;
  height: number;
  note?: string | null;
  canvasType: CanvasType;
  deadline: string;
}

export type UpdateCustomOrderInput = Partial<CreateCustomOrderInput> & {
  status?: CustomOrderStatus;
};

export interface CompleteOrderMaterialInput {
  rawMaterialId: number;
  quantity: number;
}

export interface CompleteOrderLaborInput {
  employeeId: number;
  taskId: number;
  quantity: number;
  rate?: number;
}

export interface CompleteOrderInput {
  materials: CompleteOrderMaterialInput[];
  labor: CompleteOrderLaborInput[];
}

const VALID_CANVAS_TYPES: CanvasType[] = ['circle', 'square'];
const VALID_STATUSES: CustomOrderStatus[] = ['pending', 'in_progress', 'completed'];

@Injectable()
export class CustomOrdersService {
  constructor(
    @InjectRepository(CustomOrder)
    private orderRepository: Repository<CustomOrder>,
    private materialConsumptionsService: MaterialConsumptionsService,
    private payoutsService: PayoutsService,
  ) {}

  getOrders(status?: CustomOrderStatus) {
    return this.orderRepository.find({
      where: status ? { status } : {},
      order: { id: 'DESC' },
    });
  }

  async getOrderById(id: number) {
    const order = await this.orderRepository.findOneBy({ id });
    if (!order) {
      throw new NotFoundException(`Custom order #${id} not found`);
    }
    return order;
  }

  // Shared field-level validation for both create and update -- only checks
  // whatever's actually present on `data`, so a partial update (e.g. just
  // changing status) doesn't get tripped up demanding fields it isn't
  // touching. `requireAll` additionally demands the fields a brand new
  // order can't do without.
  private validate(data: Partial<CreateCustomOrderInput>, requireAll: boolean) {
    if (requireAll && !data.clientOrderNum?.trim()) {
      throw new BadRequestException('clientOrderNum is required');
    }
    if (data.width != null && data.width <= 0) {
      throw new BadRequestException('Width must be greater than zero');
    }
    if (requireAll && data.width == null) {
      throw new BadRequestException('Width is required');
    }
    if (data.height != null && data.height <= 0) {
      throw new BadRequestException('Height must be greater than zero');
    }
    if (requireAll && data.height == null) {
      throw new BadRequestException('Height is required');
    }
    if (data.canvasType != null && !VALID_CANVAS_TYPES.includes(data.canvasType)) {
      throw new BadRequestException(`canvasType must be one of: ${VALID_CANVAS_TYPES.join(', ')}`);
    }
    if (requireAll && data.canvasType == null) {
      throw new BadRequestException('canvasType is required');
    }
    if (requireAll && !data.deadline) {
      throw new BadRequestException('deadline is required');
    }
  }

  async createOrder(data: CreateCustomOrderInput) {
    this.validate(data, true);

    const order = this.orderRepository.create({
      clientOrderNum: data.clientOrderNum.trim(),
      width: round(data.width),
      height: round(data.height),
      note: data.note?.trim() || null,
      canvasType: data.canvasType,
      deadline: data.deadline,
      status: 'pending',
    });
    try {
      return await this.orderRepository.save(order);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Order "${data.clientOrderNum}" already exists.`);
      }
      throw err;
    }
  }

  async updateOrder(id: number, data: UpdateCustomOrderInput) {
    const order = await this.getOrderById(id);
    this.validate(data, false);

    if (data.clientOrderNum != null) order.clientOrderNum = data.clientOrderNum.trim();
    if (data.width != null) order.width = round(data.width);
    if (data.height != null) order.height = round(data.height);
    if (data.note !== undefined) order.note = data.note?.trim() || null;
    if (data.canvasType != null) order.canvasType = data.canvasType;
    if (data.deadline != null) order.deadline = data.deadline;
    if (data.status != null) {
      if (!VALID_STATUSES.includes(data.status)) {
        throw new BadRequestException(`Invalid status "${data.status}"`);
      }
      order.status = data.status;
    }

    try {
      return await this.orderRepository.save(order);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Order "${order.clientOrderNum}" already exists.`);
      }
      throw err;
    }
  }

  async deleteOrder(id: number) {
    const order = await this.getOrderById(id);
    await this.orderRepository.remove(order);
    return { deleted: true };
  }

  // "Complete" an order: cuts each listed raw material off real stock (FIFO,
  // same as a daily entry's BOM consumption) and pays each listed employee
  // for the task they did on it, then marks the order completed -- all in
  // one transaction, so a bad row (not enough stock, no rate on a task)
  // rolls back everything instead of leaving half the order processed.
  async completeOrder(id: number, data: CompleteOrderInput) {
    const order = await this.getOrderById(id);
    if (order.status === 'completed') {
      throw new ConflictException(`Order "${order.clientOrderNum}" is already completed.`);
    }

    const materials = data.materials ?? [];
    const labor = data.labor ?? [];
    if (materials.length === 0 && labor.length === 0) {
      throw new BadRequestException('Add at least one material or labor row before completing.');
    }
    for (const m of materials) {
      if (!m.rawMaterialId || !m.quantity || m.quantity <= 0) {
        throw new BadRequestException('Each material row needs a raw material and a quantity greater than zero.');
      }
    }
    for (const l of labor) {
      if (!l.employeeId || !l.taskId || !l.quantity || l.quantity <= 0) {
        throw new BadRequestException('Each labor row needs an employee, a task, and a quantity greater than zero.');
      }
    }

    return this.orderRepository.manager.transaction(async (manager) => {
      for (const m of materials) {
        await this.materialConsumptionsService.recordConsumption(
          {
            rawMaterialId: m.rawMaterialId,
            quantity: m.quantity,
            note: `Custom order ${order.clientOrderNum}`,
            customOrderId: order.id,
          },
          manager,
        );
      }

      for (const l of labor) {
        await this.payoutsService.createTaskPayout(
          {
            employeeId: l.employeeId,
            taskId: l.taskId,
            quantity: l.quantity,
            rate: l.rate,
            customOrderId: order.id,
          },
          manager,
        );
      }

      const orderRepository = manager.getRepository(CustomOrder);
      order.status = 'completed';
      return orderRepository.save(order);
    });
  }
}
