import { Injectable } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionDeclaration,
} from '@google/generative-ai';
import { ProductsService } from '../products/products.service';
import { RecipesService } from '../recipes/recipes.service';
import { EmployeesService } from '../employees/employees.service';
import { PayoutsService } from '../payouts/payouts.service';
import { MaterialBatchesService } from '../material-batches/material-batches.service';
import { WasteBatchesService } from '../waste-management/waste-batches.service';
import { WasteSalesService } from '../waste-management/waste-sales.service';
import { WoodStockService } from '../wood-processing/wood-stock.service';
import { round } from '../common/round';

// Tool declarations Gemini sees -- name/description/schema only. The actual
// implementation (calling the real services) lives in chat() below; Gemini
// never executes anything itself, it just tells us "call this with these
// args" and we run the real query against the live database.
const searchProductsDeclaration: FunctionDeclaration = {
  name: 'search_products',
  description:
    'Search finished/packaged products by (partial, case-insensitive) name. Returns each ' +
    'match\'s SKU, current stock quantity, and cost price per unit. Use this when the user ' +
    'asks about a specific product by name, e.g. "do you have canvas?" or "how much Canvas 3x4 do we have".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: 'Search term to match against product names, e.g. "canvas"',
      },
    },
    required: ['query'],
  },
};

const finishedProductsStatusDeclaration: FunctionDeclaration = {
  name: 'get_finished_products_status',
  description:
    'List every finished product with its current stock quantity, in-stock/out-of-stock status, ' +
    'and cost price per unit. Use this for broad questions like "what finished products do we have", ' +
    '"what\'s out of stock", or "what\'s our total stock value".',
  parameters: { type: SchemaType.OBJECT, properties: {} },
};

const productCostDeclaration: FunctionDeclaration = {
  name: 'get_product_cost',
  description:
    'Get the full cost breakdown for a finished product, straight from its recipe: each raw ' +
    'material it uses (and how much, at current stock price) and each artisan wage rate that ' +
    'applies, plus the resulting material cost, labor cost, and total cost per unit. Use this ' +
    'whenever the user asks "how much does X cost to make", "what\'s our cost on X", or wants a ' +
    'materials/wages breakdown for a product.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      productQuery: {
        type: SchemaType.STRING,
        description: 'Product name or SKU (partial match ok), e.g. "canvas" or "3x4wb"',
      },
    },
    required: ['productQuery'],
  },
};

const rawMaterialStockDeclaration: FunctionDeclaration = {
  name: 'get_raw_material_stock',
  description:
    'Live stock levels for every raw material AND wood-processing stock (raw wood, sliced ' +
    'wood, and any other wood-pipeline stage output) -- quantity remaining, average unit price, ' +
    'and total stock value for each. Use this for questions like "how much board do we have left", ' +
    '"what\'s our raw wood stock", or "what\'s our raw material stock worth". Optionally filter by name.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: 'Optional partial name filter, e.g. "poly" or "wood". Omit to list everything.',
      },
    },
  },
};

const wasteSummaryDeclaration: FunctionDeclaration = {
  name: 'get_waste_summary',
  description:
    'Current waste stock by type (quantity still on hand) plus recent waste sales and total ' +
    'waste sales revenue. Use this for questions about waste, offcuts, scrap, or "how much have ' +
    'we made selling waste".',
  parameters: { type: SchemaType.OBJECT, properties: {} },
};

const employeesDeclaration: FunctionDeclaration = {
  name: 'get_employees',
  description:
    'List employees (optionally filtered by a partial name/phone match) with their status ' +
    '(active/inactive) and current accrued balance owed (unpaid wages). Use this for general ' +
    '"who works here" / "is X active" / "what does X owe... er, what do we owe X" questions. ' +
    'For a full earnings/payout history for one specific employee, use get_employee_salary instead.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: 'Optional partial name or phone filter. Omit to list everyone.',
      },
    },
  },
};

const employeeSalaryDeclaration: FunctionDeclaration = {
  name: 'get_employee_salary',
  description:
    'Get one employee\'s earnings: current accrued balance owed (unpaid wages), lifetime total ' +
    'earnings, recent payout rows, and -- if a month is given (YYYY-MM) -- that month\'s total ' +
    'payout and entry count. Use this whenever the user asks about a specific employee\'s salary, ' +
    'wages, earnings, or what they\'re owed.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      employeeName: {
        type: SchemaType.STRING,
        description: 'Employee name or phone (partial match ok), e.g. "Karim"',
      },
      month: {
        type: SchemaType.STRING,
        description: 'Optional month in YYYY-MM format, e.g. "2026-08", to get that month\'s total',
      },
    },
    required: ['employeeName'],
  },
};

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly productsService: ProductsService,
    private readonly recipesService: RecipesService,
    private readonly employeesService: EmployeesService,
    private readonly payoutsService: PayoutsService,
    private readonly materialBatchesService: MaterialBatchesService,
    private readonly wasteBatchesService: WasteBatchesService,
    private readonly wasteSalesService: WasteSalesService,
    private readonly woodStockService: WoodStockService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add your real key to .env and restart the server.',
      );
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(message: string) {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        'You are the AI assistant inside a wood-products manufacturing company\'s internal ' +
        'management system. All money figures are in Bangladeshi Taka (৳/BDT). Answer only from ' +
        'the tool results you get back -- never guess a number. If a tool returns no match, say so ' +
        'plainly instead of making something up. Keep answers short and to the point.',
      tools: [
        {
          functionDeclarations: [
            searchProductsDeclaration,
            finishedProductsStatusDeclaration,
            productCostDeclaration,
            rawMaterialStockDeclaration,
            wasteSummaryDeclaration,
            employeesDeclaration,
            employeeSalaryDeclaration,
          ],
        },
      ],
    });

    const chat = model.startChat();
    let result = await chat.sendMessage(message);
    let calls = result.response.functionCalls();

    // Gemini may ask for one or more tool calls; execute them for real and
    // send the results back, repeating until it's satisfied and answers in text.
    while (calls && calls.length > 0) {
      const toolResponses = await Promise.all(
        calls.map(async (call) => {
          try {
            const response = await this.runTool(call.name, call.args as Record<string, unknown>);
            return { functionResponse: { name: call.name, response: { result: response } } };
          } catch (err) {
            return {
              functionResponse: {
                name: call.name,
                response: { error: err instanceof Error ? err.message : 'Tool call failed' },
              },
            };
          }
        }),
      );

      result = await chat.sendMessage(toolResponses);
      calls = result.response.functionCalls();
    }

    return { reply: result.response.text() };
  }

  private async runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'search_products':
        return this.productsService.searchProducts(String(args.query ?? ''));

      case 'get_finished_products_status':
        return this.productsService.getProducts();

      case 'get_product_cost':
        return this.getProductCost(String(args.productQuery ?? ''));

      case 'get_raw_material_stock':
        return this.getRawMaterialStock(args.query ? String(args.query) : undefined);

      case 'get_waste_summary':
        return this.getWasteSummary();

      case 'get_employees':
        return this.employeesService.getEmployees(args.query ? String(args.query) : undefined);

      case 'get_employee_salary':
        return this.getEmployeeSalary(String(args.employeeName ?? ''), args.month ? String(args.month) : undefined);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async getProductCost(productQuery: string) {
    const recipes = await this.recipesService.searchRecipes(productQuery);
    if (recipes.length === 0) {
      return { message: `No recipe found matching "${productQuery}".` };
    }

    return Promise.all(
      recipes.map(async (recipe) => {
        const cost = await this.recipesService.computeUnitCost(recipe);
        return {
          product: recipe.product,
          sku: recipe.sku,
          materialCost: cost.materialCost,
          laborCost: cost.laborCost,
          unitCost: cost.unitCost,
          materials: recipe.materialUsages.map((u) => ({
            name: u.rawMaterialName,
            quantityPerUnit: u.quantity,
            unit: u.rawMaterialUnit,
          })),
          wages: recipe.taskRates.map((t) => ({ task: t.taskName, ratePerUnit: t.rate })),
        };
      }),
    );
  }

  private async getRawMaterialStock(query?: string) {
    const [materials, wood] = await Promise.all([
      this.materialBatchesService.getStockSummary(),
      this.woodStockService.getStockSummary(),
    ]);

    let combined = [
      ...materials.map((m) => ({
        name: m.rawMaterialName,
        unit: m.unit,
        quantityRemaining: m.quantityRemaining,
        averageUnitPrice: m.averageUnitPrice,
        stockValue: m.stockValue,
        category: 'raw_material' as const,
      })),
      ...wood.map((w) => ({
        name: w.woodTypeName,
        unit: w.unit,
        quantityRemaining: w.quantityRemaining,
        averageUnitPrice: w.averageUnitPrice,
        stockValue: w.stockValue,
        category: 'wood' as const,
      })),
    ];

    if (query) {
      const q = query.toLowerCase();
      combined = combined.filter((c) => c.name.toLowerCase().includes(q));
    }

    return combined;
  }

  private async getWasteSummary() {
    const [stock, sales] = await Promise.all([
      this.wasteBatchesService.getStock(),
      this.wasteSalesService.getSales(),
    ]);

    return {
      currentStock: stock,
      totalWasteSalesRevenue: round(sales.reduce((sum, s) => sum + s.totalAmount, 0)),
      recentSales: sales.slice(0, 10).map((s) => ({
        wasteType: s.wasteTypeName,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        totalAmount: s.totalAmount,
        saleDate: s.saleDate,
        buyer: s.buyer,
      })),
    };
  }

  private async getEmployeeSalary(employeeName: string, month?: string) {
    const result = await this.payoutsService.getEmployeeEarnings(employeeName, month);
    if (!result) {
      return { message: `No employee found matching "${employeeName}".` };
    }
    return result;
  }
}
