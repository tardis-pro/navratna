/**
 * useForceLayout
 * Force-directed physics simulation for positioning constellation nodes.
 * Implements gravity, spring, repulsion, and friction forces without d3.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ForceLayoutConfig } from '@uaip/types';
import { DEFAULT_FORCE_LAYOUT_CONFIG } from '@uaip/types';

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  relevanceScore: number;
  radius: number;
  connections: string[];
  pinned: boolean;
}

interface NodePosition {
  x: number;
  y: number;
}

const VELOCITY_THRESHOLD = 0.01;
const MAX_VELOCITY = 5;

function clampVelocity(v: number): number {
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
}

export function useForceLayout(config: ForceLayoutConfig = DEFAULT_FORCE_LAYOUT_CONFIG) {
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [isSimulating, setIsSimulating] = useState(false);

  const nodesRef = useRef<ForceNode[]>([]);
  const intentCenterRef = useRef<NodePosition>({ x: config.centerX, y: config.centerY });
  const configRef = useRef(config);
  const animFrameRef = useRef<number | null>(null);

  configRef.current = config;

  const applyGravity = useCallback((nodes: ForceNode[]) => {
    const center = intentCenterRef.current;
    const { gravity } = configRef.current;

    for (const node of nodes) {
      if (node.pinned) continue;
      const dx = center.x - node.x;
      const dy = center.y - node.y;
      // Stronger pull for more relevant nodes
      const strength = gravity * node.relevanceScore;
      node.vx += dx * strength * 0.01;
      node.vy += dy * strength * 0.01;
    }
  }, []);

  const applySprings = useCallback((nodes: ForceNode[]) => {
    const { springStrength } = configRef.current;
    const nodeMap = new Map<string, ForceNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    for (const node of nodes) {
      if (node.pinned) continue;
      for (const connId of node.connections) {
        const connected = nodeMap.get(connId);
        if (!connected) continue;

        const dx = connected.x - node.x;
        const dy = connected.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDistance = node.radius + connected.radius + 40;
        const displacement = distance - idealDistance;
        const force = displacement * springStrength * 0.005;

        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        node.vx += fx;
        node.vy += fy;
      }
    }
  }, []);

  const applyRepulsion = useCallback((nodes: ForceNode[]) => {
    const { repulsion } = configRef.current;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.pinned) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy || 1;
        const minDist = a.radius + b.radius + 10;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const force = repulsion * (minDist - dist) / dist;
          const fx = dx * force * 0.5;
          const fy = dy * force * 0.5;

          a.vx += fx;
          a.vy += fy;
          if (!b.pinned) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }
    }
  }, []);

  const tick = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) {
      setIsSimulating(false);
      return;
    }

    const { friction } = configRef.current;

    applyGravity(nodes);
    applySprings(nodes);
    applyRepulsion(nodes);

    let totalEnergy = 0;

    for (const node of nodes) {
      if (node.pinned) continue;
      node.vx = clampVelocity(node.vx * friction);
      node.vy = clampVelocity(node.vy * friction);
      node.x += node.vx;
      node.y += node.vy;
      totalEnergy += node.vx * node.vx + node.vy * node.vy;
    }

    const nextPositions = new Map<string, NodePosition>();
    for (const node of nodes) {
      nextPositions.set(node.id, { x: node.x, y: node.y });
    }
    setPositions(nextPositions);

    if (totalEnergy > VELOCITY_THRESHOLD * nodes.length) {
      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      setIsSimulating(false);
    }
  }, [applyGravity, applySprings, applyRepulsion]);

  const startSimulation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsSimulating(true);
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const setNodes = useCallback((nodes: ForceNode[]) => {
    nodesRef.current = nodes.map((n) => ({ ...n }));
    startSimulation();
  }, [startSimulation]);

  const updateRelevance = useCallback((id: string, relevanceScore: number) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (node) {
      node.relevanceScore = relevanceScore;
      startSimulation();
    }
  }, [startSimulation]);

  const setIntentCenter = useCallback((center: NodePosition) => {
    intentCenterRef.current = center;
    startSimulation();
  }, [startSimulation]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return {
    positions,
    setNodes,
    updateRelevance,
    setIntentCenter,
    isSimulating,
  };
}
