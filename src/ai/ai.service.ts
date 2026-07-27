import { Injectable } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionDeclaration,
} from '@google/generative-ai';
import { ProductsService } from '../products/products.service';

// Tool declaration Gemini sees -- name/description/schema only. The actual
// implementation (calling ProductsService) lives below in chat(), Gemini
// never executes anything itself, it just tells us "call this with these args".
const searchProductsDeclaration: FunctionDeclaration = {
  name: 'search_products',
  description:
    'Search the product catalog by (partial, case-insensitive) name. ' +
    'Use this whenever the user asks about product availability, stock, ' +
    'or wants to find a product, e.g. "do you have canvas?" or "search for blue paper".',
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

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;

  constructor(private readonly productsService: ProductsService) {
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
      tools: [{ functionDeclarations: [searchProductsDeclaration] }],
    });

    const chat = model.startChat();
    let result = await chat.sendMessage(message);
    let calls = result.response.functionCalls();

    // Gemini may ask for one or more tool calls; execute them for real and
    // send the results back, repeating until it's satisfied and answers in text.
    while (calls && calls.length > 0) {
      const toolResponses = await Promise.all(
        calls.map(async (call) => {
          if (call.name === 'search_products') {
            const { query } = call.args as { query: string };
            const products = await this.productsService.searchProducts(query);
            return {
              functionResponse: {
                name: call.name,
                response: { products },
              },
            };
          }
          return {
            functionResponse: {
              name: call.name,
              response: { error: `Unknown tool: ${call.name}` },
            },
          };
        }),
      );

      result = await chat.sendMessage(toolResponses);
      calls = result.response.functionCalls();
    }

    return { reply: result.response.text() };
  }
}
