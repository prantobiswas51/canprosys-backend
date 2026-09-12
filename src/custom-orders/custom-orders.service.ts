import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanvasType, CustomOrder, CustomOrderStatus } from './custom-order.entity';
import { CustomOrderItem } from './custom-order-item.entity';
import { round } from '../common/round';
import { isUniqueViolation } from '../common/is-unique-violation';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';
import { PayoutsService } from '../payouts/payouts.service';

export interface CustomOrderItemInput {
  width: number;
  height: number;
  canvasType: CanvasType;
  quantity: number;
}

export interface CreateCustomOrderInput {
  clientOrderNum: string;
  note?: string | null;
  deadline: string;
  items: CustomOrderItemInput[];
}

export type UpdateCustomOrderInput = Partial<Omit<CreateCustomOrderInput, 'items'>> & {
  status?: CustomOrderStatus;
  // Replaces the order's whole item set when present -- see updateOrder.
  items?: CustomOrderItemInput[];
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
    @InjectRepository(CustomOrderItem)
    private itemRepository: Repository<CustomOrderItem>,
    private materialConsumptionsService: MaterialConsumptionsService,
    private payoutsService: PayoutsService,
  ) {}

  getOrders(status?: CustomOrderStatus) {
    return this.orderRepository.find({
      where: status ? { status } : {},
      relations: ['items'],
      order: { id: 'DESC' },
    });
  }

  async getOrderById(id: number) {
    const order = await this.orderRepository.findOne({ where: { id }, relations: ['items'] });
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
  private validate(data: Partial<Omit<CreateCustomOrderInput, 'items'>>, requireAll: boolean) {
    if (requireAll && !data.clientOrderNum?.trim()) {
      throw new BadRequestException('clientOrderNum is required');
    }
    if (requireAll && !data.deadline) {
      throw new BadRequestException('deadline is required');
    }
  }

  // Same idea for the item rows -- `requireAtLeastOne` is true for create
  // (an order needs at least one canvas) and for update only when the
  // caller actually sent an `items` array to replace.
  private validateItems(items: CustomOrderItemInput[] | undefined, requireAtLeastOne: boolean) {
    if (items == null) {
      if (requireAtLeastOne) {
        throw new BadRequestException('Add at least one item.');
      }
      return;
    }
    if (requireAtLeastOne && items.length === 0) {
      throw new BadRequestException('Add at least one item.');
    }
    for (const item of items) {
      if (!item.width || item.width <= 0) {
        throw new BadRequestException('Each item needs a width greater than zero.');
      }
      if (!item.height || item.height <= 0) {
        throw new BadRequestException('Each item needs a height greater than zero.');
      }
      if (!VALID_CANVAS_TYPES.includes(item.canvasType)) {
        throw new BadRequestException(`canvasType must be one of: ${VALID_CANVAS_TYPES.join(', ')}`);
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException('Each item needs a quantity greater than zero.');
      }
    }
  }

  async createOrder(data: CreateCustomOrderInput) {
    this.validate(data, true);
    this.validateItems(data.items, true);

    const order = this.orderRepository.create({
      clientOrderNum: data.clientOrderNum.trim(),
      note: data.note?.trim() || null,
      deadline: data.deadline,
      status: 'pending',
      items: data.items.map((item) =>
        this.itemRepository.create({
          width: round(item.width),
          height: round(item.height),
          canvasType: item.canvasType,
          quantity: round(item.quantity),
        }),
      ),
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
    this.validateItems(data.items, false);

    if (data.clientOrderNum != null) order.clientOrderNum = data.clientOrderNum.trim();
    if (data.note !== undefined) order.note = data.note?.trim() || null;
    if (data.deadline != null) order.deadline = data.deadline;
    if (data.status != null) {
      if (!VALID_STATUSES.includes(data.status)) {
        throw new BadRequestException(`Invalid status "${data.status}"`);
      }
      order.status = data.status;
    }

    try {
      if (data.items != null) {
        // Replace the whole item set atomically -- simplest correct way to
        // reconcile an edited list (rows added/removed/resized) without
        // diffing old vs new.
        const items = data.items;
        return await this.orderRepository.manager.transaction(async (manager) => {
          const itemRepo = manager.getRepository(CustomOrderItem);
          const orderRepo = manager.getRepository(CustomOrder);
          await itemRepo.delete({ orderId: order.id });
          order.items = items.map((item) =>
            itemRepo.create({
              width: round(item.width),
              height: round(item.height),
              canvasType: item.canvasType,
              quantity: round(item.quantity),
            }),
          );
          return orderRepo.save(order);
        });
      }
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
