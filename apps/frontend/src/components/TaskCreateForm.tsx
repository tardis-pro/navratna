import React, { useState } from 'react';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectTrigger, SelectValue } from './ui/select';
import { PRIORITY_OPTION_VALUES as _PRIORITY_OPTION_VALUES, TYPE_OPTION_VALUES as _TYPE_OPTION_VALUES } from './TaskDesignTokens';
import { PrioritySelectOptions, TypeSelectOptions } from './TaskSelectOptions';

const INITIAL_FORM_DATA = {
  title: '',
  description: '',
  priority: 'medium',
  type: 'feature',
  dueDate: '',
  estimatedHours: '',
  tags: '',
};

interface TaskCreateFormProps {
  projectId: string;
  onSubmit: (data: unknown) => Promise<void>;
  onClose: () => void;
  formClassName?: string;
  fieldClassName?: string;
  selectContentClassName?: string;
  gridClassName?: string;
  children?: React.ReactNode;
}

export const TaskCreateForm: React.FC<TaskCreateFormProps> = ({
  projectId,
  onSubmit,
  onClose,
  formClassName = 'space-y-4',
  fieldClassName = '',
  selectContentClassName = '',
  gridClassName = 'grid grid-cols-2 gap-2',
  children,
}) => {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...formData,
      projectId,
      dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
      estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
      tags: formData.tags ? formData.tags.split(',').map((tag) => tag.trim()) : undefined,
    });
    setFormData(INITIAL_FORM_DATA);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className={formClassName}>
      <Input
        placeholder="Task title"
        value={formData.title}
        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
        required
        className={fieldClassName}
      />
      <Textarea
        placeholder="Description (optional)"
        value={formData.description}
        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
        rows={3}
        className={fieldClassName}
      />
      <div className={gridClassName}>
        <Select
          value={formData.priority}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
        >
          <SelectTrigger className={fieldClassName}>
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent className={selectContentClassName}>
            <PrioritySelectOptions />
          </SelectContent>
        </Select>
        <Select
          value={formData.type}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value }))}
        >
          <SelectTrigger className={fieldClassName}>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className={selectContentClassName}>
            <TypeSelectOptions />
          </SelectContent>
        </Select>
      </div>
      <div className={gridClassName}>
        <Input
          type="date"
          placeholder="Due date"
          value={formData.dueDate}
          onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
          className={fieldClassName}
        />
        <Input
          type="number"
          placeholder="Estimated hours"
          value={formData.estimatedHours}
          onChange={(e) => setFormData((prev) => ({ ...prev, estimatedHours: e.target.value }))}
          min="0"
          step="0.5"
          className={fieldClassName}
        />
      </div>
      <Input
        placeholder="Tags (comma-separated)"
        value={formData.tags}
        onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
        className={fieldClassName}
      />
      {children}
    </form>
  );
};
