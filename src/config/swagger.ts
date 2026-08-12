export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Reneo Marketplace API',
    version: '1.0.0',
    description:
      'Backend API for the Reneo marketplace assessment. Authenticate with Supabase JWT via Bearer token.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Supabase access token',
      },
    },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'OUT_OF_STOCK' },
              message: { type: 'string', example: 'Insufficient inventory' },
            },
          },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          store_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          category: { type: 'string' },
          price_minor: { type: 'integer', description: 'Price in minor currency units (FCFA)' },
          is_archived: { type: 'boolean' },
          quantity: { type: 'integer' },
          available: { type: 'boolean' },
          store_name: { type: 'string', nullable: true },
          seller_name: { type: 'string', nullable: true },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/products': {
      get: {
        summary: 'List and search products',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'minPrice', in: 'query', schema: { type: 'integer' } },
          { name: 'maxPrice', in: 'query', schema: { type: 'integer' } },
          { name: 'available', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['price_asc', 'price_desc', 'created_at_asc', 'created_at_desc', 'name_asc', 'name_desc'],
            },
          },
          { name: 'mine', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          200: { description: 'Paginated product list' },
          401: { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
      post: {
        summary: 'Create product (SELLER)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'category', 'price_minor'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  category: { type: 'string' },
                  price_minor: { type: 'integer', example: 50000 },
                  quantity: { type: 'integer', example: 10 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Product created' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/products/{id}': {
      get: {
        summary: 'Get product by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Product details' }, 404: { description: 'Not found' } },
      },
      patch: {
        summary: 'Update product (SELLER, own products only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Updated product' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        summary: 'Archive product (SELLER, soft delete)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Archived' }, 403: { description: 'Forbidden' } },
      },
    },
    '/orders': {
      post: {
        summary: 'Create order (CUSTOMER)',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string' },
            description: 'Unique key per logical order attempt',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: {
                items: [{ product_id: '00000000-0000-4000-8000-000000000001', quantity: 2 }],
              },
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['product_id', 'quantity'],
                      properties: {
                        product_id: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer', minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Order created' },
          409: {
            description: 'Out of stock or idempotency conflict',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
        },
      },
    },
  },
} as const;
