import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { Shipment, ShipmentStatus } from './shipment.entity';
import { ShipmentItem } from './shipment-item.entity';
import { Route } from '../routes/route.entity';
import { Car } from '../cars/car.entity';
import { Driver } from '../drivers/driver.entity';
import { Product } from '../products/product.entity';

export interface ShipmentItemInput {
  productId: number;
  quantity: number;
}

export interface CreateShipmentInput {
  routeId: number;
  carId: number;
  driverId: number;
  note?: string;
  totalCost?: number;
  items: ShipmentItemInput[];
}

const RELATIONS = ['route', 'car', 'driver', 'items'];

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private shipmentRepository: Repository<Shipment>,
    @InjectRepository(Route) private routeRepository: Repository<Route>,
    @InjectRepository(Car) private carRepository: Repository<Car>,
    @InjectRepository(Driver) private driverRepository: Repository<Driver>,
    @InjectRepository(Product) private productRepository: Repository<Product>,
  ) {}

  // invoiceNumber: partial, case-insensitive match. date: YYYY-MM-DD,
  // matches shipments created that calendar day (Asia/Dhaka, same as the
  // rest of the app -- see main.ts's TZ setting).
  getShipments(invoiceNumber?: string, date?: string) {
    const where: FindOptionsWhere<Shipment> = {};

    if (invoiceNumber?.trim()) {
      where.invoiceNumber = ILike(`%${invoiceNumber.trim()}%`);
    }

    if (date?.trim()) {
      const start = new Date(`${date.trim()}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.createdAt = Between(start, end);
    }

    return this.shipmentRepository.find({
      where,
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
    });
  }

  async getShipmentById(id: number) {
    const shipment = await this.shipmentRepository.findOne({ where: { id }, relations: RELATIONS });
    if (!shipment) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }
    return shipment;
  }

  // Creating a shipment: pick a route/car/driver, pick one or more finished
  // products with a quantity each -- this both records the shipment and
  // deducts that quantity from Product.stock, flagging the shipment
  // IN_TRANSIT. All validation happens up front (fail fast, before writing
  // anything); the actual writes run in one transaction so a problem
  // partway through can't leave stock half-deducted.
  async createShipment(data: CreateShipmentInput) {
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('Select at least one product to ship');
    }

    const route = await this.routeRepository.findOneBy({ id: data.routeId });
    if (!route) {
      throw new NotFoundException('Route not found');
    }

    const car = await this.carRepository.findOneBy({ id: data.carId });
    if (!car) {
      throw new NotFoundException('Car not found');
    }

    const driver = await this.driverRepository.findOneBy({ id: data.driverId });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const productIds = data.items.map((item) => item.productId);
    const products = await this.productRepository.findBy({ id: In(productIds) });
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const item of data.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException('Each product quantity must be greater than zero');
      }
      const product = productById.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product #${item.productId} not found`);
      }
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Not enough stock for "${product.name}": requested ${item.quantity}, only ${product.stock} available`,
        );
      }
    }

    return this.shipmentRepository.manager.transaction(async (manager) => {
      const invoiceNumber = await this.generateUniqueInvoiceNumber(manager.getRepository(Shipment));

      const shipment = manager.create(Shipment, {
        routeId: route.id,
        carId: car.id,
        driverId: driver.id,
        invoiceNumber,
        note: data.note,
        totalCost: data.totalCost,
        status: ShipmentStatus.IN_TRANSIT,
      });
      const savedShipment = await manager.save(shipment);

      for (const item of data.items) {
        const product = productById.get(item.productId)!;

        const shipmentItem = manager.create(ShipmentItem, {
          shipmentId: savedShipment.id,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
        });
        await manager.save(shipmentItem);

        // Re-fetch inside the transaction (rather than mutating the
        // already-loaded `product`) so two shipments created at the same
        // moment against the same product can't both read stale stock and
        // both "succeed" while overdrawing it.
        const freshProduct = await manager.findOneByOrFail(Product, { id: product.id });
        freshProduct.stock -= item.quantity;
        if (freshProduct.stock < 0) {
          throw new BadRequestException(
            `Not enough stock for "${product.name}" -- it was just reduced by another shipment. Try again.`,
          );
        }
        await manager.save(freshProduct);
      }

      return manager.findOne(Shipment, { where: { id: savedShipment.id }, relations: RELATIONS });
    });
  }

  // SHP-<10 random digits>, e.g. SHP-4827193056. Not user-entered -- every
  // shipment gets one automatically. Collision odds are ~1 in 10 billion,
  // but check-and-retry anyway rather than trust that.
  private async generateUniqueInvoiceNumber(shipmentRepository: Repository<Shipment>) {
    let invoiceNumber: string;
    let exists: Shipment | null;
    do {
      const digits = Math.floor(1_000_000_000 + Math.random() * 9_000_000_000);
      invoiceNumber = `SHP-${digits}`;
      exists = await shipmentRepository.findOneBy({ invoiceNumber });
    } while (exists);
    return invoiceNumber;
  }
}
