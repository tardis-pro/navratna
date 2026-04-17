import type { VerticalOntology } from '../ontology.schema.js';

export const FINANCE_ONTOLOGY: VerticalOntology = {
  name: 'finance',
  displayName: 'Finance & Accounting',
  version: '0.1.0',
  description:
    'Financial operations vertical: invoicing, budgeting, expense tracking, forecasting.',
  entities: [
    {
      name: 'Invoice',
      uaipPrimitive: 'artifact',
      searchable: true,
      fields: [
        { name: 'invoiceNumber', type: 'string', required: true },
        { name: 'clientId', type: 'reference', required: true, referenceTo: 'persona' },
        { name: 'projectId', type: 'reference', required: true, referenceTo: 'operation' },
        { name: 'amountCents', type: 'number', required: true },
        { name: 'currency', type: 'string', required: true },
        { name: 'dueDate', type: 'date', required: true },
        { name: 'status', type: 'string', required: true },
        { name: 'lineItems', type: 'json', required: false },
      ],
    },
    {
      name: 'Payment',
      uaipPrimitive: 'operation',
      searchable: false,
      fields: [
        { name: 'invoiceId', type: 'reference', required: true, referenceTo: 'Invoice' },
        { name: 'amountCents', type: 'number', required: true },
        { name: 'method', type: 'string', required: true },
        { name: 'paidAt', type: 'date', required: true },
        { name: 'transactionId', type: 'string', required: false },
      ],
    },
    {
      name: 'Budget',
      uaipPrimitive: 'knowledge-item',
      searchable: true,
      fields: [
        { name: 'projectId', type: 'reference', required: true, referenceTo: 'operation' },
        { name: 'periodStart', type: 'date', required: true },
        { name: 'periodEnd', type: 'date', required: true },
        { name: 'totalCents', type: 'number', required: true },
        { name: 'currency', type: 'string', required: true },
        { name: 'categories', type: 'json', required: false },
      ],
    },
    {
      name: 'Expense',
      uaipPrimitive: 'operation',
      searchable: true,
      fields: [
        { name: 'budgetId', type: 'reference', required: true, referenceTo: 'Budget' },
        { name: 'amountCents', type: 'number', required: true },
        { name: 'category', type: 'string', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'incurredAt', type: 'date', required: true },
        { name: 'submittedBy', type: 'reference', required: true, referenceTo: 'persona' },
      ],
    },
    {
      name: 'ForecastScenario',
      uaipPrimitive: 'artifact',
      searchable: true,
      fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'budgetId', type: 'reference', required: true, referenceTo: 'Budget' },
        { name: 'projectedCents', type: 'number', required: true },
        { name: 'assumptions', type: 'json', required: false },
        { name: 'generatedAt', type: 'date', required: true },
      ],
    },
  ],
  relationships: [
    {
      name: 'BELONGS_TO',
      from: 'Invoice',
      to: 'operation',
      cardinality: 'many-to-one',
    },
    {
      name: 'SETTLES',
      from: 'Payment',
      to: 'Invoice',
      cardinality: 'many-to-one',
    },
    {
      name: 'REDUCES',
      from: 'Expense',
      to: 'Budget',
      cardinality: 'many-to-one',
    },
    {
      name: 'PROJECTS',
      from: 'ForecastScenario',
      to: 'Budget',
      cardinality: 'many-to-one',
    },
  ],
  vocabulary: {
    invoice: 'artifact',
    payment: 'operation',
    budget: 'knowledge-item',
    expense: 'operation',
    forecast: 'artifact',
    'financial report': 'knowledge-item',
    payroll: 'operation',
    'accounts receivable': 'knowledge-item',
    'accounts payable': 'knowledge-item',
  },
  mcpTools: [
    {
      name: 'create_invoice',
      description: 'Create an invoice and attach it to a project',
      inputSchema: {
        type: 'object',
        required: ['projectId', 'clientId', 'amountCents', 'currency', 'dueDate'],
        properties: {
          projectId: { type: 'string' },
          clientId: { type: 'string' },
          amountCents: { type: 'number' },
          currency: { type: 'string' },
          dueDate: { type: 'string', format: 'date' },
          lineItems: { type: 'array' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
          invoiceNumber: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
    {
      name: 'query_budget',
      description: 'Retrieve budget state with expense breakdown for a project',
      inputSchema: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string' },
          period: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date' },
              end: { type: 'string', format: 'date' },
            },
          },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          totalCents: { type: 'number' },
          spentCents: { type: 'number' },
          remainingCents: { type: 'number' },
          expensesByCategory: { type: 'object' },
        },
      },
    },
    {
      name: 'run_forecast',
      description: 'Project future cash position from actuals and assumptions',
      inputSchema: {
        type: 'object',
        required: ['budgetId', 'scenarioName'],
        properties: {
          budgetId: { type: 'string' },
          scenarioName: { type: 'string' },
          assumptions: { type: 'object' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          scenarioId: { type: 'string' },
          projectedCents: { type: 'number' },
          projectedAt: { type: 'string' },
        },
      },
    },
    {
      name: 'export_to_csv',
      description: 'Export financial data (invoices, expenses, budget) as CSV',
      inputSchema: {
        type: 'object',
        required: ['entityType', 'projectId'],
        properties: {
          entityType: { type: 'string', enum: ['invoices', 'expenses', 'budget'] },
          projectId: { type: 'string' },
          dateRange: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date' },
              end: { type: 'string', format: 'date' },
            },
          },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          downloadUrl: { type: 'string' },
          rowCount: { type: 'number' },
        },
      },
    },
  ],
  eventTypes: [
    'finance.invoice.created',
    'finance.invoice.paid',
    'finance.invoice.overdue',
    'finance.budget.exceeded',
    'finance.budget.warning',
    'finance.expense.submitted',
    'finance.expense.approved',
    'finance.forecast.generated',
  ],
};
