'use client';

import React, { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldProjection, ActionProjection } from '@uaip/types';

type DynamicFormProps = {
  title?: string;
  fields: FieldProjection[];
  data?: Record<string, unknown>;
  actions?: ActionProjection[];
  onAction?: (action: ActionProjection, formValues?: Record<string, unknown>) => void;
};

function buildFieldSchema(field: FieldProjection): z.ZodTypeAny {
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'progress': {
      const base = z.preprocess(
        (v) => (v === '' || v === undefined ? undefined : Number(v)),
        z.number({ invalid_type_error: `${field.label} must be a number` })
      );
      return base;
    }
    case 'date':
      return z.string().min(1, `${field.label} is required`);
    default:
      return z.string();
  }
}

function buildZodSchema(fields: FieldProjection[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.key] = buildFieldSchema(field).optional();
  }
  return z.object(shape);
}

function inputType(fieldType: FieldProjection['type']): string {
  switch (fieldType) {
    case 'number':
    case 'currency':
    case 'progress':
      return 'number';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}

function extractDefaultValues(
  fields: FieldProjection[],
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const f of fields) {
    const parts = f.key.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    defaults[f.key] = current ?? '';
  }
  return defaults;
}

type SubmitActionProps = {
  actions: ActionProjection[];
  onAction?: (action: ActionProjection, formValues?: Record<string, unknown>) => void;
  getValues: () => Record<string, unknown>;
  submitAction: ActionProjection | undefined;
};

function ActionRow({ actions, onAction, getValues, submitAction }: SubmitActionProps) {
  if (actions.length === 0) return null;

  const colorForType = (type: ActionProjection['type']): string => {
    switch (type) {
      case 'approve': return 'bg-emerald-600 hover:bg-emerald-500 text-white';
      case 'reject': return 'bg-red-600 hover:bg-red-500 text-white';
      case 'retry': return 'bg-amber-600 hover:bg-amber-500 text-white';
      case 'skip': return 'bg-zinc-600 hover:bg-zinc-500 text-white';
      case 'custom': return 'bg-blue-600 hover:bg-blue-500 text-white';
      default: return 'bg-zinc-600 hover:bg-zinc-500 text-white';
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((action, idx) => {
        const isSubmit = action === submitAction;
        return (
          <button
            key={`${action.type}-${action.label}-${idx}`}
            type={isSubmit ? 'submit' : 'button'}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${colorForType(action.type)}`}
            onClick={isSubmit ? undefined : () => onAction?.(action, getValues())}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function DynamicForm({ title, fields, data, actions = [], onAction }: DynamicFormProps) {
  const schema = buildZodSchema(fields);
  type FormValues = z.infer<typeof schema>;

  const defaultValues = extractDefaultValues(fields, data);

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as FormValues,
  });

  const submitAction = actions.find((a) => a.type === 'custom' || a.type === 'approve') ?? actions[0];

  const onSubmit = useCallback(
    (values: FormValues) => {
      if (submitAction) {
        onAction?.(submitAction, values as Record<string, unknown>);
      }
    },
    [submitAction, onAction],
  );

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4">
      {title && <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-3">
          {fields.map((field) => {
            const error = errors[field.key];
            return (
              <label key={field.key} className="block">
                <span className="text-xs text-muted-foreground mb-1 block">{field.label}</span>
                <input
                  type={inputType(field.type)}
                  {...register(field.key)}
                  className={`w-full px-3 py-2 text-sm bg-background/80 border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors ${
                    error
                      ? 'border-red-500/60 focus:ring-red-500/40'
                      : 'border-border/50 focus:ring-blue-500/50'
                  }`}
                  placeholder={field.label}
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? `${field.key}-error` : undefined}
                />
                {error && (
                  <span
                    id={`${field.key}-error`}
                    role="alert"
                    className="text-[10px] text-red-400 mt-0.5 block"
                  >
                    {String(error.message ?? 'Invalid value')}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <ActionRow
          actions={actions}
          onAction={onAction}
          getValues={getValues as () => Record<string, unknown>}
          submitAction={submitAction}
        />
      </form>
    </div>
  );
}
