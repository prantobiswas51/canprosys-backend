import { Injectable } from '@nestjs/common';
import { MaintenanceCostsService } from '../maintenance-costs/maintenance-costs.service';
import { PayoutsService } from '../payouts/payouts.service';
import { MaterialConsumptionsService } from '../material-consumptions/material-consumptions.service';
import { ProductsService } from '../products/products.service';
import { WasteSalesService } from '../waste-management/waste-sales.service';
import { round } from '../common/round';

export interface MonthlySummary {
  month: string;
  costs: {
    maintenance: number;
    wages: number;
    materials: number;
    total: number;
  };
  wasteRevenue: number;
  finishedGoods: {
    // Live cost of everything currently sitting in Finished Products stock
    // (Product.stock x each product's current computed costPrice) -- what
    // it would cost to remake what's on the shelf right now, not what was
    // actually spent this month. Includes every product with stock, whether
    // or not a sell price has been set.
    totalCostValue: number;
    // Same idea but restricted to only the products that HAVE a sellPrice
    // set -- this is the cost half of the apples-to-apples pair used for
    // totalProfit below (pricedCostValue vs totalSellValue).
    pricedCostValue: number;
    totalSellValue: number;
    // (totalSellValue + this month's waste revenue) - (pricedCostValue +
    // this month's maintenance cost). Wages/materials aren't subtracted
    // again here since they're already baked into each product's
    // costPrice (pricedCostValue).
    totalProfit: number;
    // Products that have stock right now but no sellPrice set -- their
    // stock is excluded from pricedCostValue/totalSellValue/totalProfit, so
    // this count is shown as a caveat rather than silently understating
    // profit against the full totalCostValue above.
    missingSellPriceCount: number;
  };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthBounds(month: string): { from: string; to: string } {
  const [year, mon] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

@Injectable()
export class AccountingService {
  constructor(
    private maintenanceCostsService: MaintenanceCostsService,
    private payoutsService: PayoutsService,
    private materialConsumptionsService: MaterialConsumptionsService,
    private productsService: ProductsService,
    private wasteSalesService: WasteSalesService,
  ) {}

  async getMonthlySummary(month?: string): Promise<MonthlySummary> {
    const targetMonth = month || currentMonth();
    const { from, to } = monthBounds(targetMonth);

    const [maintenanceCosts, payouts, materialsTotal, products, wasteSales] = await Promise.all([
      this.maintenanceCostsService.getCosts(targetMonth),
      this.payoutsService.getPayouts(targetMonth),
      this.materialConsumptionsService.getMonthlyTotalCost(targetMonth),
      this.productsService.getProducts(),
      this.wasteSalesService.getSales(undefined, from, to),
    ]);

    const maintenanceTotal = round(maintenanceCosts.reduce((sum, c) => sum + c.amount, 0));
    const wagesTotal = round(payouts.reduce((sum, p) => sum + p.amount, 0));
    const wasteRevenue = round(wasteSales.reduce((sum, s) => sum + s.totalAmount, 0));

    let totalCostValue = 0;
    let pricedCostValue = 0;
    let totalSellValue = 0;
    let missingSellPriceCount = 0;
    for (const product of products) {
      if (product.stock <= 0) continue;
      totalCostValue += product.stock * product.costPrice;
      if (product.sellPrice == null) {
        missingSellPriceCount++;
        continue;
      }
      pricedCostValue += product.stock * product.costPrice;
      totalSellValue += product.stock * product.sellPrice;
    }
    totalCostValue = round(totalCostValue);
    pricedCostValue = round(pricedCostValue);
    totalSellValue = round(totalSellValue);

    // (sell value + waste revenue) - (cost value + this month's maintenance).
    const totalProfit = round(totalSellValue + wasteRevenue - (pricedCostValue + maintenanceTotal));

    return {
      month: targetMonth,
      costs: {
        maintenance: maintenanceTotal,
        wages: wagesTotal,
        materials: materialsTotal,
        total: round(maintenanceTotal + wagesTotal + materialsTotal),
      },
      wasteRevenue,
      finishedGoods: {
        totalCostValue,
        pricedCostValue,
        totalSellValue,
        totalProfit,
        missingSellPriceCount,
      },
    };
  }
}
