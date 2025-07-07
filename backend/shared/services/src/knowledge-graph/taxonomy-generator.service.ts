import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';
import { KnowledgeItem, KnowledgeType, SourceType } from '@uaip/types';
import { ConceptNode, ConceptRelationship } from './concept-extractor.service.js';
import { DomainOntology } from './ontology-builder.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { ContentClassifier } from './content-classifier.service.js';

export interface TaxonomyCategory {
  id: string;
  name: string;
  description: string;
  level: number;
  parent?: string;
  children: string[];
  keywords: string[];
  examples: string[];
  confidence: number;
  knowledgeItems: string[];
}

export interface ClassificationRule {
  id: string;
  name: string;
  conditions: ClassificationCondition[];
  targetCategory: string;
  confidence: number;
  priority: number;
  description: string;
}

export interface ClassificationCondition {
  type: 'KEYWORD' | 'PATTERN' | 'SEMANTIC' | 'METADATA';
  field: string;
  operator: 'CONTAINS' | 'MATCHES' | 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN';
  value: string | number;
  weight: number;
}

export interface TaxonomyHierarchy {
  rootCategories: TaxonomyCategory[];
  allCategories: Map<string, TaxonomyCategory>;
  depth: Map<string, number>;
  maxDepth: number;
}

export interface KnowledgeTaxonomy {
  id: string;
  domain: string;
  version: string;
  categories: TaxonomyCategory[];
  classification: ClassificationRule[];
  hierarchy: TaxonomyHierarchy;
  metadata: {
    totalCategories: number;
    totalRules: number;
    totalKnowledgeItems: number;
    avgCategoryConfidence: number;
    buildTime: number;
    lastUpdated: Date;
    coverage: number; // percentage of knowledge items classified
  };
}

export interface TaxonomyGenerationResult {
  taxonomy: KnowledgeTaxonomy;
  classificationResults: Map<string, string[]>; // knowledgeItemId -> categoryIds
  unclassifiedItems: string[];
  warnings: string[];
  errors: string[];
  performance: {
    categoryGenerationTime: number;
    ruleGenerationTime: number;
    classificationTime: number;
    totalTime: number;
  };
}

export class TaxonomyGeneratorService {
  private readonly categoryTemplates = {
    'programming': [
      { name: 'Languages', keywords: ['language', 'programming', 'syntax', 'compiler'] },
      { name: 'Frameworks', keywords: ['framework', 'library', 'tool', 'package'] },
      { name: 'Concepts', keywords: ['concept', 'pattern', 'principle', 'methodology'] },
      { name: 'Practices', keywords: ['practice', 'technique', 'approach', 'method'] }
    ],
    'business': [
      { name: 'Strategy', keywords: ['strategy', 'planning', 'goal', 'objective'] },
      { name: 'Operations', keywords: ['process', 'operation', 'workflow', 'procedure'] },
      { name: 'Finance', keywords: ['finance', 'budget', 'cost', 'revenue'] },
      { name: 'Management', keywords: ['management', 'leadership', 'team', 'organization'] }
    ],
    'science': [
      { name: 'Research', keywords: ['research', 'study', 'experiment', 'analysis'] },
      { name: 'Methods', keywords: ['method', 'technique', 'approach', 'protocol'] },
      { name: 'Results', keywords: ['result', 'finding', 'outcome', 'conclusion'] },
      { name: 'Theory', keywords: ['theory', 'hypothesis', 'model', 'framework'] }
    ]
  };

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly contentClassifier: ContentClassifier
  ) {}

  async generateTaxonomy(
    knowledgeItems: KnowledgeItem[],
    domain?: string,
    options?: {
      maxCategories?: number;
      minCategorySize?: number;
      useOntology?: DomainOntology;
      autoClassify?: boolean;
    }
  ): Promise<TaxonomyGenerationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Filter knowledge items by domain if specified
      let items = knowledgeItems;
      if (domain) {
        items = items.filter(item => 
          item.tags.includes(domain) || 
          item.metadata.domain === domain
        );
      }

      if (items.length === 0) {
        throw new Error('No knowledge items provided for taxonomy generation');
      }

      const detectedDomain = domain || this.detectDomain(items);
      logger.info(`Generating taxonomy for domain: ${detectedDomain} with ${items.length} knowledge items`);

      // Step 1: Generate categories
      const categoryStartTime = Date.now();
      const categories = await this.generateCategories(items, detectedDomain, options);
      const categoryGenerationTime = Date.now() - categoryStartTime;

      // Step 2: Generate classification rules
      const ruleStartTime = Date.now();
      const classificationRules = await this.generateClassificationRules(categories, items, detectedDomain);
      const ruleGenerationTime = Date.now() - ruleStartTime;

      // Step 3: Build hierarchy
      const hierarchy = this.buildTaxonomyHierarchy(categories);

      // Step 4: Classify knowledge items
      const classificationStartTime = Date.now();
      const classificationResults = new Map<string, string[]>();
      const unclassifiedItems: string[] = [];

      if (options?.autoClassify !== false) {
        for (const item of items) {
          const categoryIds = await this.classifyKnowledgeItem(item, classificationRules, categories);
          if (categoryIds.length > 0) {
            classificationResults.set(item.id, categoryIds);
            // Update category knowledge items
            for (const categoryId of categoryIds) {
              const category = categories.find(c => c.id === categoryId);
              if (category && !category.knowledgeItems.includes(item.id)) {
                category.knowledgeItems.push(item.id);
              }
            }
          } else {
            unclassifiedItems.push(item.id);
          }
        }
      }

      const classificationTime = Date.now() - classificationStartTime;

      // Step 5: Calculate metadata
      const coverage = ((items.length - unclassifiedItems.length) / items.length) * 100;
      const avgCategoryConfidence = categories.reduce((sum, cat) => sum + cat.confidence, 0) / categories.length;

      // Step 6: Create taxonomy
      const taxonomyId = uuidv4();
      const taxonomy: KnowledgeTaxonomy = {
        id: taxonomyId,
        domain: detectedDomain,
        version: '1.0.0',
        categories,
        classification: classificationRules,
        hierarchy,
        metadata: {
          totalCategories: categories.length,
          totalRules: classificationRules.length,
          totalKnowledgeItems: items.length,
          avgCategoryConfidence,
          buildTime: Date.now() - startTime,
          lastUpdated: new Date(),
          coverage
        }
      };

      // Add warnings for low coverage
      if (coverage < 70) {
        warnings.push(`Low classification coverage: ${coverage.toFixed(1)}%. Consider refining classification rules.`);
      }

      const totalTime = Date.now() - startTime;
      logger.info(`Taxonomy generated successfully for ${detectedDomain}: ${categories.length} categories, ${classificationRules.length} rules, ${coverage.toFixed(1)}% coverage in ${totalTime}ms`);

      return {
        taxonomy,
        classificationResults,
        unclassifiedItems,
        warnings,
        errors,
        performance: {
          categoryGenerationTime,
          ruleGenerationTime,
          classificationTime,
          totalTime
        }
      };

    } catch (error) {
      logger.error('Error generating taxonomy:', error);
      throw new Error(`Taxonomy generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateCategories(
    items: KnowledgeItem[],
    domain: string,
    options?: { maxCategories?: number; minCategorySize?: number; useOntology?: DomainOntology }
  ): Promise<TaxonomyCategory[]> {
    const categories: TaxonomyCategory[] = [];
    const minCategorySize = options?.minCategorySize || 3;
    const maxCategories = options?.maxCategories || 20;

    // Use ontology concepts if available
    if (options?.useOntology) {
      const ontologyCategories = this.createCategoriesFromOntology(options.useOntology);
      categories.push(...ontologyCategories);
    }

    // Use domain templates
    const templates = this.categoryTemplates[domain as keyof typeof this.categoryTemplates];
    if (templates) {
      for (const template of templates) {
        const categoryId = uuidv4();
        const category: TaxonomyCategory = {
          id: categoryId,
          name: template.name,
          description: `Category for ${template.name.toLowerCase()} in ${domain}`,
          level: 0,
          children: [],
          keywords: template.keywords,
          examples: [],
          confidence: 0.8,
          knowledgeItems: []
        };
        categories.push(category);
      }
    }

    // Generate categories from content analysis
    const contentCategories = await this.generateCategoriesFromContent(items, domain);
    categories.push(...contentCategories);

    // Generate categories from tags
    const tagCategories = this.generateCategoriesFromTags(items, domain);
    categories.push(...tagCategories);

    // Merge similar categories
    const mergedCategories = this.mergeSimilarCategories(categories);

    // Filter by minimum size and maximum count
    const filteredCategories = mergedCategories
      .filter(cat => cat.knowledgeItems.length >= minCategorySize || cat.keywords.length > 0)
      .slice(0, maxCategories);

    // Ensure each category has a proper level
    for (const category of filteredCategories) {
      if (category.level === undefined) {
        category.level = 0;
      }
    }

    return filteredCategories;
  }

  private createCategoriesFromOntology(ontology: DomainOntology): TaxonomyCategory[] {
    const categories: TaxonomyCategory[] = [];

    // Create categories from ontology hierarchy
    for (const rootConcept of ontology.hierarchy.rootConcepts) {
      const categoryId = uuidv4();
      const category: TaxonomyCategory = {
        id: categoryId,
        name: rootConcept.name,
        description: rootConcept.definition,
        level: 0,
        children: [],
        keywords: [rootConcept.name, ...rootConcept.synonyms],
        examples: rootConcept.instances,
        confidence: rootConcept.confidence,
        knowledgeItems: []
      };
      categories.push(category);

      // Add child concepts as subcategories
      const children = ontology.hierarchy.hierarchy.get(rootConcept.id) || [];
      for (const childConcept of children) {
        const childCategoryId = uuidv4();
        const childCategory: TaxonomyCategory = {
          id: childCategoryId,
          name: childConcept.name,
          description: childConcept.definition,
          level: 1,
          parent: categoryId,
          children: [],
          keywords: [childConcept.name, ...childConcept.synonyms],
          examples: childConcept.instances,
          confidence: childConcept.confidence,
          knowledgeItems: []
        };
        categories.push(childCategory);
        category.children.push(childCategoryId);
      }
    }

    return categories;
  }

  private async generateCategoriesFromContent(items: KnowledgeItem[], domain: string): Promise<TaxonomyCategory[]> {
    const categories: TaxonomyCategory[] = [];
    const topicMap = new Map<string, KnowledgeItem[]>();

    // Group items by topics from content classification
    for (const item of items) {
      try {
        const classification = await this.contentClassifier.classify(item.content);
        for (const topic of classification.topics) {
          if (!topicMap.has(topic)) {
            topicMap.set(topic, []);
          }
          topicMap.get(topic)!.push(item);
        }
      } catch (error) {
        logger.warn(`Failed to classify content for item ${item.id}:`, error);
      }
    }

    // Create categories from topics
    for (const [topic, relatedItems] of topicMap) {
      if (relatedItems.length >= 2) { // Minimum 2 items per category
        const categoryId = uuidv4();
        const category: TaxonomyCategory = {
          id: categoryId,
          name: this.formatCategoryName(topic),
          description: `Category for ${topic} in ${domain}`,
          level: 0,
          children: [],
          keywords: [topic],
          examples: relatedItems.slice(0, 3).map(item => item.content.substring(0, 100)),
          confidence: 0.7,
          knowledgeItems: relatedItems.map(item => item.id)
        };
        categories.push(category);
      }
    }

    return categories;
  }

  private generateCategoriesFromTags(items: KnowledgeItem[], domain: string): TaxonomyCategory[] {
    const categories: TaxonomyCategory[] = [];
    const tagMap = new Map<string, KnowledgeItem[]>();

    // Group items by tags
    for (const item of items) {
      for (const tag of item.tags) {
        if (tag !== domain && tag.length > 2) { // Exclude domain tag and short tags
          if (!tagMap.has(tag)) {
            tagMap.set(tag, []);
          }
          tagMap.get(tag)!.push(item);
        }
      }
    }

    // Create categories from common tags
    for (const [tag, relatedItems] of tagMap) {
      if (relatedItems.length >= 2) {
        const categoryId = uuidv4();
        const category: TaxonomyCategory = {
          id: categoryId,
          name: this.formatCategoryName(tag),
          description: `Category for items tagged with ${tag}`,
          level: 0,
          children: [],
          keywords: [tag],
          examples: relatedItems.slice(0, 3).map(item => item.content.substring(0, 100)),
          confidence: 0.6,
          knowledgeItems: relatedItems.map(item => item.id)
        };
        categories.push(category);
      }
    }

    return categories;
  }

  private mergeSimilarCategories(categories: TaxonomyCategory[]): TaxonomyCategory[] {
    const merged: TaxonomyCategory[] = [];
    const used = new Set<string>();

    for (const category of categories) {
      if (used.has(category.id)) continue;

      const similar = categories.filter(other => 
        other.id !== category.id && 
        !used.has(other.id) &&
        this.categoriesSimilar(category, other)
      );

      if (similar.length > 0) {
        // Merge similar categories
        const mergedCategory: TaxonomyCategory = {
          ...category,
          keywords: [...new Set([...category.keywords, ...similar.flatMap(s => s.keywords)])],
          examples: [...new Set([...category.examples, ...similar.flatMap(s => s.examples)])],
          knowledgeItems: [...new Set([...category.knowledgeItems, ...similar.flatMap(s => s.knowledgeItems)])],
          confidence: Math.max(category.confidence, ...similar.map(s => s.confidence))
        };

        merged.push(mergedCategory);
        used.add(category.id);
        similar.forEach(s => used.add(s.id));
      } else {
        merged.push(category);
        used.add(category.id);
      }
    }

    return merged;
  }

  private categoriesSimilar(cat1: TaxonomyCategory, cat2: TaxonomyCategory): boolean {
    const commonKeywords = cat1.keywords.filter(k => cat2.keywords.includes(k));
    const commonItems = cat1.knowledgeItems.filter(i => cat2.knowledgeItems.includes(i));
    
    return commonKeywords.length >= 2 || commonItems.length >= 1;
  }

  private buildTaxonomyHierarchy(categories: TaxonomyCategory[]): TaxonomyHierarchy {
    const allCategories = new Map<string, TaxonomyCategory>();
    const depth = new Map<string, number>();
    
    for (const category of categories) {
      allCategories.set(category.id, category);
      depth.set(category.id, category.level);
    }

    const rootCategories = categories.filter(cat => !cat.parent);
    const maxDepth = Math.max(...Array.from(depth.values()));

    return {
      rootCategories,
      allCategories,
      depth,
      maxDepth
    };
  }

  private async generateClassificationRules(
    categories: TaxonomyCategory[],
    items: KnowledgeItem[],
    domain: string
  ): Promise<ClassificationRule[]> {
    const rules: ClassificationRule[] = [];

    for (const category of categories) {
      // Create keyword-based rules
      if (category.keywords.length > 0) {
        const keywordRule: ClassificationRule = {
          id: uuidv4(),
          name: `${category.name} Keyword Rule`,
          conditions: category.keywords.map(keyword => ({
            type: 'KEYWORD',
            field: 'content',
            operator: 'CONTAINS',
            value: keyword,
            weight: 1.0
          })),
          targetCategory: category.id,
          confidence: 0.8,
          priority: 1,
          description: `Classify items containing keywords: ${category.keywords.join(', ')}`
        };
        rules.push(keywordRule);
      }

      // Create tag-based rules
      const tagRule: ClassificationRule = {
        id: uuidv4(),
        name: `${category.name} Tag Rule`,
        conditions: category.keywords.map(keyword => ({
          type: 'METADATA',
          field: 'tags',
          operator: 'CONTAINS',
          value: keyword,
          weight: 1.5
        })),
        targetCategory: category.id,
        confidence: 0.9,
        priority: 2,
        description: `Classify items with relevant tags for ${category.name}`
      };
      rules.push(tagRule);
    }

    return rules;
  }

  private async classifyKnowledgeItem(
    item: KnowledgeItem,
    rules: ClassificationRule[],
    categories: TaxonomyCategory[]
  ): Promise<string[]> {
    const categoryScores = new Map<string, number>();

    for (const rule of rules) {
      const score = this.evaluateClassificationRule(rule, item);
      if (score > 0) {
        const currentScore = categoryScores.get(rule.targetCategory) || 0;
        categoryScores.set(rule.targetCategory, currentScore + score);
      }
    }

    // Return categories with score above threshold
    const threshold = 0.5;
    const matchingCategories = Array.from(categoryScores.entries())
      .filter(([_, score]) => score >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([categoryId, _]) => categoryId);

    return matchingCategories;
  }

  private evaluateClassificationRule(rule: ClassificationRule, item: KnowledgeItem): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const condition of rule.conditions) {
      const conditionScore = this.evaluateCondition(condition, item);
      totalScore += conditionScore * condition.weight;
      totalWeight += condition.weight;
    }

    return totalWeight > 0 ? (totalScore / totalWeight) * rule.confidence : 0;
  }

  private evaluateCondition(condition: ClassificationCondition, item: KnowledgeItem): number {
    let fieldValue: any;

    switch (condition.field) {
      case 'content':
        fieldValue = item.content;
        break;
      case 'tags':
        fieldValue = item.tags;
        break;
      case 'type':
        fieldValue = item.type;
        break;
      case 'confidence':
        fieldValue = item.confidence;
        break;
      default:
        fieldValue = item.metadata[condition.field];
    }

    if (fieldValue === undefined || fieldValue === null) {
      return 0;
    }

    switch (condition.operator) {
      case 'CONTAINS':
        if (Array.isArray(fieldValue)) {
          return fieldValue.some(v => v.toString().toLowerCase().includes(condition.value.toString().toLowerCase())) ? 1 : 0;
        }
        return fieldValue.toString().toLowerCase().includes(condition.value.toString().toLowerCase()) ? 1 : 0;
      
      case 'EQUALS':
        return fieldValue === condition.value ? 1 : 0;
      
      case 'MATCHES':
        const regex = new RegExp(condition.value.toString(), 'i');
        return regex.test(fieldValue.toString()) ? 1 : 0;
      
      case 'GREATER_THAN':
        return Number(fieldValue) > Number(condition.value) ? 1 : 0;
      
      case 'LESS_THAN':
        return Number(fieldValue) < Number(condition.value) ? 1 : 0;
      
      default:
        return 0;
    }
  }

  private detectDomain(items: KnowledgeItem[]): string {
    const tagCounts = new Map<string, number>();
    
    for (const item of items) {
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const mostCommonTag = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return mostCommonTag ? mostCommonTag[0] : 'general';
  }

  private formatCategoryName(name: string): string {
    return name.split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}