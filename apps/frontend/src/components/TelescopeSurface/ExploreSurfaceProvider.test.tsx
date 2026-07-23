import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';
import { ExploreSurfaceProvider, useExploreSurface } from './ExploreSurfaceProvider';

const { buildDynamicBlocks } = vi.hoisted(() => ({
  buildDynamicBlocks: vi.fn().mockResolvedValue([]),
}));

vi.mock('./dynamic_block_registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dynamic_block_registry')>();
  return {
    ...actual,
    buildDynamicBlocks,
    createInitialBlocks: (): MaterializableBlockData[] => [
      {
        id: 'dashboard',
        type: 'portal',
        expression: 'attentive',
        relevanceScore: 1,
        visibility: 'visible',
        position: { x: 0, y: 0, z: 1 },
        dimensions: { width: 400, height: 500 },
        metadata: { title: 'Dashboard' },
      },
    ],
  };
});

const knowledgeBlock: MaterializableBlockData = {
  id: 'knowledge',
  type: 'portal',
  expression: 'attentive',
  relevanceScore: 1,
  visibility: 'visible',
  position: { x: 0, y: 0, z: 1 },
  dimensions: { width: 400, height: 500 },
  metadata: { title: 'Knowledge' },
};

function SurfaceStateProbe() {
  const { surface } = useExploreSurface();
  const navigate = useNavigate();

  return (
    <div>
      <span>Blocks: {surface.blocks.map((block) => block.id).join(',')}</span>
      <button type="button" onClick={() => surface.addBlock(knowledgeBlock)}>
        Add knowledge
      </button>
      <button type="button" onClick={() => navigate('/explore')}>
        Open Explore
      </button>
    </div>
  );
}

describe('ExploreSurfaceProvider', () => {
  it('keeps materialized capability state warm across route changes', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ExploreSurfaceProvider>
          <Routes>
            <Route index element={<SurfaceStateProbe />} />
            <Route path="explore" element={<SurfaceStateProbe />} />
          </Routes>
        </ExploreSurfaceProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(buildDynamicBlocks).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Add knowledge' }));
    expect(screen.getByText('Blocks: dashboard,knowledge')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Explore' }));
    expect(screen.getByText('Blocks: dashboard,knowledge')).toBeInTheDocument();
  });
});
